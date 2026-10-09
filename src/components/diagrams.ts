import type { CalculationSnapshot } from '../engine/types';
import { format } from '../engine/units';
import { drawingSvg, engineeringSketches } from './drafting';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const begin=(title:string,height=260)=>`<svg xmlns="http://www.w3.org/2000/svg" class="analysis-diagram" viewBox="0 0 860 ${height}" role="img" aria-label="${esc(title)}"><rect width="860" height="${height}" fill="#fff"/><style>.analysis-diagram text{font-family:Arial,sans-serif;font-size:11px;fill:#52655f}.analysis-diagram .label{font-size:12px;fill:#233c35}.analysis-diagram .line{stroke:#264a40;stroke-width:2;fill:none}.analysis-diagram .dim{stroke:#92a29a;stroke-width:1;fill:none}.analysis-diagram .wheel{fill:#b2874f}</style><text x="26" y="25" class="label">${esc(title)}</text>`;
function sketch(s:CalculationSnapshot,name:string,title:string):string {
 const drawing=engineeringSketches(s).find(d=>d.name===name);
 return drawing?drawingSvg(drawing):begin(title)+`<text x="26" y="70">Correct inputs to preview this sketch.</text></svg>`;
}
export const elevation=(s:CalculationSnapshot)=>sketch(s,'runway-elevation','Runway elevation');
export const sectionDiagram=(s:CalculationSnapshot)=>sketch(s,'girder-section','Girder cross-section');
export const planDiagram=(s:CalculationSnapshot)=>sketch(s,'runway-plan','Runway plan');
export function envelopeDiagram(s:CalculationSnapshot,kind:'moment'|'shear'|'deflection'|'lateral'='moment'):string {
 const rows=s.analysis?.envelope;if(!rows?.length)return begin('Envelope unavailable')+'</svg>';
 const L=pLength(s),v=(r:typeof rows[number],side:'Max'|'Min')=>kind==='moment'?r[`moment${side}`]:kind==='shear'?r[`shear${side}`]:kind==='lateral'?r[`lateral${side}`]:r[`deflection${side}`];
 const peak=Math.max(1,...rows.flatMap(r=>[Math.abs(v(r,'Max')),Math.abs(v(r,'Min'))])),X=(x:number)=>48+x/L*764,Y=(y:number)=>132-y/peak*75;
 const quantity=kind==='deflection'?'length':kind==='shear'?'force':'moment';
 const title={moment:'Vertical bending moment envelope',shear:'Vertical shear envelope',deflection:'Static crane-load deflection envelope',lateral:'Lateral bending moment envelope'}[kind];
 let svg=begin(title,255);svg+=`<path d="M48 52V212H812M48 132H812" class="dim"/>`;
 for(const side of ['Max','Min'] as const){const path=rows.map((r,i)=>`${i?'L':'M'}${X(r.x).toFixed(2)},${Y(v(r,side)).toFixed(2)}`).join(' ');svg+=`<path d="${path}" fill="none" stroke="${side==='Max'?'#3a7057':'#b2874f'}" stroke-width="2"/>`;}
 svg+=`<text x="50" y="44">±${esc(format(peak,quantity,s.input.units))}</text><text x="48" y="237">0</text><text x="812" y="237" text-anchor="end">${esc(format(L,'length',s.input.units))}</text><text x="430" y="237" text-anchor="middle">Positive / negative envelopes · coincident cases retained separately</text></svg>`;return svg;
}
const pLength=(s:CalculationSnapshot)=>s.input.spans.reduce((a,b)=>a+b,0);
export function connectionDiagram(s:CalculationSnapshot):string {
 const c=s.input.connections;let svg=begin('Connection templates · schematic only; full connection design required',295);
 svg+=`<rect x="60" y="62" width="135" height="170" fill="none" stroke="#17212b"/><path d="M38 65h195M38 232h195M135 65v167" class="line" style="stroke:#17212b;stroke-width:1.2"/><rect x="112" y="82" width="46" height="130" fill="none" stroke="#17212b"/>`;
 const shown=Math.min(c.bolts,8);for(let i=0;i<shown;i++)svg+=`<circle cx="135" cy="${94+i*105/Math.max(shown-1,1)}" r="4" fill="none" stroke="#17212b"/>`;
 svg+=`<text x="60" y="255">Bolted web end connection</text><text x="272" y="80">${c.bolts} bolts · Ø ${esc(format(c.boltDiameter,'length',s.input.units))}</text><text x="272" y="109">Plate: ${esc(format(c.plateThickness,'length',s.input.units))}</text><text x="272" y="138">Pitch: ${esc(format(c.boltPitch,'length',s.input.units))}</text><text x="272" y="167">Edge distance: ${esc(format(c.edgeDistance,'length',s.input.units))}</text><text x="272" y="196">Fillet weld: ${esc(format(c.weldSize,'length',s.input.units))}</text><path d="M630 230V66M590 66h110M590 230h110M630 150l110-70M630 150l110 80" class="line" style="stroke:#17212b;stroke-width:1.2"/><rect x="625" y="98" width="10" height="100" fill="none" stroke="#17212b"/><text x="583" y="255">Bearing stiffener / lateral restraint</text><text x="26" y="281">Geometry is illustrative, not to scale. No fabrication or connection adequacy is implied.</text></svg>`;return svg;
}
export function diagramSet(s:CalculationSnapshot){return [{name:'runway-elevation',svg:elevation(s)},{name:'girder-section',svg:sectionDiagram(s)},{name:'runway-plan',svg:planDiagram(s)},{name:'moment-envelope',svg:envelopeDiagram(s)},{name:'shear-envelope',svg:envelopeDiagram(s,'shear')},{name:'deflection-envelope',svg:envelopeDiagram(s,'deflection')},{name:'lateral-moment-envelope',svg:envelopeDiagram(s,'lateral')},...engineeringSketches(s).filter(d=>d.number>='SK-04').map(d=>({name:d.name,svg:drawingSvg(d)})),...(s.input.connections.enabled&&!s.input.details?[{name:'connection-schematics',svg:connectionDiagram(s)}]:[])];}
