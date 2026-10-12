/**
 * Pure geometry of the project's tapered I haunch for drawings, figures and the 3D model: every plate, weld, bolt
 * hole and girder bearing plate in mm, from the same engine values the checks use.
 *
 * Coordinates: x along the runway from the grid (the haunch web plane, x = 0), y across the runway from the column
 * face toward the runway centerline, z up from the top of the haunch (the seat, z = 0). Plates are given as outlines
 * in their own plane with their thickness; welds as straight runs with their size, sides and location.
 */
import type {ProjectInput} from './types';
import {haunchGeometry,type HaunchGeometry} from './taperedHaunchInputs';
import {activeEndBearing} from './endBearingInputs';
import {simpleSupportInput,endGridCentered} from './simpleSupports';
import {boltProperties} from './connectionStrength';

export type XYZ=[number,number,number];
export interface HaunchPlate {
 id:'web'|'top-flange'|'bottom-flange'|'stiffener-left'|'stiffener-right'|'end-plate';name:string;thickness:number;
 /** Outline of the plate's face, closed polygon in 3D (mm). */
 outline:XYZ[];
 /** Unit normal of that face, pointing through the plate's thickness. */
 normal:XYZ;
 /** Overall size for the bill of materials: width x length (plate thickness separate). */
 size:{width:number;length:number};
}
export interface HaunchWeld {
 id:string;kind:'cjp'|'fillet';size:number;location:'field'|'shop';
 /** 2: a fillet on both faces of the joint; `path` is the joint line, `runs` each fillet as built. */
 sides:1|2;path:[XYZ,XYZ];name:string;
 /** Fillets: each run's root (the corner line) and the unit directions of its two legs along the joined faces. */
 runs:{path:[XYZ,XYZ];legs:[XYZ,XYZ]}[];
}
export interface HaunchBolt {grid:'interior'|'runway-end';x:number;y:number;diameter:number;hole:number}
export interface HaunchBearing {grid:'interior'|'runway-end';x0:number;x1:number;y0:number;y1:number;thickness:number}

/**
 * The haunch's plates and welds from its geometry: outlines in mm (x along the runway from the web plane, y from the
 * column face, z up from the top of the haunch); `field` makes the welds to the column field welds.
 */
