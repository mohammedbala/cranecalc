import type {ProjectInput} from '../../engine/types';
import {Scene,type Role,type Vec3} from './scene';
import {column,girders,railRun,steelTop,type SupportGeometry} from './parts';
import {capAngleGeometry,capAngleTieParts} from '../../engine/capAngle';

/**
 * The cap tieback angle in the report's isometric figures, drawn from the engine's tie geometry (capAngleTieParts:
 * x along the runway from the tie centerline, y from the girder web toward the column, z up from the top of the cap).
 * Hairline world: x along the runway from the grid, y from the column face toward the runway, z up from the seat.
 */
export function capAngleTies(S:Scene,p:ProjectInput,g:SupportGeometry,role:Role,o:{both?:boolean;bolts?:boolean}={}){
 const parts=capAngleTieParts(p),c=capAngleGeometry(p);if(!parts||!c)return S;
 const top=steelTop(g),Y=(y:number)=>g.reach-y,Z=(z:number)=>top+z,set=c.input.setback;
 // The far girder's tie (x < 0), and the near one's when both are shown: mirror images along the runway.
 const xs=g.simple?[-g.gap/2-set,...(o.both?[g.gap/2+set]:[])]:[0];
 for(const xt of xs){
  const s=xt>0?-1:1,X=(x:number)=>xt+s*x;
  for(const b of parts.boxes){
   if(b.kind==='channel-flange'||b.kind==='column-flange'||b.kind==='sleeve')continue;
   // The short leg stops under the long leg so the two legs do not overlap (painted as separate plates).
   const z1=b.name.startsWith('angle short leg')?-c.ta:b.max[2];
   S.box(X(b.min[0]),Y(b.max[1]),Z(b.min[2]),X(b.max[0]),Y(b.min[1]),Z(z1),role);
  }
  if(!o.bolts)continue;
  for(const b of parts.bolts){
   const r=b.diameter/2;
   if(b.axis==='z')S.cylinder(2,[X(b.head[0]),Y(b.head[1])],r,Z(b.nut[2]),Z(b.head[2]),role);
   else S.cylinder(1,[X(b.head[0]),Z(b.head[2])],r,Y(Math.max(b.head[1],b.nut[1])),Y(Math.min(b.head[1],b.nut[1])),role);
  }
 }
 return S;
}

/** Load-path marker as [point, paper dx, paper dy]. */
type Mark=[Vec3,number,number];
/**
 * The cap tieback figure for the 'Cap tieback' calculation groups (and 'Connections'): the far girder end with its
 * cap, the angle on the column-side channel flange, the tie plate, the end plate on the column flange, numbered as
 * the caption steps (six markers).
 */
export function capAngleFigure(p:ProjectInput,g:SupportGeometry){
 const c=capAngleGeometry(p);if(!c)return undefined;
 const S=new Scene(),G=g.girder,y=g.reach,top=steelTop(g),set=c.input.setback,xt=-g.gap/2-set;
 column(S,g,'context',-g.seat.thickness-G.d*.2,top+G.d*.2);
 const h={...g,simple:true};girders(S,h,'context','context','context',G.d*1.2);
 S.box(-g.seat.length/2,0,-g.seat.thickness,g.seat.length/2,g.seat.projection,0,'context');
 capAngleTies(S,p,h,'focus',{bolts:true});
 const zh=g.rail.z+g.rail.height,xr=-g.gap/2-G.d*.9;railRun(S,g,xr,-g.gap/2,y,'context');
 const zr=zh-g.rail.headThickness/2;
 S.arrow([xr+G.d*.3,y+G.bf*2.2,zr],[xr+G.d*.3,y+g.rail.headWidth/2+12,zr],'H');
 S.label('CAP ANGLE TIE',[g.seat.length/2,g.seat.projection,-g.seat.thickness],6,14,'start',true);
 const L=c.input.length,cap=G.cap;
 const marks:Mark[]=[
  [[xr+G.d*.3,y+G.bf*1.4,zr],-6,-18],
  [[xt-L/2-G.d*.25,y-(cap?.width??G.bf)/2,top-(cap?.depth??G.tf)/2],-26,14],
  [[xt-c.cap.pitch/2,y-c.y0-c.ta,top+c.cap.z],-24,22],
  [[xt,y-(c.lap.y+c.toe)/2,top+c.plate.thickness],8,-22],
  [[xt,y-c.endPlate.y0,top+c.endPlate.z1],22,-14],
  [[xt+c.endPlate.width,0,top+c.endPlate.z0-G.d*.15],26,14]];
 marks.forEach(([at,dx,dy],i)=>S.marker(i+1,at,dx,dy));
 return {body:S.body({width:240,height:120,margin:[34,26],az:56}),markers:marks.length};
}
