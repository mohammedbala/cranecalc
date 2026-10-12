import type {ProjectInput} from '../engine/types';
import {componentDetail,type Component} from './figureDetails';
import {activeEndBearing} from '../engine/endBearingInputs';
import {isoTopicFigure} from '../report/hairline/topics';
import {railSeat} from '../engine/railSeat';

/** Shared explanatory linework for the live worksheet and server-rendered PDF.
 * Black and white: the components a figure is about are drawn heavy with a light gray fill, everything else is
 * thin context, and numbered markers follow the load path in the order the caption lists it. The caption names
 * the actual detail from the project inputs. Geometry is schematic: results and applicability stay in the checks.
 * No SVG ids, external assets or calculated resistances are introduced here. */
export const checkGroupPurpose:Record<string,string>={
 Strength:'Resist the governing bending, shear and combined actions without yielding or instability.',
 'Cap channel':'Transfer load between the beam and cap, including end development and local effects.',
 'Local forces':'Prevent concentrated wheel and support forces from damaging flanges or webs.',
 Bracing:'Provide the restraint assumed by the member stability calculation.',
 Loading:'Establish wheel forces, impact, side thrust and the applicable load combinations.',
 Criteria:'Confirm the design scope, service class and project limits used by the checks.',
 Serviceability:'Limit deflection, twist and rail movement for crane operation.',
 Fatigue:'Limit damage from repeated wheel passages and reversing forces at each detail.',
 Detailing:'Check the geometry, movement allowances and detailing assumptions used in the model.',
 Connections:'Transfer lateral and longitudinal forces through members, bolts, plates and welds.',
 'Column bracket':'Carry support reactions and eccentric moments into the receiving column.',
 'Flange attachment':'Transfer flange tie forces through the saddle, local flange and welds.',
 'Rail details':'Transfer wheel and side forces through the rail, keepers, joints and their attachments.',
 Analysis:'Verify equilibrium and numerical convergence before relying on calculated demands.',
 'Existing column':'Check the receiving column for the crane reactions combined with the loads it already carries.',
 'New column':'Design the new freestanding runway column for the crane and runway reactions.',
 'New column base':'Carry the column base reactions through the base plate, anchor rods and footing to the soil.',
 'Supporting structure':'Identify building elements that must be verified outside this calculation for the reported forces.',
 'Longitudinal bracing':'Carry crane traction and stop forces, with the building\'s own wind and seismic forces, to the foundation.',
 'Brace connections':'Develop each rod through its clevis, pin and gusset into the column web and base plate.',
 'Crane-level strut':'Collect the girders\' longitudinal force at every column and carry it to the braced span.',
 'Column cap':'Carry the girder reactions, the girder end fork restraint and the longitudinal force through the cap plate, its stiffeners, bolts and welds into the column.',
 'End bearings':'Seat the girder ends and transfer longitudinal force and uplift through the bearing bolts.',
 'End stops':'Stop the crane: carry the bumper force through the stop and its bolts into the girder and the locating support.',
 'Tie movement':'Let the girder ends rotate and slide without overstressing the ties or their connections.',
 'Cap tieback':'Carry the top flange force from the cap channel through the cap angle, tie plate and end plate into the column flange.',
 'Cap tieback movement':'Let the girder end rotate, slide and deflect at the cap angle without overstressing the tie.'
};
export const worksheetFigureTopics:Record<string,string>={Geometry:'Geometry','Crane loads':'Loading',Criteria:'Criteria',Connections:'Connections',Validation:'Analysis','Existing building':'Interfaces',Project:'Project'};
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const ink='#000',fillFocus='#d4d4d4',muted='#444';
const path=(d:string,focus=false,dashed=false)=>`<path d="${d}" fill="none" stroke="${ink}" stroke-width="${focus?2:.9}"${dashed?' stroke-dasharray="4 3"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
const rect=(x:number,y:number,w:number,h:number,focus=false,dashed=false)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${focus?fillFocus:'white'}" stroke="${ink}" stroke-width="${focus?1.6:.9}"${dashed?' stroke-dasharray="4 3"':''}/>`;
const poly=(d:string,focus=false)=>`<path d="${d}" fill="${focus?fillFocus:'white'}" stroke="${ink}" stroke-width="${focus?1.6:.9}" stroke-linejoin="round"/>`;
const label=(x:number,y:number,text:string,anchor='middle',bold=false)=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="9"${bold?' font-weight="700"':''} fill="${ink}">${escape(text)}</text>`;
const circle=(x:number,y:number,r=3,focus=false)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${focus?fillFocus:'white'}" stroke="${ink}" stroke-width="${focus?1.4:.9}"/>`;
/** Load-path step marker: a circled number matching the caption. */
const mark=(n:number,x:number,y:number)=>`<circle cx="${x}" cy="${y}" r="6.2" fill="white" stroke="${ink}" stroke-width="1.1"/><text x="${x}" y="${y+3.1}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8.5" font-weight="700" fill="${ink}">${n}</text>`;
/** A force: heavy shaft with a solid head. */
function arrow(x:number,y:number,tx:number,ty:number,dashed=false){
 const a=Math.atan2(ty-y,tx-x),size=6;
 return `<path d="M${x} ${y}L${tx-3*Math.cos(a)} ${ty-3*Math.sin(a)}" fill="none" stroke="${ink}" stroke-width="1.7"${dashed?' stroke-dasharray="4 3"':''}/>`+`<path d="M${tx} ${ty}L${tx-size*Math.cos(a-.42)} ${ty-size*Math.sin(a-.42)}L${tx-size*Math.cos(a+.42)} ${ty-size*Math.sin(a+.42)}Z" fill="${ink}"/>`;
}
const dimension=(x:number,to:number,y:number,text:string,above=false)=>path(`M${x} ${y-4}V${y+4}M${to} ${y-4}V${y+4}M${x} ${y}H${to}`)+label((x+to)/2,above?y-6:y+11,text);
const support=(x:number,y:number)=>path(`M${x} ${y}l-6 9h12ZM${x-10} ${y+12}h20`);
const beam=(y=55,focus=false)=>rect(25,y,190,7,focus)+support(30,y+7)+support(210,y+7);
const column=(x=194)=>path(`M${x} 6V112M${x+13} 6V112`,false,true);
const hatch=(x0:number,x1:number,y:number)=>path(Array.from({length:Math.floor((x1-x0)/8)},(_,i)=>`M${x0+i*8} ${y+6}L${x0+i*8+6} ${y}`).join(''));
function section(p:ProjectInput|undefined,x=72,y=31,focus=false,capped=p?.section.kind==='cap'){
 return rect(x,y,60,6,focus)+rect(x+27,y+6,6,45,focus)+rect(x,y+51,60,6,focus)+(capped?path(`M${x-5} ${y+14}V${y-6}H${x+65}V${y+14}`,true):'');
}
/** Rail on a top flange whose upper face is at y, centred at x. */
const railOn=(x:number,y:number,focus=false)=>poly(`M${x-14} ${y}V${y-3}H${x-3}V${y-13}H${x-8}V${y-18}H${x+8}V${y-13}H${x+3}V${y-3}H${x+14}V${y}Z`,focus);
function geometry(p?:ProjectInput){
 const n=Math.max(1,Math.min(6,p?.spans.length??3)),step=192/n,gap=p?.system==='simple'?2:0;
 return Array.from({length:n},(_,i)=>rect(24+i*step+gap,45,step-2*gap,7,true)).join('')+
  Array.from({length:n+1},(_,i)=>support(24+i*step,52)).join('')+
  Array.from({length:n},(_,i)=>label(24+(i+.5)*step,88,`L${i+1}`)).join('')+
  arrow(24+step*.35,22,24+step*.35,43)+arrow(24+step*.35+16,22,24+step*.35+16,43)+label(24+step*.35+8,18,'P')+
  arrow(24+step,104,24+step,68)+label(24+step+6,100,'R','start')+
  label(150,14,p?.system==='continuous'?'CONTINUOUS GIRDER':'INDEPENDENT SPANS')+
  mark(1,24+step*.35-12,30)+mark(2,24+step*.5+(n>1?0:20),62)+mark(3,24+step-12,96);
}
type Drawing={linework:string;title:string;note:string;path:string[];detail:Component[]};
/**
 * The cap tieback angle in section looking along the runway: the cap angle on the column-side channel flange, the
 * lapped tie plate, the end plate with its bolts above and below and shims on the column flange, and the column
 * stiffener at the tie level when needed. Six markers follow the force from the rail head to the column.
 */