export function haunchPlatesAndWelds(g:HaunchGeometry,field:boolean){
 const {L,a,hr,tt,tbv,tw,bt,btr,bb,s}=g,st=g.stiffener,tep=g.endPlate?st.t:0,Lw=L-tep,zTop=-tt;
 const under=(y:number)=>-g.depth(y),inner=(y:number)=>-g.depth(y)+tbv;
 const plates:HaunchPlate[]=[];
 plates.push({id:'web',name:'Web',thickness:tw,normal:[1,0,0],size:{width:hr-tt-tbv,length:Lw},
  outline:[[-tw/2,0,zTop],[-tw/2,Lw,zTop],[-tw/2,Lw,inner(Lw)],[-tw/2,0,inner(0)]]});
 const f=g.flare,top:XYZ[]=f?[[-btr/2,0,0],[btr/2,0,0],[btr/2,f.y0,0],[bt/2,f.y1,0],[bt/2,L,0],[-bt/2,L,0],[-bt/2,f.y1,0],[-btr/2,f.y0,0]]:[[-bt/2,0,0],[bt/2,0,0],[bt/2,L,0],[-bt/2,L,0]];
 plates.push({id:'top-flange',name:f?'Top flange (seat), flared':'Top flange (seat)',thickness:tt,normal:[0,0,-1],size:{width:bt,length:L},outline:top});
 const n=Math.hypot(1,s);
 plates.push({id:'bottom-flange',name:'Sloping bottom flange',thickness:g.tb,normal:[0,-s/n,1/n],size:{width:bb,length:g.bottomLength},
  outline:[[-bb/2,0,under(0)],[bb/2,0,under(0)],[bb/2,L,under(L)],[-bb/2,L,under(L)]]});
 // Bearing stiffeners in the plane y = a, one each side of the web, corner clips at the web.
 const zb=inner(a),c=st.clip;
 for(const sx of [-1,1]){const x0=sx*tw/2,x1=sx*(tw/2+st.width);
  plates.push({id:sx<0?'stiffener-left':'stiffener-right',name:'Bearing stiffener',thickness:st.t,normal:[0,1,0],size:{width:st.width,length:st.height},
   outline:[[x0+sx*c,a-st.t/2,zTop],[x1,a-st.t/2,zTop],[x1,a-st.t/2,zb],[x0+sx*c,a-st.t/2,zb],[x0,a-st.t/2,zb+c],[x0,a-st.t/2,zTop-c]]});}
 if(g.endPlate){const w=Math.min(bt,bb);plates.push({id:'end-plate',name:'Tip end plate',thickness:tep,normal:[0,1,0],size:{width:w,length:zTop-inner(Lw)},
  outline:[[-w/2,Lw,zTop],[w/2,Lw,zTop],[w/2,Lw,inner(Lw)],[-w/2,Lw,inner(Lw)]]});}
 // Welds.
 const welds:HaunchWeld[]=[],where=field?'field' as const:'shop' as const,wf=g.flangeWebWeld,x0=tw/2+wf;
 if(g.joint==='cjp'){
  welds.push({id:'top-flange-column',kind:'cjp',size:tt,location:where,sides:1,path:[[-btr/2,0,-tt/2],[btr/2,0,-tt/2]],name:'Top flange to column flange, CJP',runs:[]});
  welds.push({id:'bottom-flange-column',kind:'cjp',size:g.tb,location:where,sides:1,path:[[-bb/2,0,under(0)+tbv/2],[bb/2,0,under(0)+tbv/2]],name:'Bottom flange to column flange, CJP',runs:[]});
 }else{
  welds.push({id:'top-flange-column-outer',kind:'fillet',size:g.flangeWeld,location:where,sides:1,path:[[-btr/2,0,0],[btr/2,0,0]],name:'Top flange to column, outer face',runs:[{path:[[-btr/2,0,0],[btr/2,0,0]],legs:[[0,0,1],[0,1,0]]}]});
  welds.push({id:'bottom-flange-column-outer',kind:'fillet',size:g.flangeWeld,location:where,sides:1,path:[[-bb/2,0,under(0)],[bb/2,0,under(0)]],name:'Bottom flange to column, outer face',runs:[{path:[[-bb/2,0,under(0)],[bb/2,0,under(0)]],legs:[[0,0,-1],[0,1,0]]}]});
  for(const sx of [-1,1]){
   welds.push({id:`top-flange-column-inner-${sx}`,kind:'fillet',size:g.flangeWeld,location:where,sides:1,path:[[sx*x0,0,zTop],[sx*btr/2,0,zTop]],name:'Top flange to column, inner face',runs:[{path:[[sx*x0,0,zTop],[sx*btr/2,0,zTop]],legs:[[0,0,-1],[0,1,0]]}]});
   welds.push({id:`bottom-flange-column-inner-${sx}`,kind:'fillet',size:g.flangeWeld,location:where,sides:1,path:[[sx*x0,0,inner(0)],[sx*bb/2,0,inner(0)]],name:'Bottom flange to column, inner face',runs:[{path:[[sx*x0,0,inner(0)],[sx*bb/2,0,inner(0)]],legs:[[0,0,1],[0,1,0]]}]});
  }
 }
 welds.push({id:'web-column',kind:'fillet',size:g.webWeld,location:where,sides:2,path:[[0,0,zTop-wf],[0,0,inner(0)+wf]],name:'Web to column flange, both sides',runs:[-1,1].map(sx=>({path:[[sx*tw/2,0,zTop-wf],[sx*tw/2,0,inner(0)+wf]] as [XYZ,XYZ],legs:[[sx,0,0],[0,1,0]] as [XYZ,XYZ]}))});
 welds.push({id:'top-flange-web',kind:'fillet',size:wf,location:'shop',sides:2,path:[[0,0,zTop],[0,Lw,zTop]],name:'Top flange to web, both sides',runs:[-1,1].map(sx=>({path:[[sx*tw/2,0,zTop],[sx*tw/2,Lw,zTop]] as [XYZ,XYZ],legs:[[sx,0,0],[0,0,-1]] as [XYZ,XYZ]}))});
 welds.push({id:'bottom-flange-web',kind:'fillet',size:wf,location:'shop',sides:2,path:[[0,0,inner(0)],[0,Lw,inner(Lw)]],name:'Bottom flange to web, both sides',runs:[-1,1].map(sx=>({path:[[sx*tw/2,0,inner(0)],[sx*tw/2,Lw,inner(Lw)]] as [XYZ,XYZ],legs:[[sx,0,0],[0,0,1]] as [XYZ,XYZ]}))});
 for(const sx of [-1,1]){const xa=sx*(tw/2+c),xb=sx*(tw/2+st.width);
  welds.push({id:`stiffener-web-${sx}`,kind:'fillet',size:st.weld,location:'shop',sides:2,path:[[sx*tw/2,a,zTop-c],[sx*tw/2,a,zb+c]],name:'Stiffener to web, both faces',runs:[-1,1].map(fy=>({path:[[sx*tw/2,a+fy*st.t/2,zTop-c],[sx*tw/2,a+fy*st.t/2,zb+c]] as [XYZ,XYZ],legs:[[0,fy,0],[sx,0,0]] as [XYZ,XYZ]}))});
  welds.push({id:`stiffener-bottom-${sx}`,kind:'fillet',size:st.weld,location:'shop',sides:2,path:[[xa,a,zb],[xb,a,zb]],name:'Stiffener to bottom flange, both faces',runs:[-1,1].map(fy=>({path:[[xa,a+fy*st.t/2,zb],[xb,a+fy*st.t/2,zb]] as [XYZ,XYZ],legs:[[0,fy,0],[0,0,1]] as [XYZ,XYZ]}))});
  welds.push({id:`stiffener-top-${sx}`,kind:'fillet',size:st.weld,location:'shop',sides:2,path:[[xa,a,zTop],[xb,a,zTop]],name:'Stiffener fitted to bear on the top flange and welded, both faces',runs:[-1,1].map(fy=>({path:[[xa,a+fy*st.t/2,zTop],[xb,a+fy*st.t/2,zTop]] as [XYZ,XYZ],legs:[[0,fy,0],[0,0,-1]] as [XYZ,XYZ]}))});
 }
 if(g.endPlate){const w=Math.min(bt,bb);
  welds.push({id:'end-plate-web',kind:'fillet',size:st.weld,location:'shop',sides:2,path:[[0,Lw,zTop],[0,Lw,inner(Lw)]],name:'End plate to web, both sides',runs:[-1,1].map(sx=>({path:[[sx*tw/2,Lw,zTop],[sx*tw/2,Lw,inner(Lw)]] as [XYZ,XYZ],legs:[[0,-1,0],[sx,0,0]] as [XYZ,XYZ]}))});
  welds.push({id:'end-plate-top',kind:'fillet',size:st.weld,location:'shop',sides:1,path:[[-w/2,Lw,zTop],[w/2,Lw,zTop]],name:'End plate to top flange',runs:[{path:[[-w/2,Lw,zTop],[w/2,Lw,zTop]],legs:[[0,-1,0],[0,0,-1]]}]});
  welds.push({id:'end-plate-bottom',kind:'fillet',size:st.weld,location:'shop',sides:1,path:[[-w/2,Lw,inner(Lw)],[w/2,Lw,inner(Lw)]],name:'End plate to bottom flange',runs:[{path:[[-w/2,Lw,inner(Lw)],[w/2,Lw,inner(Lw)]],legs:[[0,-1,0],[0,0,1]]}]});
 }
 return {plates,welds};
}

