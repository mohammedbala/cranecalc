import {supportColumn} from '../engine/drawingData';
import {existingBracketLabel} from '../engine/bracketProfiles';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {simpleSupportInput} from '../engine/simpleSupports';
import {connectionOptionChecks} from '../engine/connectionOptions';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {bearingStiffenerProfile} from './bearingStiffenerGeometry';
import { Draft, type CadDrawing } from './drafting';
import { boltProperties } from '../engine/connectionStrength';
import { activeEndBearing, endBearingGeometry } from '../engine/endBearing';
import { flangeRestraintStations } from '../engine/detailAnalysis';
import type { CalculationSnapshot } from '../engine/types';
import { format } from '../engine/units';
import { plateInches } from './drawingFormat';
import { detailSheetNumbers } from './planSheet';
export function detailedDrawings(s:CalculationSnapshot):CadDrawing[]{
 const p=s.input,d=p.details;if(!d)return [];
 if(connectionOptionChecks(p).length)return [];
 const f=(v:number)=>plateInches(v,p.units),force=(v:number)=>format(v,'force',p.units,4);
 // Drawing sheets that carry the matching details, e.g. "S-02" or "S-02, S-03".
 const sheetOf=detailSheetNumbers(s),sheets=(...keys:string[])=>[...new Set(keys.map(sheetOf))].join(', ');
 const output:CadDrawing[]=[];
 {
 const k=260/p.section.d,b=p.section,bs=d.bearing,dr=new Draft(s,'bearing-detail','Girder bearing / flange-restraint section','SK-04',500,1/k,'Calculated girder-side components only. Building bracket, frame, anchorage and foundations excluded.');
 const cx=265,y=80,left=cx-b.bf*k/2,right=cx+b.bf*k/2;
 dr.rect(left,y,b.bf*k,b.tf*k);dr.rect(cx-b.tw*k/2,y+b.tf*k,b.tw*k,(b.d-2*b.tf)*k);dr.rect(left,y+(b.d-b.tf)*k,b.bf*k,b.tf*k);
 for(const sign of [-1,1])dr.poly(bearingStiffenerProfile(bs.stiffenerWidth,b.d-2*b.tf,bs.cope).map(([z,v])=>[cx+sign*(b.tw/2+z)*k,y+(b.tf+v)*k]),true);
 dr.rect(cx-bs.width*k/2,y+b.d*k,bs.width*k,bs.thickness*k);dr.hatch(cx-bs.width*k/2,y+b.d*k,bs.width*k,bs.thickness*k);
 dr.dimH(cx-bs.width*k/2,cx+bs.width*k/2,y+b.d*k+bs.thickness*k,400,`SEAT WIDTH ${f(bs.width)}`);
 dr.dimV(y,y+b.d*k,right,430,`${b.name} / d ${f(b.d)}`);
 if(b.kind==='cap'){dr.rect(cx-b.capWidth*k/2,y-b.capTw*k,b.capWidth*k,b.capTw*k);for(const sign of [-1,1])dr.rect(cx+sign*b.capWidth*k/2-(sign>0?b.capTf*k:0),y,b.capTf*k,(b.capDepth-b.capTw)*k);}
 const notes=[`Bearing plate: ${f(bs.width)} wide x ${f(bs.length)} along girder x ${f(bs.thickness)}`,`Pair fitted stiffeners: outstand ${f(bs.stiffenerWidth)} x ${f(bs.stiffenerThickness)}`,`Web-side corner cope: ${f(bs.cope)}; web fillets: ${f(bs.weldSize)}, four lines`,b.kind==='cap'?`Fit/mill ends; top flange CJP; continuous web fillets`:`Fit/mill ends; continuous web AND flange fillets`,`Top-flange ties at x: ${flangeRestraintStations(p).top.map(f).join(', ')}`,`Bottom-flange ties at x: ${flangeRestraintStations(p).bottom.map(f).join(', ')}`,`Tie stiffness at EACH flange: ${format(s.detailResults?.braceStiffness??0,'stiffness',p.units)}`,`Bearing reaction envelope: ${force(s.designAnalysis?.reaction??0)}`,`End rotation clearance: ${f(d.criteria.rotationClearance)}`];
 notes.forEach((n,i)=>dr.text(500,85+29*i,n,10));dr.text(80,55,'SECTION AT SUPPORT; STIFFENERS ALSO AT EACH RESTRAINT',10);output.push(dr.drawing);
 }
 const eb=activeEndBearing(p);
 if(eb){
  // SK-05: bolted end bearing hole patterns on the girder bottom flange.
  const g=endBearingGeometry(p,eb),bs=d.bearing,k=Math.min(150/bs.length,200/Math.max(p.section.bf,bs.width)),y0=110,dr=new Draft(s,'end-connection-detail','Bolted end bearing / locating and sliding hole patterns','SK-05',500,1/k,'Bottom flange plan at each girder end. Standard holes at the locating end; long slots at the sliding end under plate washers.');
  for(const [i,role] of (['LOCATING END','SLIDING END'] as const).entries()){
   const x0=110+i*250,W=Math.max(p.section.bf,bs.width);
   dr.rect(x0,y0+(W-p.section.bf)*k/2,bs.length*k,p.section.bf*k);dr.rect(x0,y0,bs.length*k,bs.width*k,'HIDDEN');dr.text(x0,y0-14,role,10);
   for(const r of g.rows)for(const side of [-1,1]){const cx=x0+r*k,cy=y0+W*k/2+side*eb.bolts.gauge*k/2;
    if(i===0)dr.circle(cx,cy,g.hole*k/2);
    else{const hl=g.slot*k/2,hr=g.hole*k/2,pts:[number,number][]=[];for(let a=0;a<=12;a++){const t=-Math.PI/2+Math.PI*a/12;pts.push([cx+hl-hr+hr*Math.cos(t),cy+hr*Math.sin(t)]);}for(let a=0;a<=12;a++){const t=Math.PI/2+Math.PI*a/12;pts.push([cx-hl+hr+hr*Math.cos(t),cy+hr*Math.sin(t)]);}dr.poly(pts,true);dr.rect(cx-g.washer.length*k/2,cy-g.washer.width*k/2,g.washer.length*k,g.washer.width*k,'HIDDEN');}
    dr.line(cx-8,cy,cx+8,cy,'CENTER');dr.line(cx,cy-8,cx,cy+8,'CENTER');}
   dr.dimH(x0,x0+g.rows[0]*k,y0+W*k,y0+W*k+22,`${f(g.rows[0])}`);dr.dimH(x0+g.rows[0]*k,x0+g.rows[1]*k,y0+W*k,y0+W*k+22,`${f(g.spacing)}`);
  }
  const notes=[`4 ${eb.bolts.grade} bolts each end, diameter ${f(eb.bolts.diameter)}; gauge ${f(eb.bolts.gauge)}`,`Locating: ${f(g.hole)} standard holes in all plies; pretensioned, Class B (SC)`,`Sliding: ${f(g.slotWidth)} x ${f(g.slot)} slots in the girder flange`,`Sliding allowance ${f(g.travel)} each way; ${g.sleeve?`bolts pretensioned against ${f(g.sleeve.od)} OD steel sleeves`:'snug-tight bolts with jam nuts'}`,`Plate washers ${f(eb.washerThickness)} x ${f(g.washer.width)} x ${f(g.washer.length)}`,`Bolt rows ${f(eb.bolts.edge)} from each bearing plate end, clear of the stiffeners`];
  notes.forEach((n,i)=>dr.text(110,330+24*i,n,10));output.push(dr.drawing);
 }
 for(const [key,c,title,number,central] of [...(eb?[]:[['end',d.end,'Girder web end / longitudinal double-cover connection','SK-05',p.section.tw]] as const),['tie',d.brace.connection,'Both-flange tie / symmetric double-cover connection','SK-06',d.brace.gussetThickness]] as const){
 const w=c.gauge+2*c.edge,h=(c.rows-1)*c.pitch+2*c.edge,k=Math.min(240/w,230/h),x=125,y=90,dr=new Draft(s,`${key}-connection-detail`,title,number,500,1/k,'In-plane force template. Two cover plates; standard holes. Out-of-plane forces/prying require another model.');
 dr.rect(x,y,w*k,h*k);const hole=boltProperties(c.grade,c.diameter).hole;
 for(let row=0;row<c.rows;row++)for(let col=0;col<2;col++){const bx=x+(c.edge+col*c.gauge)*k,by=y+(c.edge+row*c.pitch)*k;dr.circle(bx,by,hole*k/2);dr.line(bx-8,by,bx+8,by,'CENTER');dr.line(bx,by-8,bx,by+8,'CENTER');}
 dr.dimH(x,x+w*k,y+h*k,360,`PLATE WIDTH ${f(w)}`);dr.dimV(y,y+h*k,x,85,`HEIGHT ${f(h)}`);dr.dimH(x+c.edge*k,x+(c.edge+c.gauge)*k,y,62,`GAUGE ${f(c.gauge)}`);
 const notes=[`${2*c.rows} ${c.grade} bolts, diameter ${f(c.diameter)}; hole ${f(hole)}`,`Two cover plates, each ${f(c.thickness)}; central ply ${f(central)}`,`Rows at ${f(c.pitch)}; all plate-edge distances ${f(c.edge)}`,`Class ${c.surface} faying surfaces; two slip/shear planes`,`Load-line to weld eccentricity: ${f(c.projection)}`,`Two effective root fillets: ${f(c.weldSize)} x ${f(c.weldLength)}`,key==='tie'?`Two tie bars per flange: ${f(d.brace.width)} x ${f(d.brace.thickness)}`:'Full reaction plus longitudinal force checked conservatively',key==='tie'?`Bar length ${f(d.brace.length)}; lateral reach ${f(d.brace.reach)}`:'Bearing carries gravity; end covers also provide uplift restraint',key==='tie'?`Unbraced central gusset length ${f(d.brace.connectionLength)}`:`Provide ${f(d.criteria.rotationClearance)} clearance for simple-end rotation`];
 notes.forEach((n,i)=>dr.text(465,85+28*i,n,10));
 if(key==='tie')dr.text(465,345,supportColumn(p).isNew?`COLUMN-SIDE ROOT: SHOP WELD TO ${supportColumn(p).name} / ${sheets('connection','flange-tie')}`:`COLUMN-SIDE ROOT: FIELD WELD TO EXISTING STEEL / ${sheets('connection','flange-tie')}`,9);
 // Actual ply thicknesses in a separated orthographic section.
 let px=125;for(const t of [c.thickness,central,c.thickness]){dr.rect(px,395,90,t*k);px+=110;}dr.text(125,387,'SEPARATED PLY SECTION / THICKNESSES TO SCALE',9);output.push(dr.drawing);
 }
 {
 const r=d.rail,k=1.25,depth=p.aist!.railDepth,dr=new Draft(s,'rail-detail','Sliding rail keepers / bolted expansion joint','SK-07',620,1/k,'Idealized rail without fillets. Pad rating per entered supplier basis. Rail wheel-contact wear/hardness is a supplier selection item.');
 const cx=215,y=85;dr.rect(cx-r.headWidth*k/2,y,r.headWidth*k,r.headThickness*k,'RAIL');dr.rect(cx-r.webThickness*k/2,y+r.headThickness*k,r.webThickness*k,(depth-r.headThickness-r.baseThickness)*k,'RAIL');dr.rect(cx-r.baseWidth*k/2,y+(depth-r.baseThickness)*k,r.baseWidth*k,r.baseThickness*k,'RAIL');
 for(const sign of [-1,1]){const edge=cx+sign*r.baseWidth*k/2,root=edge+sign*r.clipProjection*k/2;dr.rect(sign<0?root-r.clipThickness*k:root,y+(depth-r.baseThickness-r.clipThickness)*k,r.clipThickness*k,(r.baseThickness+r.clipThickness)*k);dr.rect(sign<0?root:root-r.clipProjection*k,y+(depth-r.baseThickness-r.clipThickness)*k,r.clipProjection*k,r.clipThickness*k);}
 dr.dimV(y,y+depth*k,cx-r.baseWidth*k/2,80,`RAIL DEPTH ${f(depth)}`);dr.dimH(cx-r.baseWidth*k/2,cx+r.baseWidth*k/2,y+depth*k,310,`BASE ${f(r.baseWidth)}`);
 const rn=[`Head ${f(r.headWidth)} x ${f(r.headThickness)}; web ${f(r.webThickness)}`,`Base ${f(r.baseWidth)} x ${f(r.baseThickness)}; rail Fy ${format(r.Fy,'stress',p.units)}`,`Integral stepped keeper pairs at ${f(p.aist!.clipSpacing)} maximum`,`Keeper along rail ${f(r.clipWidth)}; thickness ${f(r.clipThickness)}`,`Root-to-load projection ${f(r.clipProjection)}; two ${f(r.clipWeld)} fillets`,`Rail pad compression rating ${format(r.padAllowable,'stress',p.units)}`,`Rail expansion gap ${f(r.jointGap)}; temperature swing ${r.temperatureRange} C`,`Keepers permit longitudinal sliding; no rail/girder composite action`];rn.forEach((n,i)=>dr.text(420,85+i*26,n,10));
 const barLength=2*(2*r.jointEdge+r.jointPitch)+r.jointGap,jx=80,jy=365;
 dr.rect(jx,jy,barLength*k,r.jointPlateHeight*k);dr.line(jx+barLength*k/2-r.jointGap*k/2,jy-8,jx+barLength*k/2-r.jointGap*k/2,jy+r.jointPlateHeight*k+8,'CENTER');dr.line(jx+barLength*k/2+r.jointGap*k/2,jy-8,jx+barLength*k/2+r.jointGap*k/2,jy+r.jointPlateHeight*k+8,'CENTER');
 const dh=boltProperties('A325',r.jointBoltDiameter).hole;
 for(const at of [r.jointEdge,r.jointEdge+r.jointPitch,barLength-r.jointEdge-r.jointPitch,barLength-r.jointEdge]){dr.rect(jx+(at-.75*r.jointBoltDiameter)*k,jy+(r.jointPlateHeight-dh)*k/2,1.5*r.jointBoltDiameter*k,dh*k,'HIDDEN');dr.circle(jx+at*k,jy+r.jointPlateHeight*k/2,r.jointBoltDiameter*k/2);}
 dr.dimH(jx,jx+barLength*k,jy+r.jointPlateHeight*k,520,`JOINT BARS ${f(barLength)} LONG x ${f(r.jointPlateHeight)} HIGH x ${f(r.jointPlateThickness)} EACH`);
 dr.text(620,370,`4 A325 bolts, diameter ${f(r.jointBoltDiameter)}`,10);dr.text(620,395,`2 bolts each side; pitch ${f(r.jointPitch)}`,10);dr.text(620,420,`Edge ${f(r.jointEdge)}; two shear planes`,10);dr.text(620,445,`Slots ${f(1.5*r.jointBoltDiameter)} x ${f(dh)}`,10);dr.text(620,470,'Snug-tight; slot length along rail',10);dr.text(620,495,'Keeper pair on each cut rail end',10);output.push(dr.drawing);
 }
 if(p.section.kind==='cap'&&p.capDesign){
  const b=p.section,c=p.capDesign,k=230/b.d,dr=new Draft(s,'cap-attachment-detail','Continuous cap-channel attachment','SK-08',500,1/k,`Full-bearing cap; continuous longitudinal fillets; no holes in channel / W top flange. See ${sheets('cap')} for printed scales.`);
  const cx=220,y=105,left=cx-b.bf*k/2,right=cx+b.bf*k/2;
  dr.rect(left,y,b.bf*k,b.tf*k);dr.rect(cx-b.tw*k/2,y+b.tf*k,b.tw*k,(b.d-2*b.tf)*k);dr.rect(left,y+(b.d-b.tf)*k,b.bf*k,b.tf*k);
  dr.rect(cx-b.capWidth*k/2,y-b.capTw*k,b.capWidth*k,b.capTw*k);
  for(const sign of [-1,1])dr.rect(cx+sign*b.capWidth*k/2-(sign>0?b.capTf*k:0),y,b.capTf*k,(b.capDepth-b.capTw)*k);
  dr.dimH(cx-b.capWidth*k/2,cx+b.capWidth*k/2,y-b.capTw*k,68,f(b.capWidth));
  dr.leader(right,y,485,112,`${f(c.weldSize).replaceAll('"','')} CONT. FILLET / EACH W FLANGE EDGE`);
  dr.leader(cx+b.tw*k/2,y+b.d*k*.65,485,265,b.catalogueId!);
  dr.text(485,150,`${b.capCatalogueId} CAP / FULL MEMBER LENGTH`,10);
  dr.text(485,180,`MINIMUM END DEVELOPMENT: ${f(c.developmentLength)} EACH END`,10);
  dr.text(485,210,'FIT / VERIFY FULL CONTACT BEFORE WELDING',10);
  dr.text(485,300,'BEARING STIFFENERS: CJP TO W TOP FLANGE',10);
  dr.text(485,330,'CMAA A-D ONLY / SEE CALCULATIONS FOR DUTY',10);
  output.push(dr.drawing);
 }
 if(p.system==='simple'){
  const c=simpleSupportInput(p),b=p.section,bs=d.bearing,k=Math.min(230/b.d,370/(4*bs.length+c.endGap)),cx=265,y=100,g=c.endGap*k/2,l=bs.length*k;
  const dr=new Draft(s,'independent-support-detail','Independent girder ends / shared column bracket','SK-09',580,1/k,'Reference AIST Technical Report 13 §5.8.1 / separate bearings and ties / receiving attachments by building designer.');
  dr.rect(cx-(l+g+30),y+b.d*k+bs.thickness*k,2*(l+g+30),35,'HIDDEN');
  for(const side of [-1,1]){
   const x=side<0?cx-g-2*l:cx+g,bc=cx+side*(g+l/2);
   dr.rect(x,y,2*l,b.d*k);dr.line(x,y+b.tf*k,x+2*l,y+b.tf*k);dr.line(x,y+(b.d-b.tf)*k,x+2*l,y+(b.d-b.tf)*k);
   if(b.kind==='cap')dr.rect(x,y-b.capTw*k,2*l,b.capTw*k);
   dr.rect(bc-bs.stiffenerThickness*k/2,y+b.tf*k,bs.stiffenerThickness*k,(b.d-2*b.tf)*k);
   dr.rect(bc-l/2,y+b.d*k,l,bs.thickness*k);
   dr.dimH(bc-l/2,bc+l/2,y+b.d*k+bs.thickness*k,410,f(bs.length));
  }
  dr.dimH(cx-g,cx+g,y,74,`GAP ${f(c.endGap)}`);
  dr.line(cx,60,cx,430,'CENTER');dr.text(cx,452,b.name,12,'middle');
  [`SEPARATE BEARING PL ${f(bs.thickness)} X ${f(bs.width)} X ${f(bs.length)}`,'PAIRED BEARING STIFFENERS AT EACH END / SK-04','LEFT END OF EACH BAY: LONGITUDINAL LOCATING','RIGHT END OF EACH BAY: SLIDING',`MOVEMENT ALLOWANCE ${f(c.guideTravel)} EACH DIRECTION`,'INDIVIDUAL TOP / BOTTOM TIES TO COLUMN / SK-06','DO NOT SPLICE GIRDER FLANGES OR CAP ACROSS GAP',usesExistingBracket(p)?`EXISTING BRACKET / NEW SEAT: SK-10 / ${sheets('bracket')}`:d.bracket?.enabled?`WELDED BRACKET / SPREADER: SK-10 / ${sheets('bracket')}`:'COLUMN BRACKET / SPREADER: REFERENCE ONLY','MOVEMENT-COMPATIBLE ATTACHMENTS REQUIRE DESIGN',`SEE ${sheets('support')} FOR SHARED BRACKET REACTION SCHEDULE`].forEach((note,i)=>dr.text(520,110+i*30,note,9));
  output.push(dr.drawing);
 }
 if(usesExistingBracket(p)){
  const b=d.bracket!,e=existingBracket(p),k=Math.min(270/e.projection,250/e.depth),dr=new Draft(s,'existing-column-bracket',`New bolted seat on existing ${existingBracketLabel(b)}`,'SK-10',560,1/k,`Existing geometry by survey / capacities by recorded assessment / new seat checks / see ${sheets('bracket')}.`);
  const face=365,top=100,tip=face-e.projection*k,root=top+b.seatThickness*k,bot=root+e.depth*k;
  dr.rect(face,75,b.receiver.flangeThickness*k,bot-50,'HIDDEN');dr.rect(face-b.seatProjection*k,top,b.seatProjection*k,b.seatThickness*k);
  dr.rect(tip,root,e.projection*k,e.depth*k,'HIDDEN');for(const off of [e.flangeThickness,e.depth-e.flangeThickness])dr.line(tip,root+off*k,face,root+off*k,'HIDDEN');
  dr.dimH(tip,face,bot,bot+36,f(e.projection));dr.dimV(root,bot,tip,tip-28,f(e.depth));dr.dimH(face-b.reach*k,face,top,60,f(b.reach));
  [`NEW SEAT PL ${f(b.seatThickness)} X ${f(b.seatLength)} X ${f(b.seatProjection)}`,`4 - ${f(e.bolts.diameter)} DIA. ${e.bolts.grade} RETAINING BOLTS`,`EXISTING ${existingBracketLabel(b)}`,'ORIGINAL ROOT WELDS / CONTINUITY PLATES','SURVEY GEOMETRY AND VERIFY CAPACITY ASSESSMENT','SEAT BOLTS ARE NOT A GIRDER HOLD-DOWN','SLIDING END AND TIES: SEPARATE MOVEMENT DESIGN','ORIGINAL BRACKET WELDS ARE NOT NEW FIELD WELDS'].forEach((v,i)=>dr.text(485,100+i*29,v,9));
  output.push(dr.drawing);
 }
 if(d.bracket?.enabled&&!usesExistingBracket(p)){
  const b=d.bracket,k=Math.min(270/b.seatProjection,250/b.ribDepth),dr=new Draft(s,'welded-column-bracket','Welded gravity bracket / two rectangular ribs','SK-10',560,1/k,`AISC F11, J2, J4, J10 and Appendix 3 / Reference AIST Technical Report 13 5.9.2 / see ${sheets('bracket')}.`);
  const face=365,top=100,tip=face-b.seatProjection*k,root=top+b.seatThickness*k,bot=root+b.ribDepth*k;
  dr.rect(face,75,b.receiver.flangeThickness*k,bot-50,'HIDDEN');dr.rect(tip,top,b.seatProjection*k,b.seatThickness*k);dr.rect(tip,root,b.seatProjection*k,b.ribDepth*k);
  dr.dimH(tip,face,bot,bot+36,f(b.seatProjection));dr.dimV(root,bot,tip,tip-28,f(b.ribDepth));
  dr.dimH(face-b.reach*k,face,top,60,f(b.reach));
  [`SEAT PL ${f(b.seatThickness)} X ${f(b.seatLength)} X ${f(b.seatProjection)}`,`2 RECTANGULAR RIBS ${f(b.ribThickness)} X ${f(b.ribDepth)}`,`RIB CENTERS ${f(b.ribSpacing)}`,`SEAT FILLETS ${f(b.seatWeld).replaceAll('"','')} / BOTH SIDES / FULL PROJECTION`,'HORIZONTAL LOADS: SEPARATE COLUMN ATTACHMENTS','KEEP SLIDING GIRDER BEARINGS FREE','GLOBAL COLUMN / FRAME / FOUNDATIONS: SEPARATE'].forEach((v,i)=>dr.text(485,100+i*29,v,10));
  dr.fieldFilletLeader(face,root+b.ribDepth*k*.55,485,337,f(b.rootWeld),[`${supportColumn(p).weld} RIBS TO ${supportColumn(p).name}`,'CONT. FULL DEPTH / BOTH SIDES'],true,supportColumn(p).field);
  output.push(dr.drawing);
 }
 const tie=flangeTieGeometry(p);
 if(tie){
  const b=p.section,t=d.brace,a=tie.attachment,c=t.connection,k=.55,x=165,y=140;
  const dr=new Draft(s,'direct-flange-tie','Direct flange saddle / transverse tie section','SK-11',570,1/k,`Local attachment checks only. End rotation, thermal movement and building-frame interaction require project design. ${sheets('flange-tie')}.`);
  const X=(z:number)=>x+z*k,Y=(v:number)=>y+v*k;
  dr.rect(X(-b.bf/2),Y(-b.tf),b.bf*k,b.tf*k);
  dr.rect(X(-b.tw/2),y,b.tw*k,(tie.topDrop+t.width/2+25.4)*k);
  if(b.kind==='cap'){
   dr.rect(X(-b.capWidth/2),Y(-b.tf-b.capTw),b.capWidth*k,b.capTw*k);
   for(const side of [-1,1])dr.rect(X(side*b.capWidth/2-(side>0?b.capTf:0)),Y(-b.tf),b.capTf*k,(b.capDepth-b.capTw)*k);
  }
  dr.rect(X(tie.rootStart),y,tie.rootLength*k,a.saddleThickness*k);
  dr.rect(X(tie.rootStart),Y(a.saddleThickness),(tie.gussetEnd-tie.rootStart)*k,(tie.topDrop+t.width/2-a.saddleThickness)*k);
  dr.rect(X(tie.start),Y(tie.topDrop-t.width/2),t.length*k,t.width*k);
  dr.rect(X(tie.face-tie.connection),Y(tie.topDrop-t.width/2),tie.connection*k,t.width*k);
  dr.line(X(tie.face),Y(-30),X(tie.face),Y(tie.topDrop+t.width/2+30),'HIDDEN');
  for(const offset of [0,t.length-tie.connection])for(let row=0;row<c.rows;row++)for(const sign of [-1,1])dr.circle(X(tie.start+offset+c.edge+row*c.pitch),Y(tie.topDrop+sign*c.gauge/2),boltProperties(c.grade,c.diameter).hole*k/2);
  dr.dimH(X(tie.start),X(tie.face),Y(tie.topDrop+t.width/2),360,f(t.length));
  dr.dimV(Y(tie.topDrop-t.width/2),Y(tie.topDrop+t.width/2),X(tie.face),X(tie.face)+30,f(t.width));
  const notes=[`2 FL ${f(t.thickness)} X ${f(t.width)} / ${f(t.length)} LONG`, `CENTRAL GUSSETS ${f(t.gussetThickness)}`,`SADDLE PL ${f(a.saddleThickness)} X ${f(a.saddleLength)} X ${f(tie.rootLength)}`,`${f(a.weldSize).replaceAll('"','')} FILLETS / SADDLE AND GUSSET / BOTH SIDES`,`${2*c.rows} - ${f(c.diameter)} ${c.grade} EACH END`, `TIE SETBACK ${f(a.longitudinalSetback)} FROM BEARING CENTER`,`CLEAR CAP AND ROOT BY ${f(a.clearance)} MINIMUM`, 'NO HOLES OR CUTS THROUGH CAP / W FLANGES',`BOTTOM TIE AT SAME SADDLE OFFSET / SEE ${sheets('flange-tie')}`];
  notes.forEach((v,i)=>dr.text(545,95+i*29,v,9));
  dr.fieldFilletLeader(X(tie.face),Y(tie.topDrop),545,385,f(c.weldSize),[`${supportColumn(p).weld} GUSSET TO ${supportColumn(p).name}`,`TWO CONT. LINES X ${f(t.width)}`],true,supportColumn(p).field);output.push(dr.drawing);
 }
 return output;
}
