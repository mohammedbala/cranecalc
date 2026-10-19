/**
 * The drawing as a full AutoCAD 2000 (AC1015) DXF: layers, linetypes, text and dimension styles, blocks with
 * attribute definitions, block references with attributes, groups, and every entity as its DXF counterpart
 * (LWPOLYLINE with bulges, ELLIPSE, SPLINE, XLINE, RAY, MTEXT, DIMENSION with its anonymous block, LEADER, HATCH,
 * VIEWPORT). A sheet with model space writes the sheet to the layout (paper space) and the model to model space;
 * otherwise the sheet is model space at paper size, as the drawing set. dxfImport.ts reads it back.
 */
import {primEnts,primitives,standardDimStyle,standardTextStyle,type DimStyle,type TextStyle} from './annotation';
import {hatchPatterns} from './hatch';
import {linePatterns} from './convert';
import {
 DEG,bbox,ellipseSweep,lineTypes,unitScale,
 type BlockDef,type CadDoc,type CadLayer,type DimEnt,type Ent,type LineType,type NewEnt,type Pt,
} from './model';

const r=(v:number)=>{const s=Number(v.toFixed(8));return Object.is(s,-0)?0:s;};
const symbols:Record<string,string>={'°':'%%d','±':'%%p','Ø':'%%c','⌀':'%%c'};
/** DXF text: drafting symbols as %% codes, other non-ASCII as \U+XXXX; a literal %% as two %%% (one percent each). */
export const dxfText=(t:string)=>t.replace(/[\r\n]/g,' ').replace(/%%/g,'%%%%%%').replace(/[^\x20-\x7e]/g,c=>symbols[c]??`\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')}`);
const mtextValue=(t:string)=>t.split('\n').map(l=>dxfText(l).replace(/\\(?!U\+)/g,'\\\\').replace(/[{}]/g,c=>`\\${c}`)).join('\\P');
const fontFile:Record<string,string>={Arial:'arial.ttf','Arial Narrow':'arialn.ttf','Times New Roman':'times.ttf','Courier New':'cour.ttf'};

