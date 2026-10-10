import type {CalculationSnapshot} from '../engine/types';
import {defaultFraming,type FramingSettings} from './framingSettings';
import {drawingSheetSet} from './planSheet';
import {sheetFormat} from './sheetGraphics';
import {sheetEntities,sheetLayers,type Pt,type Units} from './svgEntities';
export {sheetEntities,sheetLayers} from './svgEntities';

/**
 * The issued ARCH D sheets as one AutoCAD 2000 (AC1015) DXF: every sheet at
 * full paper size in model space, side by side in sheet order, so the CAD
 * linework is the same drawing that is printed. Lengths are paper inches (US)
 * or millimetres (SI); plot at 1:1.
 */
const round=(v:number)=>Number(v.toFixed(5));
// AutoCAD text: drafting symbols as %% codes or plain ASCII, anything else as \U+XXXX;
// a literal "%%" would read as a control code.
const symbols:Record<string,string>={'·':'-','×':'X','°':'%%d','±':'%%p','Ø':'%%c','⌀':'%%c','§':'SEC. ','–':'-','—':'-','≤':'<=','≥':'>=','’':"'",'‘':"'",'“':'"','”':'"','′':"'",'″':'"'};
const dxfText=(t:string)=>t.replace(/[\r\n\u0000-\u001f]/g,' ').replace(/%%/g,'%%%').replace(/[^\x20-\x7e]/g,c=>symbols[c]??`\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')}`);