export function taperedHaunchParts(p:ProjectInput){
 const d=p.details!,b=d.bracket!,g:HaunchGeometry=haunchGeometry(b,d.bearing.width),field=!(p.existingColumn?.enabled&&p.existingColumn.isNew);
 const {L,a,hr,bt,btr}=g,f=g.flare;
 const {plates,welds}=haunchPlatesAndWelds(g,field);
 // Bearing bolt holes through the top flange and the girder bearing plates: an interior grid (both girder ends of
 // simple spans, or a continuous girder's centered bearing) and a runway-end grid (the girder end on the grid, or with
 // endGridBearing 'centered' the bearing centered on the web, the girder running half its length past the grid).
 const e=activeEndBearing(p),Lb=d.bearing.length,W=d.bearing.width,tb=d.bearing.thickness,bolts:HaunchBolt[]=[],bearings:HaunchBearing[]=[];
 const gap=p.system==='simple'?simpleSupportInput(p).endGap:0;
 const interior=p.system==='simple'?[{x0:gap/2,dir:1},{x0:-gap/2,dir:-1}]:[{x0:-Lb/2,dir:1}];
 for(const v of interior)bearings.push({grid:'interior',x0:Math.min(v.x0,v.x0+v.dir*Lb),x1:Math.max(v.x0,v.x0+v.dir*Lb),y0:a-W/2,y1:a+W/2,thickness:tb});
 const end0=endGridCentered(p)?-Lb/2:0;
 bearings.push({grid:'runway-end',x0:end0,x1:end0+Lb,y0:a-W/2,y1:a+W/2,thickness:tb});
 if(e){const rows=[e.bolts.edge,Lb-e.bolts.edge],ys=[a-e.bolts.gauge/2,a+e.bolts.gauge/2],hole=boltProperties(e.bolts.grade,e.bolts.diameter).hole;
  for(const v of interior)for(const r of rows)for(const y of ys)bolts.push({grid:'interior',x:v.x0+v.dir*r,y,diameter:e.bolts.diameter,hole});
  for(const r of rows)for(const y of ys)bolts.push({grid:'runway-end',x:end0+r,y,diameter:e.bolts.diameter,hole});}
 return {geometry:g,plates,welds,bolts,bearings,
  /** Key dimensions: projection, reach (girder web line), root and tip depth, slope, top flange flare. */
  dims:{L,reach:a,rootDepth:hr,tipDepth:g.ht,slopeDegrees:g.degrees,flare:f?{start:f.y0,end:f.y1,radius:f.radius,rootWidth:btr,seatWidth:bt}:undefined}};
}
export type TaperedHaunchParts=ReturnType<typeof taperedHaunchParts>;