function capAngleTie(p?:ProjectInput):Drawing{
 let drawing=section(p,31,35,false,true)+column()+railOn(61,29)+arrow(22,23,46,23)+label(16,26,'H','end',true);
 // Angle: short leg on the channel flange (outer face x 96), long leg level with the top of the cap (y 29).
 drawing+=poly('M96 29H120V32H99V52H96Z',true)+path('M90 45H106',true)+rect(103,42,3,6)+rect(86,42,3,6);
 // Tie plate lapped on the long leg with a vertical lap bolt; end plate, shims and column bolts above and below.
 drawing+=rect(108,26,78,3,true)+path('M113 21V37',true)+rect(110,19,6,2)+rect(186,15,4,25,true)+rect(190,15,4,25)+path('M181 19H200M181 36H200',true);
 drawing+=path('M194 27.5H207',false,true)+label(150,15,'TIE PL')+label(110,64,'SLOTS')+label(150,104,'SHIMS / STIFFENER WHEN NEEDED');
 drawing+=mark(1,30,12)+mark(2,44,58)+mark(3,94,62)+mark(4,148,40)+mark(5,178,52)+mark(6,222,40);
 return {linework:drawing,title:'Cap tieback angle bolted to the channel cap',note:'The top flange force passes through the cap channel flange and its slotted bolts into the angle, the lapped tie plate, the end plate and shims to the column flange. Pull loads the bolts with prying; push bears. The bolted end bearings restrain the bottom flange.',
  path:['Side thrust H at the rail head loads the top flange','Top flange and cap carry it to the column-side channel flange','Cap angle bolts in horizontal slots (pull with prying; the girder slides along the runway)','Angle and tie plate, lapped with slip-critical bolts','End plate, bolts above and below the tie, and shims','Column flange, or the stiffener at the tie level when needed'],detail:['tie']};
}
function tie(p?:ProjectInput,attachment=false):Drawing{
 if(p?.details?.brace.arrangement==='cap-angle')return capAngleTie(p);
 const kind=p?.details?.brace.arrangement??'paired-bars',topOnly=!!(p&&activeEndBearing(p));
 const a=kind==='double-angle'?p?.details?.brace.doubleAngle:p?.details?.brace.singleAngle;
 const angle=kind==='single-angle'||kind==='double-angle',top=angle&&a?.connectionStyle==='top-flange-angle';
 let drawing=section(p,31,35)+column()+railOn(61,p?.section.kind==='cap'?29:35)+arrow(22,23,46,23)+label(16,26,'H','end',true);
 let title='Flange ties and their attachments',note='Side thrust and torsion reach the top flange; the ties carry the flange forces to the column.';
 let steps=['Side thrust H at the rail head loads the top flange','Tie carries the flange force in tension or compression','Bolts and gusset deliver it to the column'];
 if(top){
  drawing+=rect(81,26,108,5,true)+path('M162 31H190V69H184V37H162',true)+rect(191,33,3,36)+path('M180 49H213M180 61H213')+rect(176,46,7,6)+rect(176,58,7,6)+path('M171 21V43');
  if(kind==='double-angle')drawing+=path('M162 26H184V12H190V26',true);
  drawing+=label(121,15,'TOP TIE')+label(148,100,'SLOTS / SHIMS')+path('M149 90L178 65');
  title=kind==='double-angle'?'Top-flange tie with paired clip angles':'Top-flange tie with slotted clip angle';
  note='Review top plate, slotted angles, bolts, shims and receiving column. No lower-flange tie is provided; this option still requires its design model.';
  steps=['Side thrust H at the rail head loads the top flange','Top plate and slotted clip angle','Bolts and shims to the column'];
 }else if(angle){
  drawing+=poly('M83 44H190V51H83Z',true)+poly('M83 74H190V81H83Z',true)+path('M89 39V58M89 70V89M185 39V58M185 70V89');
  if(kind==='double-angle')drawing+=path('M83 54H190M83 84H190',true);
  drawing+=label(139,21,'ANGLE / GUSSETS');title=kind==='double-angle'?'Paired gusseted angle ties':'Gusseted angle ties';
  note='Review the selected angle, gussets, welds and eccentric load path. This option requires its own stiffness, movement and strength model.';
 }else if(kind==='flexible-plate'){
  drawing+=rect(87,33,105,12,true)+(topOnly?'':rect(87,76,105,12,true))+path('M114 52Q140 60 168 52',false,true)+label(138,22,'FLEXIBLE PLATE');
  title='Flexible plate tieback';note='One plate in single shear on the saddle and column gussets: axial force, lap couple, weak-axis movement and fatigue.';
  steps=['Side thrust H at the rail head loads the top flange','Flexible plate in single shear (axial force and lap couple)','Bolts and column gusset to the column'];
 }else if(kind==='bearing-link'||kind==='paired-links'){
  for(const y of kind==='paired-links'?[44,76]:[58])drawing+=path(`M99 ${y}H180`,true)+circle(96,y,7,true)+circle(183,y,7,true);
  drawing+=label(140,21,'PINS / LINKS');title=kind==='paired-links'?'Paired articulated links':'Articulated bearing link';
  note='Review link force, pin and clevis transfer, articulation and supplier ratings. This option requires its connection design model.';
  steps=['Side thrust H at the rail head loads the top flange','Link and pins carry the force','Clevis to the column'];
 }else{
  for(const y of topOnly?[38]:[38,80])drawing+=rect(83,y,111,6,true)+[96,180].map(x=>circle(x,y+3,2)).join('');
  drawing+=label(140,22,attachment?'FLANGE / SADDLE':topOnly?'TOP TIE BARS':'TOP + BOTTOM TIES');
  if(attachment)drawing+=path(topOnly?'M82 33V49H98':'M82 33V49H98M82 75V91H98',true);
 }
 drawing+=arrow(120,62,170,62)+label(145,57,'H')+mark(1,30,12)+mark(2,108,52)+mark(3,222,52);
 if(attachment&&!angle)return {linework:drawing,title:'Local flange, saddle and weld transfer',note:'Trace tie force through the saddle welds into the flange; check local bending, flexibility and cyclic stress.',path:['Tie force at the girder gusset','Saddle and its fillet welds','Local flange strip bending, column gusset root'],detail:['tie']};
 return {linework:drawing,title,note,path:steps,detail:['tie']};
}
function bracket(p?:ProjectInput):Drawing{
 const enabled=p?.details?.bracket?.enabled!==false,kind=p?.details?.bracket?.arrangement??'twin-rib',existing=kind.startsWith('existing-');
 const girderEnd=rect(66,14,50,5)+rect(88,19,6,22)+rect(66,41,50,5)+rect(70,46,42,4,true);
 if(!enabled)return {linework:section(p,88,15)+rect(92,72,52,5,true)+support(118,77)+arrow(160,4,160,30)+label(166,14,'R','start')+mark(1,176,30)+mark(2,152,74)+mark(3,140,98)+label(120,112,'SEAT BY OTHERS'),title:'Girder bearing and support reaction',note:'Review the bearing reaction and the assumed support. Bracket component design is not enabled.',path:['Girder reaction R','Bearing plate on the support','Support by others, designed for the reported forces'],detail:['bearing','support']};
 let drawing=column()+girderEnd+rect(57,50,137,6,true);
 if(kind==='haunched-seat')drawing+=poly('M62 56H193V100L62 68Z',true);
 else if(kind==='twin-rib')drawing+=rect(62,56,131,36,true);
 // Tapered I haunch: the seat is its top flange; web, sloping bottom flange and the stiffener pair at the girder web line.
 else if(kind==='tapered-haunch')drawing+=poly('M62 56H193V100L62 74Z',true)+path('M62 70L193 96',true)+rect(88,56,6,21,true);
 else drawing+=rect(62,57,131,5,!existing,existing)+rect(62,90,131,5,!existing,existing)+path('M62 76H193',!existing,existing)+(kind==='rolled-corbel'?rect(124,62,5,28,true):'');
 if(existing)drawing+=label(128,84,'EXISTING');
 drawing+=arrow(91,0,91,12)+label(99,9,'R','start',true)+dimension(91,194,108,'e')+path('M189 57V92',true)+
  mark(1,77,6)+mark(2,140,42)+mark(3,128,74)+mark(4,180,100)+mark(5,222,60);
 const steps=existing?['Girder reaction R at the bearing','New bolted seat plate','Existing bracket (documented assessment)','Existing root welds','Column flange']:
  kind==='rolled-corbel'?['Girder reaction R at the bearing','Spreader seat / stub top flange','W stub: bending R·e and torsion','Flange and web welds to the column','Column flange and web (J10)']:
  kind==='tapered-haunch'?['Girder reaction R at the bearing','Top flange and bearing stiffeners','Tapered web and flanges: M, V and torsion on each section','Flange CJP and web fillets to the column','Column flange and web (J10), column stiffeners']:
  ['Girder reaction R at the bearing','Seat plate spans between the ribs',kind==='haunched-seat'?'Tapered ribs: R·(e − x) at the critical section':'Ribs: root moment R·e and shear','Root fillet welds','Column flange and web (J10)'];
 return {linework:drawing,title:existing?'New seat on existing bracket':kind==='haunched-seat'?'Haunched seat bracket':kind==='rolled-corbel'?'Wide-flange stub bracket':kind==='tapered-haunch'?'Tapered I haunch':'Twin-rib bracket',
  note:existing?'Check the new seat and eccentric reaction against the documented assessment of the existing bracket and receiving steel.':kind==='twin-rib'?'Trace reaction R through the seat and ribs. Eccentricity e produces root moment; check welds and local column effects.':kind==='haunched-seat'?'Trace reaction R through the seat into the tapered ribs. R(e − x) peaks against the shrinking section at the critical section of the taper; check the sloping free edge, root welds and local column effects.':kind==='tapered-haunch'?'Trace reaction R through the top flange and the bearing stiffeners into the tapered web. R·(e − y) bends every section of the taper; the bearing offsets along the runway twist it through opposite flange shears. Check the flange forces and weld group at the column face, and the column flange and web (J10) under the two flange forces.':kind==='rolled-corbel'?'Trace reaction R through the W stub to its welds on the column. Eccentricity e bends the stub; the bearing offsets along the runway twist it. Check the web under the bearing, the stiffeners, the weld group and local column effects.':'Trace reaction and eccentricity through the selected bracket. This alternative still requires its own strength and connection design model.',
  path:steps,detail:['support']};
}
export interface CheckFigure{title:string;note:string;svg:string;path:string[];detail:string;view:'isometric'|'schematic'}
export function checkFigure(topic:string,p?:ProjectInput):CheckFigure{
 let title=topic,note=checkGroupPurpose[topic]??'Review the stated inputs, calculation basis and acceptance limits.',drawing='',steps:string[]=[],detail:Component[]=[];
 switch(topic){
  case 'Geometry':title='Spans, supports and member';note=`${p?.spans.length??3} ${p?.system==='continuous'?'continuous':'independent'} bay(s). Section properties and restraint lengths establish the member model.`;drawing=geometry(p);steps=['Wheel loads P on the girder','Girder spans grid to grid','Reactions R at the supports'];detail=['girder'];break;
  case 'Section':title=p?.section.kind==='cap'?'Capped section properties':'Girder section properties';note='Section geometry establishes bending stiffness, resistance, torsional stiffness and warping properties.';
   drawing=section(p,83,34,true)+railOn(113,p?.section.kind==='cap'?28:34)+arrow(113,0,113,9)+arrow(72,13,96,13)+label(66,16,'H','end')+dimension(83,143,103,'bf')+path('M160 34V91M156 34H164M156 91H164')+label(166,66,'d','start')+path('M60 62H150',false,true)+circle(113,66,2.5)+label(176,32,'Ix / Iy · J / Cw','start')+mark(1,127,6)+mark(2,100,74)+mark(3,186,56);
   steps=['Wheel load and side thrust at the rail head','Eccentric to the shear center: torsion and warping','Section resists Mx, My, T'];detail=['girder'];break;
  case 'Strength':title='Bending, shear and combined actions';drawing=beam(55,true)+arrow(85,13,85,52)+arrow(151,13,151,52)+label(118,15,'P')+path('M30 84Q120 117 210 84',false,true)+label(120,90,'M / V')+mark(1,72,24)+mark(2,120,106)+mark(3,222,70);
   steps=['Wheel loads P and side thrust H','Girder bending Mx, flange bending and shear (H1, H3 with torsion)','Reactions to the supports'];detail=['girder'];break;
  case 'Loading':title='Wheel loads and reversible thrust';drawing=beam()+[74,153].map(x=>circle(x,45,7,true)+arrow(x,10,x,35)+label(x-10,22,'P','end')).join('')+arrow(98,30,134,30)+arrow(134,30,98,30)+label(116,22,'H')+arrow(168,46,204,46)+label(208,49,'F','start')+dimension(74,153,86,'wheel spacing')+mark(1,90,10)+mark(2,116,44)+mark(3,186,36);
   steps=['Wheel loads P with impact','Side thrust H, either direction','Traction F along the runway'];detail=['crane'];break;
  case 'Criteria':title='Operating limits and duty';drawing=path('M32 21V82H102M41 71L57 55L73 65L92 34',true)+label(68,98,'DUTY / CYCLES')+path('M137 45H219',false,true)+path('M137 45Q178 73 219 45',true)+arrow(177,45,177,59)+label(179,25,'MOVEMENT LIMIT')+mark(1,22,12)+mark(2,196,70);
   steps=['Building class and load cycles','Deflection and movement limits'];detail=['criteria'];break;
  case 'Serviceability':title='Deflection and rail movement';drawing=path('M25 35H215',false,true)+path('M25 35Q120 91 215 35',true)+support(25,35)+support(215,35)+arrow(96,6,96,46)+label(88,14,'P','end')+arrow(120,36,120,62)+label(126,52,'δ','start')+dimension(25,215,94,'L · δ ≤ L / n')+mark(1,108,14)+mark(2,146,58);
   steps=['One crane, static wheel loads (no impact)','Vertical and rail-head lateral deflection Δ ≤ L / n'];detail=['criteria'];break;
  case 'Cap channel':title=p?.section.kind==='cap'?'Cap welds and load transfer':'Cap channel applicability';drawing=section(p,77,38,false,true)+railOn(107,32)+path('M72 52l6 -7M142 52l-6 -7',true)+arrow(107,0,107,13)+path('M160 27L142 47')+label(166,22,'WELDS','start')+label(108,110,'BEAM + CAP')+mark(1,118,6)+mark(2,152,58)+mark(3,62,78);
   steps=['Wheel load into the cap channel','Cap-to-flange fillets carry the shear flow VQ/I','Composite section; welds developed at the cap ends'];detail=['girder'];if(p?.section.kind!=='cap')note='No cap channel is selected. Cap attachment and composite-section checks are not applicable.';break;
  case 'Local forces':title='Wheel patch and bearing zone';drawing=path('M32 36H208V43H32ZM32 79H208V86H32Z')+path('M32 61H208',false,true)+rect(167,43,6,36,true)+rect(158,86,31,5,true)+railOn(73,36)+arrow(73,0,73,17)+arrow(173,114,173,93)+path('M65 43l-18 34M80 43l18 34',true,true)+label(80,9,'P','start')+label(181,110,'R','start')+mark(1,58,10)+mark(2,73,64)+mark(3,190,60)+mark(4,148,104);
   steps=['Wheel P through the rail onto the flange','Web local yielding and crippling over the patch','Reaction R into the bearing stiffeners','Stiffeners and bearing plate on the seat'];detail=['bearing'];break;
  case 'Bracing':title='Restraint and unbraced length';drawing=rect(25,44,190,10,true)+path('M30 49Q93 27 155 49',false,true)+[30,155,210].map(x=>path(`M${x} 43V30`)+path(`M${x-6} 27l6 9 6 -9Z`)).join('')+arrow(92,8,92,40)+label(98,16,'H','start')+dimension(30,155,76,'Lb')+label(185,16,'TIES')+mark(1,80,14)+mark(2,170,30)+mark(3,60,92);
   steps=['Lateral force H on the top flange','Ties restrain the flange at the supports (finite stiffness)','Flange buckles between ties: Lb'];detail=['tie'];break;
  case 'Fatigue':title='Stress range at a cyclic detail';drawing=path('M34 18V83H206')+path('M40 54Q50 7 63 54T87 54T111 54T135 54T159 54T183 54',true)+path('M39 31H203M39 77H203',false,true)+arrow(199,31,199,77)+arrow(199,77,199,31)+label(216,57,'fsr')+label(119,101,'REPEATED CYCLES n')+mark(1,52,12)+mark(2,222,40)+mark(3,62,101);
   steps=['Each wheel passage gives a stress range fsr at the detail','Detail category: AISC 360 Appendix 3','Cycles ni in each duty bin; Miner sum Σ ni/Ni'];detail=['criteria'];break;
  case 'Detailing':title='Sliding end: bolt layout and movement allowance';drawing=rect(33,30,174,46,true)+[65,168].map(x=>`<rect x="${x-13}" y="47" width="26" height="12" rx="6" fill="white" stroke="${ink}" stroke-width="1.4"/>`+circle(x,53,4)).join('')+dimension(33,65,20,'edge',true)+dimension(65,168,90,'pitch / travel')+path('M117 44H185',false,true)+mark(1,20,40)+mark(2,200,96);
   steps=['Edge distance and pitch of each bolt','Slot length for the movement'];detail=['bearing'];break;
  case 'Connections':case 'Flange attachment':case 'Cap tieback':case 'Cap tieback movement':({title,note,linework:drawing,path:steps,detail}=tie(p,topic==='Flange attachment'));break;
  case 'Column bracket':({title,note,linework:drawing,path:steps,detail}=bracket(p));break;
  case 'Rail details':title='Rail, keeper and local flange';drawing=rect(40,86,160,7,true)+rect(72,82,96,4)+poly('M82 82V76H113V52H104V40H136V52H127V76H158V82Z')+rect(66,74,15,8,true)+rect(159,74,15,8,true)+circle(120,22,13)+arrow(120,0,120,9)+arrow(176,46,140,46)+label(180,49,'H','start')+path('M196 76L176 79')+label(198,74,'KEEPER','start')+mark(1,104,14)+mark(2,30,82)+mark(3,190,36)+mark(4,52,70);
   steps=['Wheel P on the rail head',`Rail base bears on the ${p?.details&&railSeat(p).pad?'pad on the ':''}${p?.section.kind==='cap'?'cap channel':'top flange'}`,'Side thrust H on the rail head',`Keepers and their welds to the ${p?.section.kind==='cap'?'cap channel':'flange'}`];detail=['rail'];break;
  case 'Analysis':title='Equilibrium and refinement';drawing=beam(48,true)+[82,155].map(x=>arrow(x,12,x,45)).join('')+arrow(30,108,30,74)+arrow(210,108,210,74)+[55,82,109,136,163,190].map(x=>circle(x,52,2)).join('')+label(120,92,'ΣR = ΣP')+label(120,110,'refine travel + stations')+mark(1,70,20)+mark(2,44,100)+mark(3,166,72);
   steps=['Wheel loads ΣP','Reactions ΣR: equilibrium','Refine crane travel and mesh until converged'];detail=['girder'];break;
  case 'Longitudinal bracing':title='Crane-level longitudinal bracing';drawing=path('M40 100H200')+path('M60 100V22M180 100V22M60 22H180')+path('M60 100L180 22M60 22L180 100',true)+arrow(14,22,56,22)+label(26,15,'F')+label(120,113,'BRACED BAY · TIERS · DIAGONALS')+mark(1,40,34)+mark(2,148,52)+mark(3,196,92);note='Traction or stop force and building wind/seismic forces resolve into the braced-bay diagonals; columns and foundation take the overturning.';
   steps=['Longitudinal force F at crane level','Diagonal in tension','Columns and foundation take the overturning'];detail=['bracing'];break;
  case 'Brace connections':title='Rod end, clevis and gusset';drawing=path('M70 12V104M90 12V104')+poly('M90 30H150L170 58L150 74H90Z',true)+circle(150,52,6)+path('M156 56L222 100',true)+arrow(206,90,178,72)+label(196,113,'T = ROD STRENGTH')+label(120,24,'GUSSET')+mark(1,222,84)+mark(2,150,36)+mark(3,120,64)+mark(4,80,92);note='The clevis pin bears on the gusset, which tears out beyond the pin, ruptures across it or yields on its Whitmore section; its fillets carry the force into the column web, which bends out of its plane.';
   steps=['Rod force T (rod strength)','Clevis pin bears on the gusset','Gusset: tear-out, rupture, Whitmore yield','Fillets to the column web'];detail=['bracing'];break;
  case 'Crane-level strut':title='Strut collecting the longitudinal force';drawing=path('M40 104V20M120 104V20M200 104V20')+rect(40,34,160,7,true)+rect(14,22,20,6)+arrow(4,25,36,25)+path('M120 41L200 104',false,true)+label(14,16,'F')+label(80,58,'STRUT')+label(160,113,'BRACED SPAN')+mark(1,26,40)+mark(2,100,26)+mark(3,176,72);note='Each girder brings its longitudinal force to its locating column at the bracket; the strut carries it in compression or tension to the braced span, with its own weight, end bolts and the seat weld at the column.';
   steps=['Girder longitudinal force F at each locating column','Strut in compression or tension','Braced span'];detail=['bracing'];break;
  case 'Column cap':title='Girder bearing on a column cap';drawing=path('M98 112V58M142 112V58')+rect(78,52,84,6,true)+rect(92,46,56,6,true)+rect(84,40,72,6)+path('M120 40V14')+path('M104 40V14M136 40V14',true)+arrow(120,0,120,30)+label(126,8,'R','start')+arrow(200,24,162,24)+label(204,27,'H','start')+path('M112 58V78M128 58V78',true,true)+label(44,59,'CAP PL')+label(120,118,'COLUMN')+mark(1,108,8)+mark(2,150,32)+mark(3,72,44)+mark(4,156,74);note='The girder sits centered on the column: its bearing stiffeners and bolted bottom flange form a fork that restrains the girder end, and the cap plate, cap stiffeners and all-around welds carry the reaction, lateral and longitudinal forces into the column.';
   steps=['Girder reaction R and side force H','Bearing stiffeners and bolted bottom flange (fork)','Cap plate','Cap stiffeners and welds into the column'];detail=['support'];break;
  case 'New column':title='New freestanding runway column';drawing=rect(96,12,16,92,true)+rect(112,30,40,6)+rect(137,22,14,8)+arrow(160,4,160,24)+arrow(184,14,154,14)+label(166,8,'V','start')+label(188,17,'H','start')+path('M84 104H124')+hatch(84,124,104)+label(58,60,'FIXED')+label(58,70,'BASE')+label(170,92,'CANTILEVER')+mark(1,176,30)+mark(2,128,50)+mark(3,84,40)+mark(4,140,108);note='The new column carries the girder on its bracket as a fixed-base cantilever across the runway: axial load, eccentric and side-thrust moments, shear, H1 interaction and drift at the rail.';
   steps=['Bracket reaction V at eccentricity e, side thrust H','Bracket to the column flange','Column: P, M, V and drift (H1)','Fixed base'];detail=['column'];break;
  case 'New column base':title='Base plate, anchor rods and footing';drawing=path('M104 6V58M116 6V58')+rect(84,58,52,5,true)+rect(82,63,56,3)+rect(52,66,116,30)+path('M92 56V88M128 56V88',true)+arrow(110,0,110,10)+label(120,8,'P, M, V','start')+hatch(52,168,98)+label(110,116,'SOIL BEARING / OVERTURNING')+mark(1,96,12)+mark(2,148,56)+mark(3,72,80)+mark(4,184,88);note='Base reactions pass through the base plate (Design Guide 1), the anchor rods (ACI 318 Chapter 17) and the spread footing to the soil: bearing, overturning, sliding, shear, flexure and development.';
   steps=['Column P, M and V at the base','Base plate bearing on grout','Anchor rods in tension and shear','Footing to the soil'];detail=['base'];break;
  case 'End bearings':title='Bolted end bearing';drawing=rect(30,30,90,6)+rect(72,36,6,40)+rect(30,76,90,6,true)+rect(30,82,90,6,true)+rect(20,88,120,8)+[46,104].map(x=>path(`M${x} 70V102`,true)+rect(x-6,68,12,3)).join('')+rect(150,76,70,6)+rect(150,82,70,6)+rect(140,88,90,8)+`<rect x="172" y="76" width="20" height="6" rx="3" fill="white" stroke="${ink}" stroke-width="1.2"/>`+path('M182 70V102',true)+arrow(75,0,75,26)+arrow(4,60,26,60)+label(81,10,'R','start')+label(8,54,'F')+label(70,116,'LOCATING')+label(185,116,'SLIDING (SLOT)')+mark(1,62,12)+mark(2,30,50)+mark(3,124,64);note='Bearing plate under the girder; the locating end bolts carry the longitudinal force and uplift by slip resistance and tension, the sliding end bolts pass through slots so the girder moves.';
   steps=['Girder reaction R on the bearing plate','Longitudinal force F by slip-critical bolts at the locating end','Uplift and lateral force through the bolts into the seat'];detail=['bearing'];break;
  case 'End stops':title='Crane end stop on the girder';drawing=rect(20,70,200,6,true)+poly('M40 70V64H160V70Z')+rect(172,64,40,6,true)+rect(172,24,6,40,true)+poly('M178 34L206 64H178Z',true)+circle(150,40,10)+arrow(138,40,170,40)+label(126,36,'F','end')+[188,204].map(x=>path(`M${x} 58V82`,true)).join('')+path('M226 40V64M222 40H230M222 64H230')+label(232,55,'h','start')+mark(1,138,22)+mark(2,196,22)+mark(3,196,96)+mark(4,60,92);note='Bumper force F at height h on the face plate; stiffeners and base plate carry the overturning into the front bolts in tension and the heel in bearing; the girder carries the force to its locating bearing.';
   steps=['Bumper force F at height h above the rail','Face plate and stiffeners','Base bolts: tension and shear into the top flange','Girder to its locating bearing'];detail=['end-stop'];break;
  case 'Tie movement':title='Tie movement compatibility';drawing=path('M20 40H150M20 88H150M60 40V88',false)+path('M20 40L150 46M20 88L150 82',true,true)+rect(150,36,60,6,true)+rect(206,26,8,30)+`<rect x="207" y="32" width="6" height="14" rx="3" fill="white" stroke="${ink}" stroke-width="1"/>`+arrow(150,22,170,22)+label(160,16,'θ·d')+path('M28 70A16 16 0 0 1 40 56',true)+label(14,66,'θ','end')+mark(1,40,104)+mark(2,180,52)+mark(3,226,40);note='Girder end rotation and thermal travel move the tie along the runway; the thin tie flexes about its weak axis and the sleeved slots release the support deflection.';
   steps=['End rotation θ and thermal travel move the flange by θ·d','Tie flexes about its weak axis','Sleeved slots release support deflection'];detail=['tie'];break;
  case 'Existing column':case 'Supporting structure':case 'Interfaces':title=topic==='Existing column'?'Existing column: crane plus building loads':'Forces transferred to the building';drawing=column()+rect(49,47,145,8,true)+arrow(107,17,107,44)+arrow(129,33,184,33)+arrow(214,62,214,96)+label(100,13,'V')+label(151,25,'H / N')+label(116,89,'CONCURRENT ACTIONS')+mark(1,90,30)+mark(2,156,46)+mark(3,226,78);note='Retain simultaneous signed reactions when transferring forces to the separately designed building.';
   steps=['Girder reaction V at the support','Concurrent lateral H and longitudinal N','Column and building carry them together'];detail=['column'];break;
  default:title='Inputs, checks and report record';drawing=[26,100,174].map((x,i)=>rect(x,29,43,45,i===1)+path(`M${x+9} 42h25M${x+9} 51h25M${x+9} 60h17`)+label(x+21,90,['INPUT','CHECK','REPORT'][i])).join('')+arrow(71,51,96,51)+arrow(145,51,170,51)+mark(1,47,104)+mark(2,121,104)+mark(3,195,104);note='Record project inputs, calculation revision and references. Export is controlled by the actual validation results.';
   steps=['Project inputs','Every check evaluated','Report and drawings'];detail=[];
 }
 // The project's own parts in the Hairline isometric style, where the topic has one and it numbers the same steps.
 const iso=p?isoTopicFigure(topic,p,{topOnly:!!activeEndBearing(p)}):undefined;
 const isometric=!!iso&&iso.markers===steps.length;if(isometric)drawing=iso.body;
 const text=p?detail.map(k=>componentDetail(k,p)).join('; '):'';
 return {title,note,path:steps,detail:text,view:isometric?'isometric':'schematic',svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" role="img" aria-label="${escape(title)}" data-check-figure="${escape(topic)}"><title>${escape(title)}</title><desc>${escape(note)} Load path: ${escape(steps.map((s,i)=>`${i+1} ${s}`).join('; '))}. ${isometric?'Isometric view of the project\'s parts, not to scale':'Schematic, not to scale'}. Heavy gray-filled parts are the reviewed components; numbered markers follow the load path.</desc>${drawing}</svg>`};
}
/** A load-path step number styled like the figure markers. */
export const stepBadge=(n:number|string)=>`<span class="step">${escape(n)}</span>`;
export function checkFigureHtml(topic:string,p?:ProjectInput){
 const f=checkFigure(topic,p);
 return `<figure class="calculation-figure">${f.svg}<figcaption><strong>${escape(f.title)}</strong>${f.detail?`<p class="figure-detail"><b>Detail:</b> ${escape(f.detail)}</p>`:''}<p class="figure-path"><b>Load path:</b> ${f.path.map((s,i)=>`${stepBadge(i+1)} ${escape(s)}`).join(' → ')}</p><small>${f.view==='isometric'?'ISOMETRIC':'SCHEMATIC'} · NOT TO SCALE</small></figcaption></figure>`;
}
/** Scoped so ARCH D drawing SVGs and existing equation styles are untouched. Black and white throughout. */
export const checkFigureCss=`.calculation-figure{display:flex;align-items:center;gap:12px;margin:6px 0 8px;padding:5px 8px;background:#fff;border:1px solid #000;break-inside:avoid;page-break-inside:avoid;break-after:avoid}.calculation-figure>svg{display:block;width:240px;height:120px;flex:0 0 240px}.calculation-figure figcaption{min-width:0;color:#000;font:10px/1.4 Arial,sans-serif}.calculation-figure figcaption strong{display:block;font-size:11px;color:#000}.calculation-figure figcaption p{margin:3px 0}.calculation-figure figcaption small{display:block;font-size:7.5px;color:${muted};letter-spacing:.4px}.calculation-figure .step,.step{display:inline-block;min-width:13px;height:13px;line-height:11px;border:1px solid #000;border-radius:7px;text-align:center;font-size:8px;font-weight:700;color:#000;background:#fff;vertical-align:1px}.report-figure-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;break-inside:avoid;break-after:avoid}.report-figure-strip>.calculation-figure{display:block;margin:0}.report-figure-strip>.calculation-figure>svg{width:240px;height:120px;max-width:100%;margin:0 auto}.report-figure-strip>.calculation-figure figcaption{font-size:9px}.report-figure-strip>.calculation-figure:only-child{grid-column:1/-1;display:flex}`;