/** One AC1015 DXF holding the given sheets side by side (2 in / 50 mm apart). */
export function sheetsDxf(sheets:{svg:string}[],units:Units){
 const k=units==='US'?1/72:25.4/72,gap=units==='US'?2:50,sheetW=sheetFormat.width*k,sheetH=sheetFormat.height*k;
 const entities=sheets.flatMap((sheet,i)=>sheetEntities(sheet.svg,units,i*(sheetW+gap)));
 let handle=0;const next=()=>(++handle).toString(16).toUpperCase();
 const H={blockRecordTable:next(),layerTable:next(),styleTable:next(),ltypeTable:next(),viewTable:next(),ucsTable:next(),vportTable:next(),appidTable:next(),dimstyleTable:next(),
  model:next(),paper:next(),modelLayout:next(),paperLayout:next(),root:next(),groups:next(),layouts:next(),plotStyles:next(),placeholder:next()};
 const body:(string|number)[]=[],put=(...pairs:(string|number)[])=>{body.push(...pairs);};
 const table=(name:string,h:string,count:number,extra:(string|number)[]=[])=>put(0,'TABLE',2,name,5,h,330,0,100,'AcDbSymbolTable',70,count,...extra);
 const record=(type:string,owner:string,subclass:string,...pairs:(string|number)[])=>put(0,type,5,next(),330,owner,100,'AcDbSymbolTableRecord',100,subclass,...pairs);
 put(0,'SECTION',2,'CLASSES',0,'ENDSEC',0,'SECTION',2,'TABLES');
 const centre=[(sheets.length*(sheetW+gap)-gap)/2,sheetH/2];
 table('VPORT',H.vportTable,1);
 record('VPORT',H.vportTable,'AcDbViewportTableRecord',2,'*Active',70,0,10,0,20,0,11,1,21,1,12,round(centre[0]),22,round(centre[1]),13,0,23,0,14,.5,24,.5,15,.5,25,.5,16,0,26,0,36,1,17,0,27,0,37,0,40,round(sheetH*1.1),41,round(Math.max(1.5,(sheets.length*(sheetW+gap))/(sheetH*1.1))),42,50,43,0,44,0,50,0,51,0,71,0,72,1000,73,1,74,3,75,0,76,0,77,0,78,0,281,0,65,0,146,0);
 put(0,'ENDTAB');
 const dash=units==='US'?{DASHED:[.125,-.0625],HIDDEN:[.0625,-.03125],CENTER:[.25,-.0625,.0625,-.0625]}:{DASHED:[3,-1.5],HIDDEN:[1.5,-.75],CENTER:[6,-1.5,1.5,-1.5]};
 table('LTYPE',H.ltypeTable,6);
 for(const name of ['ByBlock','ByLayer','Continuous'])record('LTYPE',H.ltypeTable,'AcDbLinetypeTableRecord',2,name,70,0,3,name==='Continuous'?'Solid line':'',72,65,73,0,40,0);
 for(const [name,segments] of Object.entries(dash)){record('LTYPE',H.ltypeTable,'AcDbLinetypeTableRecord',2,name,70,0,3,name==='DASHED'?'Dashed __ __ __':name==='HIDDEN'?'Hidden _ _ _ _':'Center ____ _ ____',72,65,73,segments.length,40,round(segments.reduce((a,v)=>a+Math.abs(v),0)));for(const seg of segments)put(49,round(seg),74,0);}
 put(0,'ENDTAB');
 const layers=Object.entries(sheetLayers);
 table('LAYER',H.layerTable,layers.length+1);
 record('LAYER',H.layerTable,'AcDbLayerTableRecord',2,'0',70,0,62,7,6,'Continuous',370,-3,390,H.placeholder);
 for(const [name,l] of layers)record('LAYER',H.layerTable,'AcDbLayerTableRecord',2,name,70,0,62,l.color,6,l.ltype,370,l.weight,390,H.placeholder);
 put(0,'ENDTAB');
 table('STYLE',H.styleTable,3);
 for(const [name,font] of [['Standard','arial.ttf'],['ARIAL','arial.ttf'],['ARIAL-BOLD','arialbd.ttf']])record('STYLE',H.styleTable,'AcDbTextStyleTableRecord',2,name,70,0,40,0,41,1,50,0,71,0,42,units==='US'?.125:2.5,3,font,4,'');
 put(0,'ENDTAB');
 table('VIEW',H.viewTable,0);put(0,'ENDTAB');
 table('UCS',H.ucsTable,0);put(0,'ENDTAB');
 table('APPID',H.appidTable,1);record('APPID',H.appidTable,'AcDbRegAppTableRecord',2,'ACAD',70,0);put(0,'ENDTAB');
 table('DIMSTYLE',H.dimstyleTable,1,[100,'AcDbDimStyleTable']);
 put(0,'DIMSTYLE',105,next(),330,H.dimstyleTable,100,'AcDbSymbolTableRecord',100,'AcDbDimStyleTableRecord',2,'Standard',70,0,3,'',4,'',40,1,41,units==='US'?.125:2.5,42,units==='US'?.0625:.625,43,units==='US'?.375:3.75,44,units==='US'?.125:1.25,140,units==='US'?.125:2.5,141,units==='US'?.09:2.5,147,units==='US'?.09:.625,77,1,78,8,271,units==='US'?3:2,272,units==='US'?3:2,371,-2,372,-2);
 put(0,'ENDTAB');
 table('BLOCK_RECORD',H.blockRecordTable,2);
 put(0,'BLOCK_RECORD',5,H.model,330,H.blockRecordTable,100,'AcDbSymbolTableRecord',100,'AcDbBlockTableRecord',2,'*Model_Space',340,H.modelLayout);
 put(0,'BLOCK_RECORD',5,H.paper,330,H.blockRecordTable,100,'AcDbSymbolTableRecord',100,'AcDbBlockTableRecord',2,'*Paper_Space',340,H.paperLayout);
 put(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'BLOCKS');
 for(const [owner,name] of [[H.model,'*Model_Space'],[H.paper,'*Paper_Space']]){put(0,'BLOCK',5,next(),330,owner,100,'AcDbEntity',8,'0',100,'AcDbBlockBegin',2,name,70,0,10,0,20,0,30,0,3,name,1,'');put(0,'ENDBLK',5,next(),330,owner,100,'AcDbEntity',8,'0',100,'AcDbBlockEnd');}
 put(0,'ENDSEC',0,'SECTION',2,'ENTITIES');
 const base=(type:string,layer:string,subclass:string)=>put(0,type,5,next(),330,H.model,100,'AcDbEntity',8,layer,100,subclass);
 let min:Pt=[Infinity,Infinity],max:Pt=[-Infinity,-Infinity];
 const grow=([x,y]:Pt,r=0)=>{min=[Math.min(min[0],x-r),Math.min(min[1],y-r)];max=[Math.max(max[0],x+r),Math.max(max[1],y+r)];};
 for(const e of entities){
  if(e.type==='line'){grow(e.a);grow(e.b);base('LINE',e.layer,'AcDbLine');put(10,round(e.a[0]),20,round(e.a[1]),30,0,11,round(e.b[0]),21,round(e.b[1]),31,0);}
  else if(e.type==='poly'){e.points.forEach(p=>grow(p));base('LWPOLYLINE',e.layer,'AcDbPolyline');put(90,e.points.length,70,e.closed?1:0,43,0);for(const p of e.points)put(10,round(p[0]),20,round(p[1]));}
  else if(e.type==='solid'){e.points.forEach(p=>grow(p));const [a,b,c,d=c]=e.points;base('SOLID',e.layer,'AcDbTrace');put(10,round(a[0]),20,round(a[1]),30,0,11,round(b[0]),21,round(b[1]),31,0,12,round(d[0]),22,round(d[1]),32,0,13,round(c[0]),23,round(c[1]),33,0);}
  else if(e.type==='circle'){grow(e.center,e.radius);base('CIRCLE',e.layer,'AcDbCircle');put(10,round(e.center[0]),20,round(e.center[1]),30,0,40,round(e.radius));}
  else{grow(e.at);base('TEXT',e.layer,'AcDbText');put(10,round(e.at[0]),20,round(e.at[1]),30,0,40,round(e.height),1,dxfText(e.value),50,round(e.angle),7,e.bold?'ARIAL-BOLD':'ARIAL',72,e.align,11,round(e.at[0]),21,round(e.at[1]),31,0,100,'AcDbText',73,0);}
 }
 put(0,'ENDSEC',0,'SECTION',2,'OBJECTS');
 put(0,'DICTIONARY',5,H.root,330,0,100,'AcDbDictionary',281,1,3,'ACAD_GROUP',350,H.groups,3,'ACAD_LAYOUT',350,H.layouts,3,'ACAD_PLOTSTYLENAME',350,H.plotStyles);
 put(0,'DICTIONARY',5,H.groups,330,H.root,100,'AcDbDictionary',281,1);
 put(0,'DICTIONARY',5,H.layouts,330,H.root,100,'AcDbDictionary',281,1,3,'Model',350,H.modelLayout,3,'Layout1',350,H.paperLayout);
 put(0,'ACDBDICTIONARYWDFLT',5,H.plotStyles,330,H.root,100,'AcDbDictionary',281,1,3,'Normal',350,H.placeholder,100,'AcDbDictionaryWithDefault',340,H.placeholder);
 put(0,'ACDBPLACEHOLDER',5,H.placeholder,330,H.plotStyles);
 // Plot settings: ARCH D landscape, 1:1, millimetre paper units as AutoCAD stores them.
 for(const [h,name,owner,flags,tab] of [[H.modelLayout,'Model',H.model,1024,0],[H.paperLayout,'Layout1',H.paper,0,1]] as const)
  put(0,'LAYOUT',5,h,330,H.layouts,100,'AcDbPlotSettings',1,'',4,'ARCH_D_(36.00_x_24.00_Inches)',6,'',40,0,41,0,42,0,43,0,44,914.4,45,609.6,46,0,47,0,48,0,49,0,140,0,141,0,142,1,143,1,70,flags,72,units==='US'?0:1,73,1,74,5,7,'',75,16,76,0,77,2,78,300,147,1,148,0,149,0,
   100,'AcDbLayout',1,name,70,1,71,tab,10,0,20,0,11,units==='US'?36:914.4,21,units==='US'?24:609.6,12,0,22,0,32,0,14,1e20,24,1e20,34,1e20,15,-1e20,25,-1e20,35,-1e20,146,0,13,0,23,0,33,0,16,1,26,0,36,0,17,0,27,1,37,0,76,1,330,owner);
 put(0,'ENDSEC',0,'EOF');
 const header:(string|number)[]=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$ACADMAINTVER',70,6,9,'$DWGCODEPAGE',3,'ANSI_1252',9,'$INSBASE',10,0,20,0,30,0,
  9,'$EXTMIN',10,round(min[0]),20,round(min[1]),30,0,9,'$EXTMAX',10,round(max[0]),20,round(max[1]),30,0,9,'$LIMMIN',10,0,20,0,9,'$LIMMAX',10,round(sheets.length*(sheetW+gap)-gap),20,round(sheetH),
  9,'$LTSCALE',40,1,9,'$PSLTSCALE',70,1,9,'$TEXTSTYLE',7,'ARIAL',9,'$CLAYER',8,'0',9,'$INSUNITS',70,units==='US'?1:4,9,'$MEASUREMENT',70,units==='US'?0:1,9,'$LUNITS',70,units==='US'?4:2,9,'$LWDISPLAY',290,1,9,'$HANDSEED',5,(handle+1).toString(16).toUpperCase(),0,'ENDSEC'];
 return [...header,...body].join('\n')+'\n';
}

/** The drawing set of a validated calculation as one DXF. */
export function drawingSetDxf(s:CalculationSnapshot,f:FramingSettings=defaultFraming){
 if(!s.eligible)throw Error('Generate output from a validated calculation before downloading CAD sheets.');
 return sheetsDxf(drawingSheetSet(s,f),s.input.units);
}