export interface DxfOptions{
 /** Drawing units per DXF unit is 1; k scales everything (a sketch's units to real inches or millimeters). */
 k?:number;
}
export function writeDxf(doc:CadDoc,opts:DxfOptions={}):string{
 const k=opts.k??1,P=(p:Pt):Pt=>[p[0]*k,p[1]*k];
 const layout=!!doc.model&&doc.entities.some(e=>e.type==='viewport');
 const modelEnts=layout?doc.model!.entities:doc.entities,paperEnts=layout?doc.entities:[];
 let handle=0;const next=()=>(++handle).toString(16).toUpperCase();
 const H={blockRecordTable:next(),layerTable:next(),styleTable:next(),ltypeTable:next(),viewTable:next(),ucsTable:next(),vportTable:next(),appidTable:next(),dimstyleTable:next(),
  model:next(),paper:next(),modelLayout:next(),paperLayout:next(),root:next(),groups:next(),layouts:next(),plotStyles:next(),placeholder:next()};
 const body:(string|number)[]=[],put=(...pairs:(string|number)[])=>{for(const v of pairs)body.push(v);};
 const table=(name:string,h:string,count:number,extra:(string|number)[]=[])=>put(0,'TABLE',2,name,5,h,330,0,100,'AcDbSymbolTable',70,count,...extra);
 const record=(type:string,owner:string,subclass:string,...pairs:(string|number)[])=>{const h=next();put(0,type,5,h,330,owner,100,'AcDbSymbolTableRecord',100,subclass,...pairs);return h;};
 const us=doc.display==='US',unitIn=doc.unit==='in'||(doc.unit==='unit'&&us);

 // ---- tables ----
 put(0,'SECTION',2,'CLASSES',0,'ENDSEC',0,'SECTION',2,'TABLES');
 table('VPORT',H.vportTable,1);
 record('VPORT',H.vportTable,'AcDbViewportTableRecord',2,'*Active',70,0,10,0,20,0,11,1,21,1,12,r(doc.width*k/2),22,r(doc.height*k/2),13,0,23,0,14,.5,24,.5,15,.5,25,.5,16,0,26,0,36,1,17,0,27,0,37,0,40,r(doc.height*k*1.1),41,r(Math.max(1.2,doc.width/doc.height)),42,50,43,0,44,0,50,0,51,0,71,0,72,1000,73,1,74,3,75,0,76,0,77,0,78,0,281,0,65,0,146,0);
 put(0,'ENDTAB');
 // Linetypes: patterns in paper inches, scaled to the file's units.
 const usedLt=new Set<LineType>(['Continuous',...doc.layers.map(l=>l.ltype),...[...modelEnts,...paperEnts,...(doc.blocks??[]).flatMap(b=>b.entities)].flatMap(e=>e.ltype?[e.ltype]:[])]);
 const ltScale=(doc.unit==='mm'||(doc.unit==='unit'&&!us)?25.4:1)*(doc.unit==='unit'?1:1);
 table('LTYPE',H.ltypeTable,usedLt.size+2);
 for(const name of ['ByBlock','ByLayer'])record('LTYPE',H.ltypeTable,'AcDbLinetypeTableRecord',2,name,70,0,3,'',72,65,73,0,40,0);
 for(const name of lineTypes.filter(l=>usedLt.has(l))){
  const segs=linePatterns[name].pattern.map((v,i)=>(i%2?-v:v)*ltScale);
  record('LTYPE',H.ltypeTable,'AcDbLinetypeTableRecord',2,name,70,0,3,linePatterns[name].description,72,65,73,segs.length,40,r(segs.reduce((a,v)=>a+Math.abs(v),0)));
  for(const s of segs)put(49,r(s),74,0);
 }
 put(0,'ENDTAB');
 const layerNames=new Set(doc.layers.map(l=>l.name));
 const allLayers:CadLayer[]=[...doc.layers.some(l=>l.name==='0')?[]:[{name:'0',color:7,ltype:'Continuous' as LineType,weight:25,visible:true,locked:false}],...doc.layers];
 table('LAYER',H.layerTable,allLayers.length);
 // A layer that is off has a negative color; a locked layer has flag 4.
 for(const l of allLayers)record('LAYER',H.layerTable,'AcDbLayerTableRecord',2,l.name,70,l.locked?4:0,62,l.visible?l.color:-l.color,6,l.ltype,370,l.weight,390,H.placeholder);
 put(0,'ENDTAB');
 const texts:TextStyle[]=[standardTextStyle,...(doc.textStyles??[]).filter(t=>t.name!=='Standard')];
 const stdText=doc.textStyles?.find(t=>t.name==='Standard')??standardTextStyle;texts[0]=stdText;
 table('STYLE',H.styleTable,texts.length+1);
 for(const t of texts)record('STYLE',H.styleTable,'AcDbTextStyleTableRecord',2,t.name,70,0,40,r(t.height*k),41,r(t.widthFactor),50,r(t.oblique),71,0,42,r((us?.125:2.5)*k),3,fontFile[t.font]??'arial.ttf',4,'');
 record('STYLE',H.styleTable,'AcDbTextStyleTableRecord',2,'ARIAL-BOLD',70,0,40,0,41,1,50,0,71,0,42,r((us?.125:2.5)*k),3,'arialbd.ttf',4,'');
 put(0,'ENDTAB');
 table('VIEW',H.viewTable,0);put(0,'ENDTAB');
 table('UCS',H.ucsTable,0);put(0,'ENDTAB');
 table('APPID',H.appidTable,1);record('APPID',H.appidTable,'AcDbRegAppTableRecord',2,'ACAD',70,0);put(0,'ENDTAB');
 const dims:DimStyle[]=[doc.dimStyles?.find(d=>d.name==='Standard')??standardDimStyle(doc.unit),...(doc.dimStyles??[]).filter(d=>d.name!=='Standard')];
 table('DIMSTYLE',H.dimstyleTable,dims.length,[100,'AcDbDimStyleTable']);
 const arrowBlk:Record<string,string>={closed:'',open:'_OPEN',tick:'_ARCHTICK',dot:'_DOT',none:'_NONE'};
 for(const d of dims)put(0,'DIMSTYLE',105,next(),330,H.dimstyleTable,100,'AcDbSymbolTableRecord',100,'AcDbDimStyleTableRecord',2,d.name,70,0,3,d.prefix||d.suffix?`${d.prefix??''}<>${d.suffix??''}`:'',
  40,r(d.scale),41,r(d.arrowSize*k),42,r(d.extOffset*k),43,r(d.baseline*k),44,r(d.extBeyond*k),140,r(d.textHeight*k),147,r(d.textGap*k),77,d.textPos==='above'?1:0,
  271,us&&d.units==='arch'?Math.round(Math.log2(d.precision)):d.precision,277,us&&d.units==='arch'?4:2,...(arrowBlk[d.arrow]?[5,arrowBlk[d.arrow]]:[]));
 put(0,'ENDTAB');

 // ---- block records ----
 const blocks=doc.blocks??[],dimBlocks:{name:string;ents:NewEnt[]}[]=[];
 const blockHandles=new Map<string,string>();
 // Anonymous blocks for the dimensions' graphics (*D1, *D2 ...), which AutoCAD draws.
 const dimBlockOf=(e:DimEnt)=>{const name=`*D${dimBlocks.length+1}`;dimBlocks.push({name,ents:primEnts(primitives(e,doc)??[],{layer:'0'})});return name;};
 const dimNames=new Map<Ent,string>();
 for(const e of [...modelEnts,...paperEnts])if(e.type==='dim')dimNames.set(e,dimBlockOf(e));
 table('BLOCK_RECORD',H.blockRecordTable,2+blocks.length+dimBlocks.length);
 put(0,'BLOCK_RECORD',5,H.model,330,H.blockRecordTable,100,'AcDbSymbolTableRecord',100,'AcDbBlockTableRecord',2,'*Model_Space',340,H.modelLayout);
 put(0,'BLOCK_RECORD',5,H.paper,330,H.blockRecordTable,100,'AcDbSymbolTableRecord',100,'AcDbBlockTableRecord',2,'*Paper_Space',340,H.paperLayout);
 for(const b of [...blocks.map(b=>b.name),...dimBlocks.map(d=>d.name)]){const h=next();blockHandles.set(b,h);put(0,'BLOCK_RECORD',5,h,330,H.blockRecordTable,100,'AcDbSymbolTableRecord',100,'AcDbBlockTableRecord',2,b);}
 put(0,'ENDTAB',0,'ENDSEC');

 // ---- entities ----
 let lo:Pt=[Infinity,Infinity],hi:Pt=[-Infinity,-Infinity];
 const grow=(e:Ent)=>{const b=bbox(e,doc);if(!Number.isFinite(b[0])||Math.abs(b[0])>1e5)return;lo=[Math.min(lo[0],b[0]*k),Math.min(lo[1],b[1]*k)];hi=[Math.max(hi[0],b[2]*k),Math.max(hi[1],b[3]*k)];};
 const entHandles=new Map<number,string>();
 // Groups: their handles first, so each member can name its group (the persistent reactor AutoCAD expects).
 const groupList=(doc.groups??[]).map(g=>({g,h:next()})),reactor=new Map<number,string[]>();
 for(const {g,h} of groupList)for(const m of g.ids)reactor.set(m,[...(reactor.get(m)??[]),h]);
 const emit=(e:Ent|NewEnt,owner:string,paper:boolean,track=true)=>{
  const id='id' in e?(e as Ent).id:undefined;
  const base=(type:string,subclass:string)=>{const h=next();if(id!==undefined&&track)entHandles.set(id,h);
   const re=id!==undefined&&track?reactor.get(id):undefined;
   put(0,type,5,h,...(re?[102,'{ACAD_REACTORS',...re.flatMap(x=>[330,x]),102,'}']:[]),330,owner,100,'AcDbEntity',...(paper?[67,1]:[]),8,layerNames.has(e.layer)||e.layer==='0'?e.layer:'0',...(e.ltype?[6,e.ltype]:[]),...(e.color!==undefined?[62,e.color]:[]),...(e.weight!==undefined?[370,e.weight]:[]),...(e.ltscale!==undefined?[48,r(e.ltscale)]:[]),100,subclass);return h;};
  const pt=(c:number,p:Pt)=>{const q=P(p);put(c,r(q[0]),c+10,r(q[1]),c+20,0);};
  const textEnt=(type:'TEXT'|'ATTRIB'|'ATTDEF',at:Pt,height:number,value:string,angle:number,align:number,style:string|undefined,bold:boolean,extra:(string|number)[]=[],after:(string|number)[]=[])=>{
   base(type,'AcDbText');pt(10,at);put(40,r(height*k),1,dxfText(value),50,r(angle),7,style??(bold?'ARIAL-BOLD':'Standard'),72,align);pt(11,at);
   put(...extra);if(type!=='ATTDEF')put(100,type==='ATTRIB'?'AcDbAttribute':'AcDbText',...(type==='TEXT'?[73,0]:[]),...after);else put(100,'AcDbAttributeDefinition',...after);
  };
  switch(e.type){
   case 'line':base('LINE','AcDbLine');pt(10,e.a);pt(11,e.b);break;
   case 'poly':{
    base('LWPOLYLINE','AcDbPolyline');put(90,e.points.length,70,e.closed?1:0,43,0);
    e.points.forEach((p,i)=>{const q=P(p);put(10,r(q[0]),20,r(q[1]));const b=e.bulges?.[i];if(b)put(42,r(b));});break;
   }
   case 'solid':{base('SOLID','AcDbTrace');const [a,b,c,d=c]=e.points;pt(10,a);pt(11,b);pt(12,d);pt(13,c);break;}
   case 'circle':base('CIRCLE','AcDbCircle');pt(10,e.center);put(40,r(e.radius*k));break;
   case 'arc':base('ARC','AcDbCircle');pt(10,e.center);put(40,r(e.radius*k),100,'AcDbArc',50,r(e.start),51,r(e.end));break;
   case 'ellipse':{base('ELLIPSE','AcDbEllipse');pt(10,e.center);put(11,r(e.major[0]*k),21,r(e.major[1]*k),31,0,210,0,220,0,230,1,40,r(e.ratio));const full=ellipseSweep(e)>=360;const rad=(v:number)=>Number(v.toFixed(12));put(41,full?0:rad(e.start*DEG),42,full?rad(2*Math.PI):rad((e.start+ellipseSweep(e))*DEG));break;}
   case 'spline':{
    base('SPLINE','AcDbSpline');put(210,0,220,0,230,1,70,(e.closed?1:0)|8|(e.fit?0:0),71,e.degree,72,e.knots.length,73,e.ctrl.length,74,e.fit?.length??0,42,1e-10,43,1e-10,44,1e-10);
    for(const kn of e.knots)put(40,r(kn));for(const p of e.ctrl)pt(10,p);for(const p of e.fit??[])pt(11,p);break;
   }
   case 'xline':case 'ray':base(e.type==='xline'?'XLINE':'RAY',e.type==='xline'?'AcDbXline':'AcDbRay');pt(10,e.base);put(11,r(e.dir[0]),21,r(e.dir[1]),31,0);break;
   case 'text':textEnt('TEXT',e.at,e.height,e.value,e.angle,e.align,e.style,e.bold);break;
   case 'attdef':textEnt('ATTDEF',e.at,e.height,e.value,e.angle,e.align,e.style,false,[],[3,dxfText(e.prompt),2,e.tag,70,e.invisible?1:0,74,0]);break;
   case 'mtext':base('MTEXT','AcDbMText');pt(10,e.at);put(40,r(e.height*k),41,r(e.width*k),71,e.attach,72,1,1,mtextValue(e.value),7,e.style??'Standard',50,r(e.angle),73,1,44,r(e.spacing??1));break;
   case 'leader':{
    base('LEADER','AcDbLeader');put(3,e.style??'Standard',71,e.arrow==='none'?0:1,72,0,73,3,74,0,75,0,40,r(e.height*k),41,0,76,e.points.length);
    for(const p of e.points)pt(10,p);put(77,0);
    // The note as its own MTEXT beside the landing, as AutoCAD keeps it.
    if(e.value){const last=e.points[e.points.length-1],prev=e.points[e.points.length-2],right=last[0]>=prev[0];
     emit({type:'mtext',layer:e.layer,at:[last[0]+(right?e.height*1.45:-e.height*1.45),last[1]+e.height/2],width:0,height:e.height,value:e.value,angle:0,attach:right?1:3,...(e.color!==undefined?{color:e.color}:{})},owner,paper,false);}
    break;
   }
   case 'dim':{
    const name=dimNames.get(e as Ent)??dimBlockOf(e as DimEnt),meas=e.text;
    const type=e.kind==='horizontal'||e.kind==='vertical'?0:e.kind==='aligned'?1:e.kind==='angular'?5:e.kind==='diameter'?3:e.kind==='radius'?4:6;
    const axisX=e.kind==='ordinate'&&(e.axis??(Math.abs(e.at[1]-e.a[1])>=Math.abs(e.at[0]-e.a[0])?'x':'y'))==='x';
    base('DIMENSION','AcDbDimension');put(2,name);
    const defp:Pt=e.kind==='horizontal'?[e.b[0],e.at[1]]:e.kind==='vertical'?[e.at[0],e.b[1]]:e.kind==='aligned'?(()=>{const d=[e.b[0]-e.a[0],e.b[1]-e.a[1]],l=Math.hypot(d[0],d[1])||1,n=[-d[1]/l,d[0]/l],o=(e.at[0]-e.a[0])*n[0]+(e.at[1]-e.a[1])*n[1];return [e.b[0]+n[0]*o,e.b[1]+n[1]*o] as Pt;})():e.kind==='angular'?e.at:e.kind==='ordinate'?(e.c??[0,0]):e.kind==='radius'?(e.c??e.a):(()=>{const c=e.c??e.a;return [2*c[0]-e.a[0],2*c[1]-e.a[1]] as Pt;})();
    pt(10,defp);pt(11,e.at);put(70,type|32|(axisX?64:0),1,meas===undefined?'':dxfText(meas),3,e.style??'Standard');
    if(type===0||type===1){put(100,'AcDbAlignedDimension');pt(13,e.a);pt(14,e.b);if(type===0)put(50,e.kind==='vertical'?90:0,100,'AcDbRotatedDimension');}
    else if(type===5){put(100,'AcDb3PointAngularDimension');pt(13,e.a);pt(14,e.b);pt(15,e.c!);}
    else if(type===4){put(100,'AcDbRadialDimension');pt(15,e.a);put(40,0);}
    else if(type===3){put(100,'AcDbDiametricDimension');pt(15,e.a);put(40,0);}
    else{put(100,'AcDbOrdinateDimension');pt(13,e.a);pt(14,e.at);}
    break;
   }
   case 'hatch':{
    const pat=hatchPatterns[e.pattern],solid=e.pattern==='SOLID';
    base('HATCH','AcDbHatch');put(10,0,20,0,30,0,210,0,220,0,230,1,2,e.pattern,70,solid?1:0,71,0,91,e.loops.length);
    for(const l of e.loops){put(92,2,72,0,73,1,93,l.length);for(const p of l){const q=P(p);put(10,r(q[0]),20,r(q[1]));}put(97,0);}
    put(75,0,76,1);
    if(!solid&&pat){
     const s=e.scale*unitScale(doc.unit)*k,o=e.origin??[0,0],rot=(v:Pt):Pt=>{const c=Math.cos(e.angle*DEG),si=Math.sin(e.angle*DEG);return [v[0]*c-v[1]*si,v[0]*si+v[1]*c];};
     put(52,r(e.angle),41,r(e.scale),77,0,78,pat.lines.length);
     for(const f of pat.lines){
      const a=f.angle+e.angle,b0=rot(f.origin),fu:Pt=[Math.cos(f.angle*DEG),Math.sin(f.angle*DEG)],fn:Pt=[-fu[1],fu[0]],d=rot([fu[0]*f.delta[0]+fn[0]*f.delta[1],fu[1]*f.delta[0]+fn[1]*f.delta[1]]);
      put(53,r(a),43,r(o[0]*k+b0[0]*s),44,r(o[1]*k+b0[1]*s),45,r(d[0]*s),46,r(d[1]*s),79,f.dashes.length);for(const x of f.dashes)put(49,r(x*s));
     }
    }
    put(98,0);break;
   }
   case 'insert':{
    const def=blocks.find(b=>b.name===e.name),atts=(def?.entities??[]).filter((x):x is Extract<Ent,{type:'attdef'}>=>x.type==='attdef');
    base('INSERT','AcDbBlockReference');if(atts.length)put(66,1);put(2,e.name);pt(10,e.at);put(41,r(e.mirror?-e.scale:e.scale),42,r(e.scale),43,r(e.scale),50,r(e.rotation));
    if(atts.length){
     // Attribute values placed as the definitions are, through the reference.
     for(const a of atts){const m=[Math.cos(e.rotation*DEG),Math.sin(e.rotation*DEG)],lx=(a.at[0]-def!.base[0])*e.scale*(e.mirror?-1:1),ly=(a.at[1]-def!.base[1])*e.scale;
      const at:Pt=[e.at[0]+lx*m[0]-ly*m[1],e.at[1]+lx*m[1]+ly*m[0]];
      textEnt('ATTRIB',at,a.height*e.scale,e.attribs?.[a.tag]??a.value,a.angle+e.rotation,a.align,a.style,false,[],[2,a.tag,70,a.invisible?1:0]);}
     put(0,'SEQEND',5,next(),330,owner,100,'AcDbEntity',8,e.layer);
    }
    break;
   }
   case 'xref':break;
   case 'viewport':{
    base('VIEWPORT','AcDbViewport');pt(10,e.at);put(40,r(e.width*k),41,r(e.height*k),68,1,69,++vpId);
    put(12,r(e.view[0]),22,r(e.view[1]),13,0,23,0,14,.5,24,.5,15,.5,25,.5,16,0,26,0,36,1,17,0,27,0,37,0,42,50,43,0,44,0,45,r(e.height*k/e.scale),50,0,51,0,72,1000,90,32864|(e.locked?16384:0),1,'',281,0,71,1,74,0,110,0,120,0,130,0,111,1,121,0,131,0,112,0,122,1,132,0,79,0,146,0);
    break;
   }
   case 'table':for(const p of primEnts(primitives(e,doc)??[],{layer:e.layer,...(e.color!==undefined?{color:e.color}:{})}))emit(p,owner,paper,false);break;
  }
  if('id' in e&&track)grow(e as Ent);
 };
 let vpId=1;

 // ---- blocks ----
 put(0,'SECTION',2,'BLOCKS');
 const blockSection=(name:string,owner:string,basePt:Pt,ents:(Ent|NewEnt)[],flags=0)=>{
  put(0,'BLOCK',5,next(),330,owner,100,'AcDbEntity',8,'0',100,'AcDbBlockBegin',2,name,70,flags|(ents.some(e=>e.type==='attdef')?2:0),10,r(basePt[0]*k),20,r(basePt[1]*k),30,0,3,name,1,'');
  for(const e of ents)emit(e,owner,false,false);
  put(0,'ENDBLK',5,next(),330,owner,100,'AcDbEntity',8,'0',100,'AcDbBlockEnd');
 };
 blockSection('*Model_Space',H.model,[0,0],[]);
 // Paper space: the overall viewport first (id 1), then the layout's entities, written in ENTITIES below.
 blockSection('*Paper_Space',H.paper,[0,0],[]);
 for(const b of blocks)blockSection(b.name,blockHandles.get(b.name)!,b.base,b.entities);
 for(const d of dimBlocks)blockSection(d.name,blockHandles.get(d.name)!,[0,0],d.ents,1);
 put(0,'ENDSEC',0,'SECTION',2,'ENTITIES');
 if(layout){
  put(0,'VIEWPORT',5,next(),330,H.paper,100,'AcDbEntity',67,1,8,'0',100,'AcDbViewport',10,r(doc.width*k/2),20,r(doc.height*k/2),30,0,40,r(doc.width*k),41,r(doc.height*k),68,1,69,1,12,r(doc.width*k/2),22,r(doc.height*k/2),45,r(doc.height*k),90,32864);
  for(const e of paperEnts)emit(e,H.paper,true);
 }
 for(const e of modelEnts)emit(e,H.model,false);
 put(0,'ENDSEC');

 // ---- objects: dictionaries, groups, layouts ----
 put(0,'SECTION',2,'OBJECTS');
 put(0,'DICTIONARY',5,H.root,330,0,100,'AcDbDictionary',281,1,3,'ACAD_GROUP',350,H.groups,3,'ACAD_LAYOUT',350,H.layouts,3,'ACAD_PLOTSTYLENAME',350,H.plotStyles);
 const groups=groupList.map(({g,h})=>({g,h,members:g.ids.map(id=>entHandles.get(id)).filter((x):x is string=>!!x)})).filter(x=>x.members.length);
 put(0,'DICTIONARY',5,H.groups,330,H.root,100,'AcDbDictionary',281,1,...groups.flatMap(({g,h})=>[3,g.name.startsWith('*')?`*A${g.name.slice(2)||'1'}`:g.name,350,h]));
 for(const {g,h,members} of groups)put(0,'GROUP',5,h,330,H.groups,100,'AcDbGroup',300,'',70,g.name.startsWith('*')?1:0,71,1,...members.flatMap(m=>[340,m]));
 put(0,'DICTIONARY',5,H.layouts,330,H.root,100,'AcDbDictionary',281,1,3,'Model',350,H.modelLayout,3,'Layout1',350,H.paperLayout);
 put(0,'ACDBDICTIONARYWDFLT',5,H.plotStyles,330,H.root,100,'AcDbDictionary',281,1,3,'Normal',350,H.placeholder,100,'AcDbDictionaryWithDefault',340,H.placeholder);
 put(0,'ACDBPLACEHOLDER',5,H.placeholder,330,H.plotStyles);
 const pw=r(doc.width*(doc.unit==='mm'?1:25.4)),ph=r(doc.height*(doc.unit==='mm'?1:25.4));
 for(const [h,name,owner,flags,tab] of [[H.modelLayout,'Model',H.model,1024,0],[H.paperLayout,'Layout1',H.paper,0,1]] as const)
  put(0,'LAYOUT',5,h,330,H.layouts,100,'AcDbPlotSettings',1,'',4,'',6,'',40,0,41,0,42,0,43,0,44,pw,45,ph,46,0,47,0,48,0,49,0,140,0,141,0,142,1,143,1,70,flags,72,unitIn?0:1,73,1,74,5,7,'',75,16,76,0,77,2,78,300,147,1,148,0,149,0,
   100,'AcDbLayout',1,name,70,1,71,tab,10,0,20,0,11,r(doc.width*k),21,r(doc.height*k),12,0,22,0,32,0,14,1e20,24,1e20,34,1e20,15,-1e20,25,-1e20,35,-1e20,146,0,13,0,23,0,33,0,16,1,26,0,36,0,17,0,27,1,37,0,76,1,330,owner);
 put(0,'ENDSEC',0,'EOF');
 if(lo[0]===Infinity){lo=[0,0];hi=[doc.width*k,doc.height*k];}
 const header:(string|number)[]=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$ACADMAINTVER',70,6,9,'$DWGCODEPAGE',3,'ANSI_1252',9,'$INSBASE',10,0,20,0,30,0,
  9,'$EXTMIN',10,r(lo[0]),20,r(lo[1]),30,0,9,'$EXTMAX',10,r(hi[0]),20,r(hi[1]),30,0,9,'$LIMMIN',10,0,20,0,9,'$LIMMAX',10,r(doc.width*k),20,r(doc.height*k),
  9,'$LTSCALE',40,r(doc.ltscale??1),9,'$PSLTSCALE',70,1,9,'$TEXTSTYLE',7,'Standard',9,'$CLAYER',8,'0',9,'$DIMSTYLE',2,'Standard',9,'$INSUNITS',70,unitIn?1:4,9,'$MEASUREMENT',70,unitIn?0:1,9,'$LUNITS',70,unitIn?4:2,
  9,'$LWDISPLAY',290,1,9,'$TILEMODE',70,1,9,'$HANDSEED',5,(handle+1).toString(16).toUpperCase(),0,'ENDSEC'];
 return [...header,...body].join('\n')+'\n';
}
/** One block as a DXF of its own (WBLOCK). */
export function blockDxf(doc:CadDoc,def:BlockDef){
 const ents=def.entities.map((e,i)=>({...e,id:i+1}));
 return writeDxf({...doc,entities:ents,model:undefined,groups:undefined,blocks:doc.blocks?.filter(b=>ents.some(e=>e.type==='insert'&&e.name===b.name))});
}
