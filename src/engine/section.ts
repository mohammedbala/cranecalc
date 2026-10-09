import {cappedMechanics} from './cappedMechanics';
import type { Properties, Section } from './types';
import { cappedElasticProperties } from './capChannel';
interface Rectangle {b:number;h:number;y:number;}
export function sectionProperties(s:Section):Properties {
 const h=s.d-2*s.tf;
 if(s.kind==='rolled') return {A:s.A,Ix:s.Ix,Iy:s.Iy,Sx:s.Sx,Sy:s.Sy,Zx:s.Zx,Zy:s.Zy,J:s.J,Cw:s.Cw,cy:s.d/2,h0:s.d-s.tf,weight:s.A*s.density*9.80665/1e9};
 const rect:Rectangle[]=[{b:s.bf,h:s.tf,y:s.tf/2},{b:s.tw,h,y:s.d/2},{b:s.bf,h:s.tf,y:s.d-s.tf/2}];
 if(s.kind==='cap') {
  // Channel is rotated over the top flange: web horizontal, legs downward outside beam flanges.
  rect.push({b:s.capWidth,h:s.capTw,y:s.d+s.capTw/2},{b:s.capTf,h:s.capDepth-s.capTw,y:s.d-(s.capDepth-s.capTw)/2},{b:s.capTf,h:s.capDepth-s.capTw,y:s.d-(s.capDepth-s.capTw)/2});
 }
 const A=rect.reduce((a,r)=>a+r.b*r.h,0),cy=rect.reduce((a,r)=>a+r.b*r.h*r.y,0)/A;
 const Ix=rect.reduce((a,r)=>a+r.b*r.h**3/12+r.b*r.h*(r.y-cy)**2,0);
 // Cap legs lie at their actual transverse offsets.
 const Iy=rect.reduce((a,r,i)=>a+r.h*r.b**3/12+(i>=4?r.b*r.h*((s.capWidth-s.capTf)/2)**2:0),0);
 const top=s.d+(s.kind==='cap'?s.capTw:0);
 let lo=0,hi=top;
 for(let i=0;i<60;i++){ const p=(lo+hi)/2;const below=rect.reduce((a,r)=>a+r.b*Math.max(0,Math.min(r.h,p-(r.y-r.h/2))),0);if(below<A/2)lo=p;else hi=p; }
 const p=(lo+hi)/2;
 const Zx=rect.reduce((a,r)=>{ const y0=r.y-r.h/2,y1=r.y+r.h/2; return a+r.b*(p<=y0?r.h*(r.y-p):p>=y1?r.h*(p-r.y):((p-y0)**2+(y1-p)**2)/2); },0);
 const Zy=rect.reduce((a,r,i)=>a+(i>=4?r.b*r.h*(s.capWidth-s.capTf)/2:r.h*r.b**2/4),0);
 const result={A,Ix,Iy,Sx:Ix/Math.max(cy,top-cy),Sy:Iy/((s.kind==='cap'?Math.max(s.capWidth,s.bf):s.bf)/2),Zx,Zy,J:rect.reduce((a,r)=>a+Math.max(r.b,r.h)*Math.min(r.b,r.h)**3/3,0),Cw:s.kind==='cap'?0:s.tf*s.bf**3*(s.d-s.tf)**2/24,cy,h0:s.d-s.tf,weight:A*s.density*9.80665/1e9};
 const cap=cappedElasticProperties(s);
 if(cap)Object.assign(result,{A:cap.A,Ix:cap.Ix,Iy:cap.Iy,Sx:Math.min(cap.Sbottom,cap.Stop),Sy:cap.Sy,cy:cap.cy,h0:cap.h0,weight:cap.A*s.density*9.80665/1e9});
 const mechanics=cappedMechanics(s);
 if(mechanics)Object.assign(result,{J:mechanics.J,Cw:mechanics.Cw});
 // Cap plastic moduli remain diagnostics: the design branch uses elastic F5.
 return result;
}
