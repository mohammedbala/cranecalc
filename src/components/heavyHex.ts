import {n} from './sheetGraphics';

const inch=25.4;
/**
 * Heavy hex structural bolt head and heavy hex nut proportions (ASME B18.2.6, ASTM A563): width across flats
 * 1.5d + 1/8 in, head height about 5/8 d, nut height d - 1/64 in. Hardened F436 washers are 5/32 in thick.
 */
export function heavyHex(db:number){
 const flats=1.5*db+inch/8;
 return {flats,corners:flats*2/Math.sqrt(3),head:.625*db,nut:db-inch/64,washer:{t:inch*5/32,od:2*db+inch/8}};
}
/**
 * Head or nut seen across its corners, as drafted: outline with the edges of the three visible faces. `face` is
 * the bearing face; the part rises from it (dir -1, upward on the sheet) or hangs below it (dir 1).
 */
export function hexSide(cx:number,face:number,corners:number,height:number,dir:1|-1,cls='runway-line'){
 const y0=Math.min(face,face+dir*height),q=corners/4;
 return `<rect class="${cls}" x="${n(cx-corners/2)}" y="${n(y0)}" width="${n(corners)}" height="${n(height)}"/>`
  +[-q,q].map(x=>`<line class="${cls}" x1="${n(cx+x)}" y1="${n(y0)}" x2="${n(cx+x)}" y2="${n(y0+height)}"/>`).join('');
}
/** Head or nut in plan: a hexagon of the given width across flats, flats parallel to the drawing x axis. */
export function hexPlan(cx:number,cy:number,flats:number,cls='runway-line'){
 const r=flats/Math.sqrt(3),pts=[0,60,120,180,240,300].map(a=>[cx+r*Math.cos(a*Math.PI/180),cy+r*Math.sin(a*Math.PI/180)]);
 return `<path class="${cls}" d="M${pts.map(p=>`${n(p[0])},${n(p[1])}`).join('L')}Z"/>`;
}
/** Bolt length for a grip: AISC Manual length to add to the grip, plus one F436 washer, rounded up to 1/4 in (5 mm). */
export function boltLength(db:number,grip:number,units:'US'|'SI'){
 const add:Record<string,number>={'0.5':11/16,'0.625':7/8,'0.75':1,'0.875':1.125,'1':1.25,'1.125':1.5,'1.25':1.625,'1.375':1.75,'1.5':1.875};
 const inches=Math.round(db/inch*1000)/1000,need=grip+(add[String(inches)]??inches+.25)*inch+heavyHex(db).washer.t,step=units==='US'?inch/4:5;
 return Math.ceil(need/step-1e-9)*step;
}
