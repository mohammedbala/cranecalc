import {girderEndFork} from '../engine/craneColumnInputs';
import {activeColumnCap as columnCapOf} from '../engine/columnCapInputs';
import {capChannelProfile} from '../engine/channelProfile';
import {supportColumn,tieReceiverColumn} from '../engine/drawingData';
import {bracketForceTopic} from './bracketForceTable';
import {existingBracketLabel} from '../engine/bracketProfiles';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {usesRolledBracket,projectStub} from '../engine/rolledBracket';
import {usesTaperedHaunch} from '../engine/taperedHaunch';
import {taperedHaunchParts} from '../engine/taperedHaunchParts';
import {simpleSupportInput} from '../engine/simpleSupports';
import {connectionOptionChecks} from '../engine/connectionOptions';
import {ribGeometry} from '../engine/bracketRib';
import {flangeTieGeometry,tiePlies} from '../engine/tieGeometry';
import {bearingStiffenerProfile} from './bearingStiffenerGeometry';
import { Draft, type CadDrawing } from './drafting';
import { boltProperties } from '../engine/connectionStrength';
import { activeEndBearing, endBearingGeometry } from '../engine/endBearing';
import { flangeRestraintStations } from '../engine/detailAnalysis';
import type { CalculationSnapshot } from '../engine/types';
import { format } from '../engine/units';
import { plateInches } from './drawingFormat';
import { detailSheetNumbers } from './planSheet';
import {railSeat,clipOutline} from '../engine/railSeat';
import {railJointType,railJointGap,railJointBars,railJointDetail,supplierRailJoint} from '../engine/railLayout';
import {supplierRailJointText} from '../engine/railChecks';
import {capAngleGeometry,capAngleTieParts,capBoltNutEnvelope,boltHardware} from '../engine/capAngle';
import {capChannelProfile as channelOutline} from '../engine/channelProfile';
export function detailedDrawings(s:CalculationSnapshot):CadDrawing[]{
 const p=s.input,d=p.details;if(!d)return [];
 if(connectionOptionChecks(p).length)return [];
 const f=(v:number)=>plateInches(v,p.units),force=(v:number)=>format(v,'force',p.units,2);
 // Drawing sheets that carry the matching details, e.g. "S-02" or "S-02, S-03".
 const sheetOf=detailSheetNumbers(s),sheets=(...keys:string[])=>[...new Set(keys.map(sheetOf))].join(', ');
 const output:CadDrawing[]=[];
 {
 const k=260/p.section.d,b=p.section,bs=d.bearing,fork=girderEndFork(p),dr=new Draft(s,'bearing-detail','Girder bearing / flange-restraint section','SK-04',500,1/k,fork?'Column cap, new column, base and foundations: designed in this calculation. No top-flange tie: the end fork restrains the top flange.':`${d.bracket?.enabled?'':'Building bracket, '}${d.bracket?.enabled?'Building frame':'frame'}, anchorage and foundations: by others.`);
 const cx=265,y=80,left=cx-b.bf*k/2,right=cx+b.bf*k/2;
 dr.rect(left,y,b.bf*k,b.tf*k);dr.rect(cx-b.tw*k/2,y+b.tf*k,b.tw*k,(b.d-2*b.tf)*k);dr.rect(left,y+(b.d-b.tf)*k,b.bf*k,b.tf*k);
 for(const sign of [-1,1])dr.poly(bearingStiffenerProfile(bs.stiffenerWidth,b.d-2*b.tf,bs.cope).map(([z,v])=>[cx+sign*(b.tw/2+z)*k,y+(b.tf+v)*k]),true);
 dr.rect(cx-bs.width*k/2,y+b.d*k,bs.width*k,bs.thickness*k);dr.hatch(cx-bs.width*k/2,y+b.d*k,bs.width*k,bs.thickness*k);
 dr.dimH(cx-bs.width*k/2,cx+bs.width*k/2,y+b.d*k+bs.thickness*k,400,`SEAT WIDTH ${f(bs.width)}`);
 // The W depth from the top of the W flange; with a cap, the capped depth from the top of the channel web, further out.
 dr.dimV(y,y+b.d*k,right,430,`${b.kind==='cap'?b.name.split(' + ')[0]:b.name} / d ${f(b.d)}`);
 if(b.kind==='cap'){dr.poly(capChannelProfile(b).outline.map(([x,z])=>[cx+x*k,y-z*k]),true);dr.dimV(y-b.capTw*k,y+b.d*k,right+30,470,`${b.name} / d ${f(b.d+b.capTw)}`);}
 const notes=[`Bearing plate: ${f(bs.width)} wide × ${f(bs.length)} along girder × ${f(bs.thickness)}`,`Pair fitted stiffeners: outstand ${f(bs.stiffenerWidth)} × ${f(bs.stiffenerThickness)}`,`Web-side corner cope: ${f(bs.cope)}; web fillets: ${f(bs.weldSize)}, four lines`,b.kind==='cap'?`Fit/mill ends; top flange CJP; continuous web fillets`:`Fit/mill ends; continuous web AND flange fillets`,`${fork?'End forks (top-flange restraint, no tie)':'Top-flange ties'} at x: ${flangeRestraintStations(p).top.map(f).join(', ')}${capAngleGeometry(p)?' (cap tieback angles, SK-06)':''}`,activeEndBearing(p)?'Bottom flange held by the bolted end bearings (SK-05); no bottom ties':`Bottom-flange ties at x: ${flangeRestraintStations(p).bottom.map(f).join(', ')}`,`${fork?'Fork':'Tie'} stiffness at ${activeEndBearing(p)?'the top flange':'EACH flange'}: ${format(s.detailResults?.braceStiffness??0,'stiffness',p.units,0)}`,`Grid reaction, both girder ends (factored): ${format(s.designAnalysis?.reaction??0,'force',p.units,1)}`,`End rotation clearance: ${f(d.criteria.rotationClearance)}`];
 notes.forEach((n,i)=>dr.text(500,85+29*i,n,10));dr.text(80,55,'SECTION AT SUPPORT; STIFFENERS ALSO AT EACH RESTRAINT',10);output.push(dr.drawing);
 }
 const eb=activeEndBearing(p);
 if(eb){
  // SK-05: bolted end bearing hole patterns on the girder bottom flange.
  // Seven note lines at 24 apart from y = 330, then the title block (54 high) below them.
  const sk05Height=330+24*7+64;
  const g=endBearingGeometry(p,eb),bs=d.bearing,k=Math.min(150/bs.length,200/Math.max(p.section.bf,bs.width)),y0=110,dr=new Draft(s,'end-connection-detail','Bolted end bearing / locating and sliding hole patterns','SK-05',sk05Height,1/k,p.system==='continuous'?'Bottom flange plan at each support. Standard holes at the locating support; long slots at every other support under plate washers.':'Bottom flange plan at each girder end. Standard holes at the locating end; long slots at the sliding end under plate washers.');
  for(const [i,role] of (p.system==='continuous'?['LOCATING SUPPORT','SLIDING SUPPORTS']:['LOCATING END','SLIDING END']).entries()){
   const x0=110+i*250,W=Math.max(p.section.bf,bs.width);
   dr.rect(x0,y0+(W-p.section.bf)*k/2,bs.length*k,p.section.bf*k);dr.rect(x0,y0,bs.length*k,bs.width*k,'HIDDEN');dr.text(x0,y0-14,role,10);
   for(const r of g.rows)for(const side of [-1,1]){const cx=x0+r*k,cy=y0+W*k/2+side*eb.bolts.gauge*k/2;
    if(i===0)dr.circle(cx,cy,g.hole*k/2);
    else{const hl=g.slot*k/2,hr=g.hole*k/2,pts:[number,number][]=[];for(let a=0;a<=12;a++){const t=-Math.PI/2+Math.PI*a/12;pts.push([cx+hl-hr+hr*Math.cos(t),cy+hr*Math.sin(t)]);}for(let a=0;a<=12;a++){const t=Math.PI/2+Math.PI*a/12;pts.push([cx-hl+hr+hr*Math.cos(t),cy+hr*Math.sin(t)]);}dr.poly(pts,true);dr.rect(cx-g.washer.length*k/2,cy-g.washer.width*k/2,g.washer.length*k,g.washer.width*k,'HIDDEN');}
    dr.line(cx-8,cy,cx+8,cy,'CENTER');dr.line(cx,cy-8,cx,cy+8,'CENTER');}
   dr.dimH(x0,x0+g.rows[0]*k,y0+W*k,y0+W*k+22,`${f(g.rows[0])}`);dr.dimH(x0+g.rows[0]*k,x0+g.rows[1]*k,y0+W*k,y0+W*k+22,`${f(g.spacing)}`);
  }
  const notes=[`4 ${eb.bolts.grade} bolts each ${p.system==='continuous'?'support':'end'}, diameter ${f(eb.bolts.diameter)}; gauge ${f(eb.bolts.gauge)}`,`Locating: ${f(g.hole)} standard holes in all plies; pretensioned, Class B (SC)`,`Sliding: ${f(g.slotWidth)} × ${f(g.slot)} slots in the girder flange`,`Sliding allowance ${f(g.travel)} each way; ${g.sleeve?`bolts pretensioned against ${f(g.sleeve.od)} OD steel sleeves`:'SNUG-TIGHT BOLTS ENTERED: NOT PERMITTED, see calc'}`,`Plate washers ${f(eb.washerThickness)} × ${f(g.washer.width)} × ${f(g.washer.length)}`,`Bolt rows ${f(eb.bolts.edge)} from each bearing plate end, clear of the stiffeners`];
  notes.forEach((n,i)=>dr.text(110,330+24*i,n,10));output.push(dr.drawing);
 }
 // A flexible plate tie laps one face of each gusset: one ply in single shear, with the lap couple, bolt tension and prying checked.
 const single=tiePlies(p)===1;
 // SK-06 shows the tie that is checked: the cap tieback angle is drawn from the engine's tie parts (capAngleTieParts);
 // the gusseted double-cover template applies only to the flange-tie family.
 const capTie=capAngleGeometry(p)?capAngleSketch(s):undefined;
 // A girder on a column cap has no tie (its end fork restrains the top flange): no tie connection sketch.
 for(const [key,c,title,number,central] of [...(eb?[]:[['end',d.end,'Girder web end / longitudinal double-cover connection','SK-05',p.section.tw]] as const),...(capTie||girderEndFork(p)?[]:[['tie',d.brace.connection,single?'Flexible plate tie / single-shear lap connection':'Both-flange tie / symmetric double-cover connection','SK-06',d.brace.gussetThickness]] as const)]){
 const one=key==='tie'&&single,w=c.gauge+2*c.edge,h=(c.rows-1)*c.pitch+2*c.edge,k=Math.min(240/w,230/h),x=125,y=90,dr=new Draft(s,`${key}-connection-detail`,title,number,500,1/k,one?'One flexible plate on one gusset face; standard holes, pretensioned. Lap couple, bolt tension with prying and slip are checked.':'In-plane force template. Two cover plates; standard holes. Out-of-plane forces/prying require another model.');
 dr.rect(x,y,w*k,h*k);const hole=boltProperties(c.grade,c.diameter).hole;
 for(let row=0;row<c.rows;row++)for(let col=0;col<2;col++){const bx=x+(c.edge+col*c.gauge)*k,by=y+(c.edge+row*c.pitch)*k;dr.circle(bx,by,hole*k/2);dr.line(bx-8,by,bx+8,by,'CENTER');dr.line(bx,by-8,bx,by+8,'CENTER');}
 dr.dimH(x,x+w*k,y+h*k,360,`PLATE WIDTH ${f(w)}`);dr.dimV(y,y+h*k,x,85,`HEIGHT ${f(h)}`);dr.dimH(x+c.edge*k,x+(c.edge+c.gauge)*k,y,62,`GAUGE ${f(c.gauge)}`);
 const notes=[`${2*c.rows} ${c.grade} bolts, diameter ${f(c.diameter)}; hole ${f(hole)}`,one?`One flexible plate ${f(d.brace.thickness)} on one face of a ${f(central)} gusset`:`Two cover plates, each ${f(c.thickness)}; central ply ${f(central)}`,`Rows at ${f(c.pitch)}; all plate-edge distances ${f(c.edge)}`,`Class ${c.surface} faying surfaces; ${one?'one slip/shear plane':'two slip/shear planes'}`,`Load-line to weld eccentricity: ${f(c.projection)}`,`Two effective root fillets: ${f(c.weldSize)} × ${f(c.weldLength)}`,key==='tie'?one?`One flexible plate per tied flange: ${f(d.brace.width)} × ${f(d.brace.thickness)}`:`Two tie bars per flange: ${f(d.brace.width)} × ${f(d.brace.thickness)}`:'Full reaction plus longitudinal force checked conservatively',key==='tie'?`${one?'Plate':'Bar'} length ${f(d.brace.length)}; lateral reach ${f(d.brace.reach)}`:'Bearing carries gravity; end covers also provide uplift restraint',key==='tie'?`Unbraced ${one?'girder':'central'} gusset length ${f(d.brace.connectionLength)}`:`Provide ${f(d.criteria.rotationClearance)} clearance for simple-end rotation`];
 notes.forEach((n,i)=>dr.text(465,85+28*i,n,10));
 if(key==='tie'){const rc=tieReceiverColumn(p);dr.text(465,345,rc.isNew?`COLUMN-SIDE ROOT: SHOP WELD TO ${rc.name} / ${sheets('connection','flange-tie')}`:`COLUMN-SIDE ROOT: FIELD WELD TO ${rc.building?rc.name:'EXISTING STEEL'} / ${sheets('connection','flange-tie')}`,9);}
 // Actual ply thicknesses in a separated orthographic section.
 let px=125;for(const t of one?[d.brace.thickness,central]:[c.thickness,central,c.thickness]){dr.rect(px,395,90,t*k);px+=110;}dr.text(125,387,'SEPARATED PLY SECTION / THICKNESSES TO SCALE',9);output.push(dr.drawing);
 }
 if(capTie)output.push(capTie);
 {
 const r=d.rail,k=1.25,depth=p.aist!.railDepth,jointKind=railJointDetail(p),dr=new Draft(s,'rail-detail',jointKind==='none'?'Rail clips (one-piece rail, no joint)':jointKind==='welded'?'Rail clips / welded rail joint':railJointType(p)==='tight'?'Rail clips / tight bolted rail joint':'Rail clips / bolted expansion joint','SK-07',620,1/k,`Rail shown without fillets; clips schematic.${railSeat(p).pad?' Pad rating per the supplier.':''} Rail wheel-contact wear and hardness are a supplier selection item.`);
 const cx=255,y=85;dr.rect(cx-r.headWidth*k/2,y,r.headWidth*k,r.headThickness*k,'RAIL');dr.rect(cx-r.webThickness*k/2,y+r.headThickness*k,r.webThickness*k,(depth-r.headThickness-r.baseThickness)*k,'RAIL');dr.rect(cx-r.baseWidth*k/2,y+(depth-r.baseThickness)*k,r.baseWidth*k,r.baseThickness*k,'RAIL');
 // Opposing rail clips on the girder against the rail-base toes, the nose over the rail base (schematic outline).
 const seat=railSeat(p),C=seat.clip,pt=seat.pad?.thickness??0,base=y+depth*k,steel=base+pt*k;
 if(seat.pad)dr.rect(cx-seat.pad.width*k/2,base,seat.pad.width*k,pt*k,'RAIL');
 for(const sign of [-1,1] as const)dr.poly(clipOutline(C,sign).map(([u,z])=>[cx+u*k,steel-z*k]),true);
 dr.fieldFilletLeader(cx-C.outer*k+4,steel-2,cx-C.outer*k+40,steel+48,f(C.weld),['EACH END OF CLIP BASE',`${f(C.weldLength)} LONG, PER MANUFACTURER`]);
 dr.dimV(y,y+depth*k,cx-r.headWidth*k/2,cx-C.outer*k-14,`RAIL DEPTH ${f(depth)}`);dr.dimH(cx-r.baseWidth*k/2,cx+r.baseWidth*k/2,y+depth*k,310,`BASE ${f(r.baseWidth)}`);
 const rated=(v:number)=>format(v,'force',p.units,1);
 const rn=[`Head ${f(r.headWidth)} × ${f(r.headThickness)}; web ${f(r.webThickness)}`,`Base ${f(r.baseWidth)} × ${f(r.baseThickness)}; rail Fy ${format(r.Fy,'stress',p.units)}`,`Rail clips: ${C.type}, floating, per manufacturer (${C.product.split(/[:;,]/)[0]})`,`Rated per clip (${C.basis}): lateral ${rated(C.lateral)}, uplift ${rated(C.uplift)}`,`Opposing pairs at ${f(p.aist!.clipSpacing)} max.${jointKind==='none'?'':'; a pair each side of every joint'}`,`Base welded to the ${p.section.kind==='cap'?'cap channel':'top flange'}: ${f(C.weld)} fillet, each end (min.)`,seat.pad?`Rail pad ${f(pt)} × ${f(seat.pad.width)}, compression rating ${format(r.padAllowable,'stress',p.units)}`:'No rail pad: rail bears on the girder',railJointType(p)==='tight'?`Tight joints, gap 1/16" max. (TR-13 §5.16.1); rail anchored at the end stops, whose gaps take the ${format(r.temperatureRange,'temperatureChange',p.units,0)} swing`:`Rail expansion gap ${f(r.jointGap)}; anchor clip pair at mid-length of each piece`,`No rail/girder composite action`];rn.forEach((n,i)=>dr.text(cx+C.outer*k+20,85+i*26,n,10));
 if(jointKind==='welded'){dr.text(80,380,'Rail joints: thermite or flash-butt welded by the rail supplier\'s qualified procedure',10);dr.text(80,405,'(preheat, head finish grinding, inspection); no joint bars, bolts or drilled holes',10);}
 if(jointKind==='bars'){
 const jGap=railJointGap(p),tightJoint=railJointType(p)==='tight',joint=railJointBars(p),barLength=joint.length,jx=80,jy=365;
 dr.rect(jx,jy,barLength*k,r.jointPlateHeight*k);dr.line(jx+barLength*k/2-jGap*k/2,jy-8,jx+barLength*k/2-jGap*k/2,jy+r.jointPlateHeight*k+8,'CENTER');dr.line(jx+barLength*k/2+jGap*k/2,jy-8,jx+barLength*k/2+jGap*k/2,jy+r.jointPlateHeight*k+8,'CENTER');
 const dh=boltProperties('A325',r.jointBoltDiameter).hole;
 for(const at of joint.bolts){if(tightJoint)dr.circle(jx+at*k,jy+r.jointPlateHeight*k/2,dh*k/2,'HIDDEN');else dr.rect(jx+(at-.75*r.jointBoltDiameter)*k,jy+(r.jointPlateHeight-dh)*k/2,1.5*r.jointBoltDiameter*k,dh*k,'HIDDEN');dr.circle(jx+at*k,jy+r.jointPlateHeight*k/2,r.jointBoltDiameter*k/2);}
 // The rail supplier's bars: schematic, the demands instead of a size (a deferred submittal).
 const supplierText=supplierRailJoint(p)?supplierRailJointText(s):undefined;
 if(supplierText){dr.text(jx,jy+r.jointPlateHeight*k+40,'Joint bars and bolts by the rail supplier (deferred submittal) · schematic',10);
  const words=`Design for the ${supplierText}.`.split(' '),rows:string[]=[];for(const w of words){const last=rows.at(-1);if(last&&(last+' '+w).length<=60)rows[rows.length-1]=last+' '+w;else rows.push(w);}
  rows.forEach((v,i)=>dr.text(620,370+25*i,v,10));
 }else{
 dr.dimH(jx,jx+barLength*k,jy+r.jointPlateHeight*k,520,`JOINT BARS ${f(barLength)} LONG × ${f(r.jointPlateHeight)} HIGH × ${f(r.jointPlateThickness)} EACH`);
 dr.text(620,370,`4 A325 bolts, diameter ${f(r.jointBoltDiameter)}`,10);dr.text(620,395,`2 bolts each side; pitch ${f(r.jointPitch)}`,10);dr.text(620,420,`Edge ${f(r.jointEdge)}; ${f(joint.centerEdge)} to joint C/L; two shear planes`,10);dr.text(620,445,tightJoint?`Joint bars: ${f(dh)} standard holes`:`Joint bars slotted ${f(1.5*r.jointBoltDiameter)} × ${f(dh)} along rail`,10);dr.text(620,470,`Rail web: ${f(dh)} drilled holes; pretensioned`,10);dr.text(620,520,'Joint bolts re-tightened per the bolting notes',10);dr.text(620,495,'Rail clip pair on each cut rail end',10);
 }
 }
 output.push(dr.drawing);
 }
 if(p.section.kind==='cap'&&p.capDesign){
  const b=p.section,c=p.capDesign,k=230/b.d,dr=new Draft(s,'cap-attachment-detail','Continuous cap-channel attachment','SK-08',500,1/k,`Full-bearing cap; continuous longitudinal fillets; ${capAngleGeometry(p)?'no holes in the channel except the cap tieback bolt holes (SK-06); none in the W top flange':'no holes in channel / W top flange'}. See ${sheets('cap')} for printed scales.`);
  const cx=220,y=105,left=cx-b.bf*k/2,right=cx+b.bf*k/2;
  dr.rect(left,y,b.bf*k,b.tf*k);dr.rect(cx-b.tw*k/2,y+b.tf*k,b.tw*k,(b.d-2*b.tf)*k);dr.rect(left,y+(b.d-b.tf)*k,b.bf*k,b.tf*k);
  dr.poly(capChannelProfile(b).outline.map(([x,z])=>[cx+x*k,y-z*k]),true);
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
 // Two girder ends meet only at an interior support: a single-span runway has none. On a column cap the girder ends
 // share the cap (designed here) and each is held by its end fork, with no tie.
 if(p.system==='simple'&&p.spans.length>1){
  const c=simpleSupportInput(p),b=p.section,bs=d.bearing,k=Math.min(230/b.d,370/(4*bs.length+c.endGap)),cx=265,y=100,g=c.endGap*k/2,l=bs.length*k,onCap=!!columnCapOf(p),fork=girderEndFork(p);
  const dr=new Draft(s,'independent-support-detail',onCap?'Independent girder ends / shared column cap':'Independent girder ends / shared column bracket','SK-09',580,1/k,fork?'Reference AIST Technical Report 13 §5.8.1 / separate bearings and end forks on the cap / column cap designed in this calculation.':onCap?'Reference AIST Technical Report 13 §5.8.1 / separate bearings on the cap and separate girder ties to the building column / column cap designed in this calculation.':'Reference AIST Technical Report 13 §5.8.1 / separate bearings and ties / receiving attachments by building designer.');
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
  [`SEPARATE BEARING PL ${f(bs.thickness)} X ${f(bs.width)} X ${f(bs.length)}`,'PAIRED BEARING STIFFENERS AT EACH END / SK-04','LEFT END OF EACH BAY: LONGITUDINAL LOCATING','RIGHT END OF EACH BAY: SLIDING',`MOVEMENT ALLOWANCE ${f(c.guideTravel)} EACH DIRECTION`,fork?'END FORK AT EACH GIRDER END: BEARING STIFFENERS AND BOLTED BOTTOM FLANGE, NO TIE':capAngleGeometry(p)?'CAP TIEBACK ANGLE AT EACH GIRDER END / SK-06':activeEndBearing(p)?`INDIVIDUAL TOP-FLANGE TIES TO ${onCap?'BUILDING ':''}COLUMN / SK-06`:'INDIVIDUAL TOP / BOTTOM TIES TO COLUMN / SK-06','DO NOT SPLICE GIRDER FLANGES OR CAP ACROSS GAP',usesExistingBracket(p)?`EXISTING BRACKET / NEW SEAT: SK-10 / ${sheets('bracket')}`:d.bracket?.enabled?`${usesTaperedHaunch(p)?'TAPERED I HAUNCH':usesRolledBracket(p)?'WIDE-FLANGE BRACKET':'WELDED BRACKET / SPREADER'}: SK-10 / ${sheets('bracket')}`:onCap?`COLUMN CAP: ${sheets('column-cap')}`:'COLUMN BRACKET / SPREADER: REFERENCE ONLY',...(fork?[]:['MOVEMENT-COMPATIBLE ATTACHMENTS REQUIRE DESIGN']),`${fork?'COLUMN CAP':'BRACKET'} DESIGN FORCES: SEE ${sheets(bracketForceTopic(s)??'support')}`].forEach((note,i)=>dr.text(520,110+i*30,note,9));
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
 if(d.bracket?.enabled&&usesRolledBracket(p)){
  // Rolled wide-flange bracket: the stub in side view, its seat, bearing stiffener and the welds to the column.
  const b=d.bracket,st=projectStub(p),r=st.input,seat=st.seat,k=Math.min(270/st.L,230/(st.d+(seat?.t??0))),sc=supportColumn(p);
  const dr=new Draft(s,'welded-column-bracket',`Welded ${st.name} column bracket`,'SK-10',560,1/k,`AISC F2/F3, G2, H3.3, J2, J10 and Appendix 3 / Reference AIST Technical Report 13 5.9.2 / see ${sheets('bracket')}.`);
  const face=365,top=100,ft=top+(seat?.t??0)*k,bot=ft+st.d*k,tip=face-st.L*k,center=face-b.reach*k;
  dr.rect(face,75,b.receiver.flangeThickness*k,bot-50,'HIDDEN');
  if(seat)dr.rect(face-seat.y1*k,top,(seat.y1-seat.y0)*k,seat.t*k);
  dr.rect(tip,ft,st.L*k,st.d*k);dr.line(tip,ft+st.tf*k,face,ft+st.tf*k);dr.line(tip,bot-st.tf*k,face,bot-st.tf*k);
  if(st.stiffener)dr.rect(center-st.stiffener.t*k/2,ft+st.tf*k,st.stiffener.t*k,(st.d-2*st.tf)*k);
  dr.dimH(tip,face,bot,bot+36,f(st.L));dr.dimV(ft,bot,tip,tip-28,f(st.d));dr.dimH(center,face,top,60,f(b.reach));
  [`${st.name} X ${f(st.L)} STUB, ASTM A992`,...(seat?[`SEAT PL ${f(seat.t)} X ${f(seat.length)}, ${f(seat.weld).replaceAll('"','')} FILLETS AT FLANGE TIPS`]:['BEARINGS ON THE STUB TOP FLANGE']),...(st.stiffener?[`2 STIFF. PL ${f(st.stiffener.t)} AT GIRDER C/L, ${f(st.stiffener.weld).replaceAll('"','')} FILLETS`]:[]),r.flangeJoint==='cjp'?'FLANGES: CJP GROOVE WELDS TO COLUMN':`FLANGES: ${f(r.flangeWeld).replaceAll('"','')} FILLETS BOTH FACES`,'TORSION FROM OFFSET BEARINGS: SEE CALCULATION','KEEP SLIDING GIRDER BEARINGS FREE','GLOBAL COLUMN / FRAME / FOUNDATIONS: SEPARATE'].forEach((v,i)=>dr.text(485,100+i*29,v,10));
  dr.fieldFilletLeader(face,(ft+bot)/2,485,337,f(r.webWeld),[`${sc.weld} WEB TO ${sc.name}`,'BOTH SIDES, BETWEEN FILLETS'],true,sc.field);
  output.push(dr.drawing);
 }
 if(d.bracket?.enabled&&usesTaperedHaunch(p)){
  // Built-up tapered I haunch: its profile looking along the runway, the stiffener at the girder web line, welds to the column.
  const parts=taperedHaunchParts(p),g=parts.geometry,b=d.bracket,sc=supportColumn(p),k=Math.min(270/g.L,230/g.hr);
  const dr=new Draft(s,'welded-column-bracket','Built-up tapered I haunch column bracket','SK-10',560,1/k,`AISC F4/F5, G2, H1, H3.3, J2, J10 and Appendix 3; AISC DG25 / Reference AIST Technical Report 13 5.9.2 / see ${sheets('bracket')}.`);
  const face=365,top=100,X=(y:number)=>face-y*k,Y=(z:number)=>top-z*k,inner=(y:number)=>-g.depth(y)+g.tbv;
  dr.rect(face,75,b.receiver.flangeThickness*k,g.hr*k+50,'HIDDEN');
  dr.rect(X(g.L),top,g.L*k,g.tt*k);
  dr.poly([[X(0),Y(-g.hr)],[X(g.L),Y(-g.ht)],[X(g.L),Y(inner(g.L))],[X(0),Y(inner(0))]],true);
  dr.line(X(g.L),Y(-g.tt),X(g.L),Y(inner(g.L)));
  const st=g.stiffener;dr.rect(X(g.a+st.t/2),Y(-g.tt),st.t*k,st.height*k);
  dr.dimH(X(g.L),face,Y(-g.hr),Y(-g.hr)+36,f(g.L));dr.dimV(top,Y(-g.ht),X(g.L),X(g.L)-28,f(g.ht));dr.dimV(top,Y(-g.hr),X(g.L),X(g.L)-56,f(g.hr));dr.dimH(X(g.a),face,top,60,f(g.a));
  [`WEB PL ${f(g.tw)}; TOP FL. PL ${f(g.tt)} X ${f(g.bt)}${g.flare?` (${f(g.btr)} AT COLUMN)`:''}`,`BOTTOM FL. PL ${f(g.tb)} X ${f(g.bb)}, SLOPE ${g.degrees.toFixed(1)} DEG`,`2 STIFF. PL ${f(st.t)} X ${f(st.width)} AT GIRDER C/L`,g.joint==='cjp'?'FLANGES: CJP GROOVE WELDS TO COLUMN':`FLANGES: ${f(g.flangeWeld).replaceAll('"','')} FILLETS BOTH FACES`,`FLANGES TO WEB: ${f(g.flangeWebWeld).replaceAll('"','')} FILLETS BOTH SIDES, SHOP`,'TORSION FROM OFFSET BEARINGS: SEE CALCULATION','GLOBAL COLUMN / FRAME / FOUNDATIONS: SEPARATE'].forEach((v,i)=>dr.text(485,100+i*29,v,10));
  dr.fieldFilletLeader(face,Y((-g.tt+inner(0))/2),485,337,f(g.webWeld),[`${sc.weld} WEB TO ${sc.name}`,'BOTH SIDES'],true,sc.field);
  void parts;
  output.push(dr.drawing);
 }
 if(d.bracket?.enabled&&!usesExistingBracket(p)&&!usesRolledBracket(p)&&!usesTaperedHaunch(p)){
  const b=d.bracket,rg=ribGeometry(b),k=Math.min(270/b.seatProjection,250/b.ribDepth),dr=new Draft(s,'welded-column-bracket',rg.tapered?'Welded gravity bracket / two haunched ribs':'Welded gravity bracket / two rectangular ribs','SK-10',560,1/k,`AISC F11, J2, J4, J10 and Appendix 3 / Reference AIST Technical Report 13 5.9.2 / see ${sheets('bracket')}.`);
  const face=365,top=100,tip=face-b.seatProjection*k,root=top+b.seatThickness*k,bot=root+b.ribDepth*k;
  dr.rect(face,75,b.receiver.flangeThickness*k,bot-50,'HIDDEN');dr.rect(tip,top,b.seatProjection*k,b.seatThickness*k);
  if(rg.tapered){dr.poly([[tip,root],[face,root],[face,bot],[tip,root+rg.tip*k]],true);dr.dimH(tip,face,bot,bot+36,f(b.seatProjection));dr.dimV(root,root+rg.tip*k,tip,tip-28,f(rg.tip));dr.dimV(root,bot,tip,tip-56,f(b.ribDepth));dr.line(face-2,bot,tip,bot,'DIMENSION');}
  else{dr.rect(tip,root,b.seatProjection*k,b.ribDepth*k);
  dr.dimH(tip,face,bot,bot+36,f(b.seatProjection));dr.dimV(root,bot,tip,tip-28,f(b.ribDepth));}
  dr.dimH(face-b.reach*k,face,top,60,f(b.reach));
  [`SEAT PL ${f(b.seatThickness)} X ${f(b.seatLength)} X ${f(b.seatProjection)}`,rg.tapered?`2 HAUNCHED RIBS ${f(b.ribThickness)}, ${f(rg.root)} ROOT TO ${f(rg.tip)} TIP`:`2 RECTANGULAR RIBS ${f(b.ribThickness)} X ${f(b.ribDepth)}`,`RIB CENTERS ${f(b.ribSpacing)}`,`SEAT FILLETS ${f(b.seatWeld).replaceAll('"','')} / BOTH SIDES / FULL PROJECTION`,'HORIZONTAL LOADS: SEPARATE COLUMN ATTACHMENTS','KEEP SLIDING GIRDER BEARINGS FREE','GLOBAL COLUMN / FRAME / FOUNDATIONS: SEPARATE'].forEach((v,i)=>dr.text(485,100+i*29,v,10));
  dr.fieldFilletLeader(face,root+b.ribDepth*k*.55,485,337,f(b.rootWeld),[`${supportColumn(p).weld} RIBS TO ${supportColumn(p).name}`,rg.tapered?'CONT. FULL ROOT DEPTH / BOTH SIDES':'CONT. FULL DEPTH / BOTH SIDES'],true,supportColumn(p).field);
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
   dr.poly(capChannelProfile(b).outline.map(([x,z])=>[X(x),Y(-b.tf-z)]),true);
  }
  dr.rect(X(tie.rootStart),y,tie.rootLength*k,a.saddleThickness*k);
  dr.rect(X(tie.rootStart),Y(a.saddleThickness),(tie.gussetEnd-tie.rootStart)*k,(tie.topDrop+t.width/2-a.saddleThickness)*k);
  dr.rect(X(tie.start),Y(tie.topDrop-t.width/2),t.length*k,t.width*k);
  dr.rect(X(tie.columnGussetStart),Y(tie.topDrop-tie.columnGusset/2),tie.columnGussetLength*k,tie.columnGusset*k);
  dr.line(X(tie.face),Y(-30),X(tie.face),Y(tie.topDrop+t.width/2+30),'HIDDEN');
  for(const offset of [0,t.length-tie.connection])for(let row=0;row<c.rows;row++)for(const sign of [-1,1])dr.circle(X(tie.start+offset+c.edge+row*c.pitch),Y(tie.topDrop+sign*c.gauge/2),boltProperties(c.grade,c.diameter).hole*k/2);
  dr.dimH(X(tie.start),X(tie.barEnd),Y(tie.topDrop+t.width/2),360,f(t.length));
  dr.dimV(Y(tie.topDrop-t.width/2),Y(tie.topDrop+t.width/2),X(tie.face),X(tie.face)+30,f(t.width));
  const notes=[single?`FLEXIBLE PL ${f(t.thickness)} X ${f(t.width)} / ${f(t.length)} LONG, SINGLE SHEAR`:`2 FL ${f(t.thickness)} X ${f(t.width)} / ${f(t.length)} LONG`, single?`GUSSETS ${f(t.gussetThickness)}; PLATE ON THE FACE TOWARD THE GIRDER END`:`CENTRAL GUSSETS ${f(t.gussetThickness)}`,`SADDLE PL ${f(a.saddleThickness)} X ${f(a.saddleLength)} X ${f(tie.rootLength)}`,`SADDLE TO FLANGE: ${f(a.weldSize).replaceAll('"','')} TRANSVERSE END FILLET EACH END X ${f(tie.endWeldLength)}`,`GUSSET TO SADDLE: ${f(a.weldSize).replaceAll('"','')} FILLETS BOTH FACES X ${f(tie.rootLength)}`,`${2*c.rows} - ${f(c.diameter)} ${c.grade} EACH END`, `TIE SETBACK ${f(a.longitudinalSetback)} FROM BEARING CENTER`,`CLEAR CAP AND ROOT BY ${f(a.clearance)} MINIMUM`, 'NO HOLES OR CUTS THROUGH CAP / W FLANGES',`BOTTOM TIE AT SAME SADDLE OFFSET / SEE ${sheets('flange-tie')}`];
  notes.forEach((v,i)=>dr.text(545,95+i*29,v,9));
  dr.fieldFilletLeader(X(tie.face),Y(tie.topDrop),545,385,f(c.weldSize),[`${supportColumn(p).weld} GUSSET TO ${supportColumn(p).name}`,`TWO CONT. LINES X ${f(tie.columnGusset)}`],true,supportColumn(p).field);output.push(dr.drawing);
 }
 return output;
}

/**
 * SK-06 for the cap tieback angle: section at the tie looking along the runway, drawn from the engine's tie parts
 * (capAngleTieParts / capBoltNutEnvelope) so the sketch is the checked arrangement: the angle on the column-side cap
 * channel flange, the cap bolts with the beveled washers and nuts inside the channel, the tie plate lapped on the long
 * leg, the end plate, shims and column bolts in field-drilled holes.
 */
function capAngleSketch(s:CalculationSnapshot):CadDrawing|undefined{
 const p=s.input,g=capAngleGeometry(p),parts=capAngleTieParts(p);if(!g||!parts)return undefined;
 const f=(v:number)=>plateInches(v,p.units),c=g.input,b=p.section,col=g.column.receiver;
 const yMin=b.tw/2-12.7,yMax=g.face+(col?.tf??19.05)+38.1,zMax=Math.max(g.endPlate.z1,g.plate.z1)+25.4,zMin=Math.min(g.endPlate.z0,-g.dv,-b.capDepth)-25.4;
 const k=Math.min(420/(yMax-yMin),300/(zMax-zMin)),x0=60,y0=80+zMax*k,X=(y:number)=>x0+(y-yMin)*k,Z=(z:number)=>y0-z*k;
 const dr=new Draft(s,'tie-connection-detail',`Cap tieback angle ${c.shape} / bolted to the cap channel and the column`,'SK-06',540,1/k,'Section at the tie looking along the runway; plate washers, sleeves and slots per the cap tieback checks.');
 // Girder context: W top flange and web, cap channel in true section (hidden: not part of the tie).
 const top=-b.capTw;dr.rect(X(yMin),Z(top),(b.bf/2-yMin)*k,b.tf*k,'HIDDEN');dr.rect(X(-b.tw/2),Z(top-b.tf),b.tw*k,(zMax-zMin)*k*.25,'HIDDEN');
 dr.poly(channelOutline(b).side.map(([x,z])=>[X(x),Z(z+top)] as [number,number]),false,'HIDDEN');
 for(const box of parts.boxes){
  if(box.kind==='sleeve')continue;
  const ctx=box.kind==='channel-flange'||box.kind==='column-flange';
  if(box.kind==='channel-flange')continue;
  const z1=box.name.startsWith('angle short leg')?-g.ta:box.max[2];
  dr.rect(X(box.min[1]),Z(z1),(box.max[1]-box.min[1])*k,(z1-box.min[2])*k,ctx?'HIDDEN':'OUTLINE');
 }
 // Cap bolts: plate washer and head outside, beveled washer, nut and bolt end inside the channel.
 const hw=boltHardware(g.cap.diameter),zc=g.cap.z,head=parts.bolts.find(v=>v.group==='cap')!.head[1];
 dr.rect(X(head),Z(zc+hw.corners/2),hw.head*k,hw.corners*k);
 for(const part of capBoltNutEnvelope(g)[0].parts)dr.rect(X(part.min[1]),Z(part.max[2]),(part.max[1]-part.min[1])*k,(part.max[2]-part.min[2])*k);
 dr.line(X(g.y0-g.cap.seat.nutFace-hw.nut-hw.stick)-6,Z(zc),X(head+hw.head)+6,Z(zc),'CENTER');
 // Lap bolts (vertical) and column bolts (horizontal): center lines through the plies.
 for(const v of parts.bolts.filter(v=>v.group==='lap').slice(0,1))dr.line(X(v.head[1]),Z(v.head[2]+12),X(v.nut[1]),Z(v.nut[2]-12),'CENTER');
 for(const v of parts.bolts.filter(v=>v.group==='column'))dr.line(X(v.head[1])-8,Z(v.head[2]),X(v.nut[1])+8,Z(v.head[2]),'CENTER');
 dr.dimH(X(g.y0),X(g.face),Z(zMin)+10,Z(zMin)+34,`ANGLE BACK TO COLUMN FACE ${f(g.face-g.y0)}`);
 dr.dimV(Z(0),Z(zc),X(g.y0),X(g.y0)-26,`${f(g.cap.gauge)}`);
 const seat=g.cap.seat,cl=g.column,lap=g.lap,ep=g.endPlate;
 const notes=[
  `${c.shape} × ${f(c.length)} long at each girder end, centered ${f(c.setback)} from the girder end`,
  `Cap bolts: 2 - ${f(g.cap.diameter)} ${g.cap.grade} at ${f(g.cap.pitch)}, ${f(g.cap.gauge)} below top of cap`,
  `${f(g.cap.slotWidth)} × ${f(g.cap.slotLength)} horizontal slots in the angle; ${g.cap.sleeved?`pretensioned against ${f(g.cap.sleeve!.od)} OD sleeves`:'PRETENSIONED BOLTS REQUIRED (see calc)'}`,
  `Plate washers ${f(g.cap.washer.thickness)} × ${f(g.cap.washer.height)} × ${f(g.cap.washer.length)} over the slots`,
  `${seat.washer.kind==='beveled'?`F436 1:6 beveled washers (${f(seat.washer.width)} sq.)`:'F436 washers'} under the nuts; flange ${f(seat.thickness)} at the bolt line`,
  `Tie plate ${f(g.plate.thickness)} × ${f(g.plate.width)} × ${f(g.plate.length)} lapped on the horizontal leg`,
  `Lap bolts: 2 - ${f(lap.diameter)} ${lap.grade} slip-critical Class ${lap.surface}, short slots`,
  `End plate ${f(ep.thickness)} × ${f(ep.width)} × ${f(ep.height)}; ${f(g.weld)} fillets both faces`,
  `Column bolts: 2 - ${f(cl.diameter)} ${cl.grade}, ${f(2*cl.gauge)} apart, field-drilled holes`,
  `Finger shims up to ${f(g.shim.max)}; no welding at the tie (cap, girder, column)`];
 notes.forEach((n,i)=>dr.text(560,80+i*26,n,9));
 return dr.drawing;
}
