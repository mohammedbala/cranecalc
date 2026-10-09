/** AISC 360-16 J2/J3/J4/J7/J10 primitives. Canonical N, mm, MPa.
 * These functions compute capacities for their explicit geometry, not the 3D
 * illustration. Connection load paths/applicability are checked by the caller.
 */
import { available } from './aiscStrength';
export type DesignMethod='LRFD'|'ASD';
export type BoltGrade='A325'|'A490';
const kip=4448.2216152605,ksi=6.894757293168;
const pretension:{[key in BoltGrade]:Record<number,number>}={A325:{.5:12,.625:19,.75:28,.875:39,1:51,1.125:64,1.25:81,1.375:97,1.5:118},A490:{.5:15,.625:24,.75:35,.875:49,1:64,1.125:80,1.25:102,1.375:121,1.5:148}};
function positive(values:Record<string,number>){for(const [k,v] of Object.entries(values))if(!Number.isFinite(v)||v<=0)throw Error(`Connection ${k} must be finite and positive.`);}
export function boltProperties(grade:BoltGrade,diameter:number){
 const d=Object.keys(pretension[grade]).map(Number).find(x=>Math.abs(x*25.4-diameter)<1e-6);
 if(d===undefined)throw Error('Use an ASTM F3125 A325/A490 bolt with a supported nominal diameter from 1/2 to 1-1/2 in.');
 return {area:Math.PI*diameter**2/4,pretension:pretension[grade][d]*kip,Fnv:(grade==='A325'?54:68)*ksi,Fnt:(grade==='A325'?90:113)*ksi,hole:diameter+(d<1?1/16:1/8)*25.4};
}
export function boltCapacity(input:{grade:BoltGrade;diameter:number;planes:1|2;surface:'A'|'B';shear:number;tension:number;method:DesignMethod;patternLength?:number}){
 const b=boltProperties(input.grade,input.diameter),m=input.method,reduction=(input.patternLength??0)>950?.833:1,Fnv=b.Fnv*reduction;
 const shear=available(Fnv*b.area*input.planes,m,.75,2);
 const requiredShear=Math.abs(input.shear)/(b.area*input.planes),FntPrime=Math.max(0,Math.min(b.Fnt,1.3*b.Fnt-b.Fnt*requiredShear/available(Fnv,m,.75,2)));
 const tension=available(FntPrime*b.area,m,.75,2),T=Math.max(0,input.tension);
 const slipReduction=Math.max(0,1-(m==='LRFD'?1:1.5)*T/(1.13*b.pretension));
 const slip=available((input.surface==='B'?.5:.3)*1.13*b.pretension*input.planes*slipReduction,m,1,1.5);
 return {...b,shear,tension,slip,slipReduction,Fnv,FntPrime};
}
export function elasticBoltGroup(points:{x:number;y:number}[],load:{x:number;y:number;moment:number}){
 if(!points.length||![load.x,load.y,load.moment].every(Number.isFinite))throw Error('Invalid bolt-group loading.');
 const cx=points.reduce((s,p)=>s+p.x,0)/points.length,cy=points.reduce((s,p)=>s+p.y,0)/points.length;
 const J=points.reduce((s,p)=>s+(p.x-cx)**2+(p.y-cy)**2,0);
 if(J===0&&load.moment!==0)throw Error('Bolt group cannot resist in-plane moment.');
 return points.map(p=>{const fx=load.x/points.length-(J?load.moment*(p.y-cy)/J:0),fy=load.y/points.length+(J?load.moment*(p.x-cx)/J:0);return {...p,fx,fy,resultant:Math.hypot(fx,fy)};});
}
export function plateBearing(diameter:number,hole:number,thickness:number,Fu:number,clearEdge:number,pitch:number,method:DesignMethod){
 positive({diameter,hole,thickness,Fu,clearEdge,pitch});
 const clear=Math.min(clearEdge-hole/2,pitch-hole);
 return {clear,capacity:available(Math.max(0,Math.min(1.2*clear*thickness*Fu,2.4*diameter*thickness*Fu)),method,.75,2)};
}
/** Complete paths are supplied from the modeled rectangular bolt pattern. Ubs=.5
 * is conservative for an eccentric/nonuniform tension edge. No user capacity.
 */
