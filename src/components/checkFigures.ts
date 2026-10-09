import type {ProjectInput} from '../engine/types';

/** Shared explanatory linework for the live worksheet and server-rendered PDF.
 * Geometry is intentionally schematic: results and applicability stay in the checks.
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
 'Supporting structure':'Identify building elements that must be verified outside this calculation for the reported forces.',
 'Longitudinal bracing':'Carry crane traction and stop forces, with the building\'s own wind and seismic forces, to the foundation.'
};
export const worksheetFigureTopics:Record<string,string>={Geometry:'Geometry','Crane loads':'Loading',Criteria:'Criteria',Connections:'Connections',Validation:'Analysis','Existing building':'Interfaces',Project:'Project'};
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const ink='#34454a',accent='#146b78',muted='#65767b';
const path=(d:string,focus=false,dashed=false)=>`<path d="${d}" fill="none" stroke="${focus?accent:ink}" stroke-width="${focus?2.2:1.3}"${dashed?' stroke-dasharray="4 3"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
const rect=(x:number,y:number,w:number,h:number,focus=false,dashed=false)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${focus?'#e1eff1':'white'}" stroke="${focus?accent:ink}" stroke-width="${focus?1.8:1.2}"${dashed?' stroke-dasharray="4 3"':''}/>`;
const label=(x:number,y:number,text:string,anchor='middle',focus=false)=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="10" fill="${focus?accent:ink}">${escape(text)}</text>`;
const circle=(x:number,y:number,r=3,focus=false)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="white" stroke="${focus?accent:ink}" stroke-width="1.5"/>`;
function arrow(x:number,y:number,tx:number,ty:number){
 const a=Math.atan2(ty-y,tx-x),size=5;
 return path(`M${x} ${y}L${tx} ${ty}`,true)+`<path d="M${tx} ${ty}L${tx-size*Math.cos(a-.48)} ${ty-size*Math.sin(a-.48)}L${tx-size*Math.cos(a+.48)} ${ty-size*Math.sin(a+.48)}Z" fill="${accent}"/>`;
}
const dimension=(x:number,to:number,y:number,text:string,above=false)=>path(`M${x} ${y-4}V${y+4}M${to} ${y-4}V${y+4}M${x} ${y}H${to}`)+label((x+to)/2,above?y-7:y+13,text);
const support=(x:number,y:number)=>path(`M${x} ${y}l-6 9h12ZM${x-10} ${y+12}h20`);
const beam=(y=55)=>rect(25,y,190,7)+support(30,y+7)+support(210,y+7);
const column=()=>path('M194 13V94M207 13V94',false,true);
function section(p:ProjectInput|undefined,x=72,y=31,focus=false,capped=p?.section.kind==='cap'){
 return rect(x,y,60,6,focus)+rect(x+27,y+6,6,45,focus)+rect(x,y+51,60,6,focus)+(capped?path(`M${x-5} ${y+14}V${y-6}H${x+65}V${y+14}`,true):'');
}
function geometry(p?:ProjectInput){
 const n=Math.max(1,Math.min(6,p?.spans.length??3)),step=192/n;
 return Array.from({length:n},(_,i)=>rect(24+i*step+(p?.system==='simple'?2:0),45,step-(p?.system==='simple'?4:0),7)).join('')+
  Array.from({length:n+1},(_,i)=>support(24+i*step,52)).join('')+
  Array.from({length:n},(_,i)=>label(24+(i+.5)*step,85,`L${i+1}`)).join('')+
  label(120,21,p?.system==='continuous'?'CONTINUOUS GIRDER':'INDEPENDENT SPANS');
}
function tie(p?:ProjectInput,attachment=false):{linework:string;title:string;note:string}{
 const kind=p?.details?.brace.arrangement??'paired-bars';
 const a=kind==='double-angle'?p?.details?.brace.doubleAngle:p?.details?.brace.singleAngle;
 const angle=kind==='single-angle'||kind==='double-angle',top=angle&&a?.connectionStyle==='top-flange-angle';
 let drawing=section(p,31,35)+column();
 let title='Flange ties and their attachments',note='Follow lateral force from the girder flange through the tie and into the column.';
 if(top){
  drawing+=rect(81,26,108,5,true)+path('M162 31H190V69H184V37H162',true)+rect(191,33,3,36)+path('M180 49H213M180 61H213')+rect(176,46,7,6)+rect(176,58,7,6)+path('M171 21V43');
  if(kind==='double-angle')drawing+=path('M162 26H184V12H190V26',true);
  drawing+=label(121,15,'TOP TIE', 'middle',true)+label(148,94,'SLOTS / SHIMS')+path('M149 83L178 65');
  title=kind==='double-angle'?'Top-flange tie with paired clip angles':'Top-flange tie with slotted clip angle';
  note='Review top plate, slotted angles, bolts, shims and receiving column. No lower-flange tie is provided; this option still requires its design model.';
 }else if(angle){
  drawing+=path('M83 44H190V51H83ZM83 74H190V81H83',true)+path('M89 39V58M89 70V89M185 39V58M185 70V89');
  if(kind==='double-angle')drawing+=path('M83 54H190M83 84H190',true);
  drawing+=label(139,21,'ANGLE / GUSSETS');title=kind==='double-angle'?'Paired gusseted angle ties':'Gusseted angle ties';
  note='Review the selected angle, gussets, welds and eccentric load path. This option requires its own stiffness, movement and strength model.';
 }else if(kind==='flexible-plate'){
  drawing+=rect(87,43,105,31,true)+path('M114 83Q140 94 168 83',true,true)+label(138,21,'FLEXIBLE PLATE');
  title='Flexible plate tieback';note='Review lateral force transfer and out-of-plane movement of the flexible plate. Its connection design model is still required.';
 }else if(kind==='bearing-link'||kind==='paired-links'){
  for(const y of kind==='paired-links'?[44,76]:[58])drawing+=path(`M99 ${y}H180`,true)+circle(96,y,7,true)+circle(183,y,7,true);
  drawing+=label(140,21,'PINS / LINKS');title=kind==='paired-links'?'Paired articulated links':'Articulated bearing link';
  note='Review link force, pin and clevis transfer, articulation and supplier ratings. This option requires its connection design model.';
 }else{
  for(const y of [42,75])drawing+=rect(83,y,111,7,true)+[96,180].map(x=>circle(x,y+3.5,2)).join('');
  drawing+=label(140,20,attachment?'FLANGE / SADDLE':'TOP + BOTTOM TIES');
  if(attachment)drawing+=path('M82 37V56H98M82 68V89H98',true);
 }
 drawing+=arrow(117,60,168,60)+label(140,55,'H', 'middle',true);
 return {linework:drawing,title:attachment&&!angle?'Local flange, saddle and weld transfer':title,note:attachment&&!angle?'Trace tie force through the saddle welds into the flange; check local bending, flexibility and cyclic stress.':note};
}
function bracket(p?:ProjectInput){
 const enabled=p?.details?.bracket?.enabled!==false,kind=p?.details?.bracket?.arrangement??'twin-rib',existing=kind.startsWith('existing-');
 let drawing=column()+rect(57,44,137,6,true)+path('M74 41H113M91 21V41M74 21H113');
 if(!enabled)return {linework:section(p,88,15)+support(118,72),title:'Girder bearing and support reaction',note:'Review the bearing reaction and the assumed support. Bracket component design is not enabled.'};
 if(kind==='haunched-seat')drawing+=path('M62 50H193V85L62 60Z',true);
 else if(kind==='twin-rib')drawing+=rect(62,50,131,32,true);
 else drawing+=rect(62,51,131,5,!existing,existing)+rect(62,82,131,5,!existing,existing)+path('M62 69H193',!existing,existing);
 if(existing)drawing+=path('M71 39V58M165 39V58')+label(128,78,'EXISTING');
 drawing+=arrow(91,4,91,20)+label(104,13,'R', 'start',true)+dimension(91,194,93,'e')+path('M189 51V82',true);
 return {linework:drawing,title:existing?'New seat on existing I-bracket':kind==='haunched-seat'?'Haunched seat load path':kind==='rolled-corbel'?'Wide-flange bracket load path':'Seat, ribs and column root',note:existing?'Check the new seat and eccentric reaction against the documented assessment of the existing bracket and receiving steel.':kind==='twin-rib'?'Trace reaction R through the seat and ribs. Eccentricity e produces root moment; check welds and local column effects.':'Trace reaction and eccentricity through the selected bracket. This alternative still requires its own strength and connection design model.'};
}

export function checkFigure(topic:string,p?:ProjectInput):{title:string;note:string;svg:string}{
 let title=topic,note=checkGroupPurpose[topic]??'Review the stated inputs, calculation basis and acceptance limits.',drawing='';
 switch(topic){
  case 'Geometry':title='Spans, supports and member';note=`${p?.spans.length??3} ${p?.system==='continuous'?'continuous':'independent'} bay(s). Section properties and restraint lengths establish the member model.`;drawing=geometry(p);break;
  case 'Section':title=p?.section.kind==='cap'?'Capped section properties':'Girder section properties';note='Section geometry establishes bending stiffness, resistance, torsional stiffness and warping properties.';drawing=section(p,83,34)+dimension(83,143,17,'bf',true)+path('M160 34V91M156 34H164M156 91H164')+label(169,66,'d','start')+path('M56 62H149M113 29V96',false,true)+label(114,113,'Ix / Iy · J / Cw');break;
  case 'Strength':title='Bending, shear and combined actions';drawing=beam()+arrow(85,13,85,50)+arrow(151,13,151,50)+label(119,15,'P')+path('M30 84Q120 117 210 84',true)+label(120,87,'M / V / N', 'middle',true);break;
  case 'Loading':title='Wheel loads and reversible thrust';drawing=beam()+[74,153].map(x=>circle(x,45,7)+arrow(x,15,x,34)+label(x-12,25,'P')).join('')+arrow(94,33,136,33)+arrow(136,33,94,33)+label(115,22,'H', 'middle',true)+dimension(74,153,83,'wheel spacing');break;
  case 'Criteria':title='Operating limits and duty';drawing=path('M32 21V82H102M41 71L57 55L73 65L92 34',true)+label(68,100,'DUTY / CYCLES')+path('M137 45H219',false,true)+path('M137 45Q178 73 219 45',true)+arrow(177,45,177,59)+label(179,25,'MOVEMENT LIMIT');break;
  case 'Serviceability':title='Deflection and rail movement';drawing=path('M25 35H215',false,true)+path('M25 35Q120 91 215 35',true)+support(25,35)+support(215,35)+arrow(120,36,120,62)+label(131,48,'δ', 'start',true)+dimension(25,215,85,'L · compare δ with limit');break;
  case 'Cap channel':title=p?.section.kind==='cap'?'Cap welds and load transfer':'Cap channel applicability';drawing=section(p,77,38,false,true)+path('M72 52l6 -7M142 52l-6 -7',true)+arrow(107,4,107,23)+path('M160 27L142 47')+label(166,22,'WELDS')+label(108,105,'BEAM + CAP');if(p?.section.kind!=='cap')note='No cap channel is selected. Cap attachment and composite-section checks are not applicable.';break;
  case 'Local forces':title='Wheel patch and bearing zone';drawing=path('M32 36H208V43H32ZM32 79H208V86H32ZM32 61H208')+rect(167,43,6,36,true)+rect(158,87,31,5,true)+arrow(73,8,73,35)+arrow(173,111,173,94)+path('M65 43l-18 34M80 43l18 34',true,true)+label(108,17,'P')+label(195,105,'R')+label(96,103,'WEB / STIFFENER');break;
  case 'Bracing':title='Restraint and unbraced length';drawing=rect(25,44,190,10)+path('M30 49Q93 27 155 49',true,true)+[30,155,210].map(x=>path(`M${x} 43V27`,true)+path(`M${x-6} 24l6 9 6 -9Z`,true)).join('')+dimension(30,155,75,'Lb')+label(122,15,'LATERAL RESTRAINT');break;
  case 'Fatigue':title='Stress range at a cyclic detail';drawing=path('M34 18V83H206')+path('M40 54Q50 7 63 54T87 54T111 54T135 54T159 54T183 54',true)+path('M39 31H203M39 77H203',false,true)+arrow(199,31,199,77)+arrow(199,77,199,31)+label(216,57,'Δσ', 'middle',true)+label(119,101,'REPEATED CYCLES');break;
  case 'Detailing':title='Bolt layout and movement allowance';drawing=rect(33,30,174,46)+[65,168].map(x=>`<rect x="${x-13}" y="47" width="26" height="12" rx="6" fill="none" stroke="${accent}" stroke-width="2"/>`+circle(x,53,4)).join('')+dimension(33,65,20,'edge',true)+dimension(65,168,88,'pitch / travel')+path('M117 44H185',false,true);break;
  case 'Connections':case 'Flange attachment':({title,note,linework:drawing}=tie(p,topic==='Flange attachment'));break;
  case 'Column bracket':({title,note,linework:drawing}=bracket(p));break;
  case 'Rail details':title='Rail, keeper and local flange';drawing=rect(48,84,151,6)+path('M101 78V47H94V39H143V47H136V78H155V84H82V78Z')+rect(68,77,21,7,true)+rect(149,77,21,7,true)+circle(119,24,12)+arrow(119,2,119,10)+arrow(169,55,139,55)+label(181,58,'H', 'start',true)+path('M37 53L68 77')+label(42,46,'KEEPER');break;
  case 'Analysis':title='Equilibrium and refinement';drawing=beam(48)+[82,155].map(x=>arrow(x,12,x,43)).join('')+arrow(30,105,30,78)+arrow(210,105,210,78)+[55,82,109,136,163,190].map(x=>circle(x,52,2,true)).join('')+label(120,92,'ΣR = ΣP', 'middle',true)+label(120,112,'refine travel + stations');break;
  case 'Longitudinal bracing':title='Crane-level longitudinal bracing';drawing=path('M40 100H200')+path('M60 100V22M180 100V22M60 22H180')+path('M60 100L180 22M60 22L180 100',true)+arrow(18,22,56,22)+label(30,15,'H')+label(120,113,'BRACED BAY · TIERS · DIAGONALS');note='Traction or stop force and building wind/seismic forces resolve into the braced-bay diagonals; columns and foundation take the overturning.';break;
  case 'Existing column':case 'Supporting structure':case 'Interfaces':title=topic==='Existing column'?'Existing column: crane plus building loads':'Forces transferred to the building';drawing=column()+rect(49,47,145,8)+arrow(107,17,107,42)+arrow(129,33,184,33)+arrow(210,69,210,93)+label(103,13,'V')+label(151,25,'H / N')+label(116,89,'CONCURRENT ACTIONS');note='Retain simultaneous signed reactions when transferring forces to the separately designed building.';break;
  default:title='Inputs, checks and report record';drawing=[26,100,174].map((x,i)=>rect(x,29,43,45)+path(`M${x+9} 42h25M${x+9} 51h25M${x+9} 60h17`)+label(x+21,93,['INPUT','CHECK','REPORT'][i])).join('')+arrow(75,51,94,51)+arrow(149,51,168,51);note='Record project inputs, calculation revision and references. Export is controlled by the actual validation results.';
 }
 return {title,note,svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" role="img" aria-label="${escape(title)}" data-check-figure="${escape(topic)}"><title>${escape(title)}</title><desc>${escape(note)} Schematic, not to scale. Highlighted lines identify the reviewed action or component; dashed lines show context or an idealized response.</desc>${drawing}</svg>`};
}
export function checkFigureHtml(topic:string,p?:ProjectInput){
 const f=checkFigure(topic,p);
 return `<figure class="calculation-figure">${f.svg}<figcaption><strong>${escape(f.title)}</strong><p>${escape(f.note)}</p><small>SCHEMATIC · NOT TO SCALE</small></figcaption></figure>`;
}
/** Scoped so ARCH D drawing SVGs and existing equation styles are untouched. */
export const checkFigureCss=`.calculation-figure{display:flex;align-items:center;gap:12px;margin:7px 0 10px;padding:5px 8px;background:#fafcfc;border:1px solid #dce5e6;border-radius:3px;break-inside:avoid;page-break-inside:avoid;break-after:avoid}.calculation-figure>svg{display:block;width:192px;height:96px;flex:0 0 192px}.calculation-figure figcaption{min-width:0;color:#40545a;font:11px/1.4 Arial,sans-serif}.calculation-figure figcaption strong{display:block;font-size:11px;color:#23474e}.calculation-figure figcaption p{margin:3px 0}.calculation-figure figcaption small{display:block;font-size:8px;color:${muted};letter-spacing:.4px}.report-figure-strip{display:flex;gap:8px;break-inside:avoid;break-after:avoid}.report-figure-strip>.calculation-figure{flex:1;min-width:0;display:block;text-align:center}.report-figure-strip>.calculation-figure>svg{width:170px;height:85px;max-width:100%;margin:0 auto}.report-figure-strip>.calculation-figure figcaption p{font-size:9px}.report-figure-strip>.calculation-figure figcaption strong{font-size:10px}`;
