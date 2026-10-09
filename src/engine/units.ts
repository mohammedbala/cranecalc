export type Quantity='length'|'force'|'moment'|'stress'|'area'|'inertia'|'modulus'|'warping'|'lineLoad'|'ratio'|'stiffness'|'temperature'|'temperatureChange'|'density';
const us:Record<Quantity,[number,string]>={length:[25.4,'in'],force:[4448.221615,'kip'],moment:[1355817.948,'kip-ft'],stress:[6.894757293,'ksi'],area:[25.4**2,'in²'],inertia:[25.4**4,'in⁴'],modulus:[25.4**3,'in³'],warping:[25.4**6,'in⁶'],lineLoad:[14.59390294,'kip/ft'],ratio:[1,''],stiffness:[4448.221615/25.4,'kip/in'],temperature:[5/9,'°F'],temperatureChange:[5/9,'°F'],density:[.45359237/.3048**3,'lb/ft³']};
const si:Record<Quantity,[number,string]>={length:[1,'mm'],force:[1000,'kN'],moment:[1e6,'kN·m'],stress:[1,'MPa'],area:[1,'mm²'],inertia:[1,'mm⁴'],modulus:[1,'mm³'],warping:[1,'mm⁶'],lineLoad:[1,'kN/m'],ratio:[1,''],stiffness:[1000,'kN/mm'],temperature:[1,'°C'],temperatureChange:[1,'°C'],density:[1,'kg/m³']};
export const unit=(q:Quantity,u:'US'|'SI')=>(u==='US'?us:si)[q][1];
export const toDisplay=(v:number,q:Quantity,u:'US'|'SI')=>v/(u==='US'?us:si)[q][0]+(q==='temperature'&&u==='US'?32:0);
export const fromDisplay=(v:number,q:Quantity,u:'US'|'SI')=>(v-(q==='temperature'&&u==='US'?32:0))*(u==='US'?us:si)[q][0];
export function format(v:number|undefined,q:Quantity,u:'US'|'SI',digits=2){if(v===undefined||!Number.isFinite(v))return '—'; const d=toDisplay(v,q,u),magnitude=Math.abs(d),scientific=magnitude>=1e7||(magnitude>0&&magnitude<.5*10**(-digits)); return `${scientific?d.toExponential(3):d.toLocaleString('en-US',{maximumFractionDigits:digits})}${unit(q,u)?` ${unit(q,u)}`:''}`;}

/** Project numbers are already stored in N, mm and MPa. Only change presentation. */
export function withSiUnits<T extends {units:'US'|'SI'}>(project:T):T{return project.units==='SI'?project:{...project,units:'SI'};}
export function withImperialUnits<T extends {units:'US'|'SI'}>(project:T):T{return project.units==='US'?project:{...project,units:'US'};}
/** AISC catalogue nominal mass is supplied in lb/ft; keep source values intact. */
export function formatSectionMass(lbPerFoot:number,units:'US'|'SI'){
 const value=units==='SI'?lbPerFoot*.45359237/.3048:lbPerFoot;
 return `${value.toLocaleString('en-US',{maximumFractionDigits:2})} ${units==='SI'?'kg/m':'lb/ft'}`;
}