export function blockShear(Agv:number,Anv:number,Ant:number,Fy:number,Fu:number,method:DesignMethod){
 positive({Agv,Anv,Ant,Fy,Fu});return available(Math.min(.6*Fu*Anv,.6*Fy*Agv)+.5*Fu*Ant,method,.75,2);
}
export function compressionResistance(A:number,r:number,length:number,E:number,Fy:number,method:DesignMethod){
 positive({A,r,length,E,Fy});const slenderness=length/r,Fe=Math.PI**2*E/slenderness**2,Fcr=Fy/Fe<=2.25?Fy*.658**(Fy/Fe):.877*Fe;
 return {capacity:available(Fcr*A,method,.9,1.67),Fcr,Fe,slenderness};
}
export function plateMember(width:number,thickness:number,length:number,E:number,Fy:number,Fu:number,netWidth:number,method:DesignMethod){
 positive({width,thickness,length,E,Fy,Fu,netWidth});
 const A=width*thickness,r=Math.min(width,thickness)/Math.sqrt(12);
 return {A,r,stiffness:E*A/length,tension:Math.min(available(Fy*A,method,.9,1.67),available(Fu*netWidth*thickness,method,.75,2)),compression:compressionResistance(A,r,length,E,Fy,method)};
}
/** AISC A-3-5M/A-3-6M, stress on the tension-loaded plate, not weld throat. */
export function transverseFilletFatigue(thickness:number,weld:number,cycles:number){
 positive({thickness,weld,cycles});
 const reduction=Math.min(1,(.103+1.24*weld/thickness)/thickness**.167);
 const finite=6900*reduction*(4.4/cycles)**.333;
 return {reduction,capacity:reduction===1?Math.max(69,finite):finite};
}
/** Table J2.4: use the thicker joined part; inches converted to mm. */
export function minimumFillet(thickerPart:number){return (thickerPart<=6.35?1/8:thickerPart<=12.7?3/16:thickerPart<=19.05?1/4:5/16)*25.4;}
/** Two parallel fillet-weld lines on x=+-g/2, from y=-L/2 to +L/2.
 * Evaluates the four endpoints; the norm of the affine elastic stress field has
 * its maximum there. No directional-strength increase or plastic redistribution.
 */
export function parallelWeldGroup(input:{length:number;gauge:number;size:number;Fexx:number;method:DesignMethod;vx:number;vy:number;normal:number;mx:number;my:number;mz:number}){
 const p=input;positive({length:p.length,gauge:p.gauge,size:p.size,Fexx:p.Fexx});
 if(p.length<4*p.size)throw Error('Effective fillet-weld length must be at least four times the leg size.');
 const ratio=p.length/p.size,beta=ratio<=100?1:ratio<=300?1.2-.002*ratio:180/ratio;
 const throat=p.size/Math.sqrt(2),A=2*throat*p.length,Ix=2*throat*p.length**3/12,Iy=2*throat*p.length*(p.gauge/2)**2,J=Ix+Iy;
 const points=[-1,1].flatMap(sx=>[-1,1].map(sy=>{const x=sx*p.gauge/2,y=sy*p.length/2;const tx=p.vx/A-p.mz*y/J,ty=p.vy/A+p.mz*x/J,n=p.normal/A+p.mx*y/Ix-p.my*x/Iy;return {x,y,tx,ty,normal:n,stress:Math.hypot(tx,ty,n)};}));
 const demand=Math.max(...points.map(v=>v.stress)),capacity=available(.6*p.Fexx*beta,p.method,.75,2);
 return {A,Ix,Iy,J,beta,points,demand,capacity,utilization:demand/capacity};
}
/** Paired fitted full-depth bearing stiffeners, compression under J10.8.
 * Uses the 12tw end web strip for every support conservatively. The two plates
 * connect continuously to the web. Actual end cope is deducted from bearing area.
 */
export function bearingStiffener(input:{width:number;thickness:number;cope:number;webThickness:number;webDepth:number;flangeThickness:number;loadedWidth:number;E:number;Fy:number;method:DesignMethod}){
 const p=input;positive({width:p.width,thickness:p.thickness,webThickness:p.webThickness,webDepth:p.webDepth,flangeThickness:p.flangeThickness,loadedWidth:p.loadedWidth,E:p.E,Fy:p.Fy});
 if(p.cope<0||p.cope>=p.width)throw Error('Stiffener cope must be smaller than its outstand.');
 const w=12*p.webThickness,A=w*p.webThickness+2*p.width*p.thickness;
 const Ix=w*p.webThickness**3/12+2*(p.thickness*p.width**3/12+p.width*p.thickness*((p.webThickness+p.width)/2)**2);
 const Iy=p.webThickness*w**3/12+2*p.width*p.thickness**3/12;
 const r=Math.sqrt(Math.min(Ix,Iy)/A),compression=compressionResistance(A,r,.75*p.webDepth,p.E,p.Fy,p.method);
 const bearingArea=2*(p.width-p.cope)*p.thickness;
 return {A,Ix,Iy,r,compression,bearingArea,bearing:available(1.8*p.Fy*bearingArea,p.method,.75,2),minimumWidth:p.loadedWidth/3-p.webThickness/2,minimumThickness:Math.max(p.flangeThickness/2,p.width/16)};
}
