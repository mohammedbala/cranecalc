import {sheetFormat} from './sheetGraphics';

/**
 * The generated sheet SVG read back as drawing entities: lines, polylines, solids, circles and text with
 * every group transform applied, on layers by CSS class. The DXF export writes these; the detail sheet
 * composer measures details with them.
 */
export type Units='US'|'SI';
type Matrix=[number,number,number,number,number,number];
export type Pt=[number,number];
export interface LayerDef {color:number;weight:number;ltype:'Continuous'|'DASHED'|'CENTER'|'HIDDEN';}

/** Layers by drawing role; lineweights in 1/100 mm. */
export const sheetLayers:Record<string,LayerDef>={
 'S-STEEL-NEW':{color:7,weight:50,ltype:'Continuous'},
 'S-STEEL-HIDDEN':{color:7,weight:25,ltype:'HIDDEN'},
 'S-RAIL':{color:6,weight:35,ltype:'Continuous'},
 'S-EXISTING':{color:8,weight:18,ltype:'DASHED'},
 'S-GRID':{color:1,weight:18,ltype:'CENTER'},
 'S-ANNO':{color:2,weight:18,ltype:'Continuous'},
 'S-PATT':{color:8,weight:13,ltype:'Continuous'},
 'S-ANNO-HEAVY':{color:7,weight:35,ltype:'Continuous'},
 'S-ANNO-SYMB':{color:3,weight:25,ltype:'Continuous'},
 'S-ANNO-TEXT':{color:7,weight:25,ltype:'Continuous'},
 'G-TTLB':{color:7,weight:50,ltype:'Continuous'},
 'G-TTLB-TEXT':{color:7,weight:25,ltype:'Continuous'}
};
const classLayer:Record<string,string>={'runway-line':'S-STEEL-NEW','hidden-line':'S-STEEL-HIDDEN','rail-line':'S-RAIL','reference-line':'S-EXISTING','grid-line':'S-GRID','annotation':'S-ANNO','divider':'S-ANNO-HEAVY','bubble':'S-ANNO-SYMB','leader-arrow':'S-ANNO','dot':'S-ANNO','hatch':'S-PATT','hatch-dot':'S-PATT'};

const identity:Matrix=[1,0,0,1,0,0];
const multiply=(m:Matrix,n:Matrix):Matrix=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
const applyTo=(m:Matrix,[x,y]:Pt):Pt=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function transform(value:string|undefined):Matrix{
 let m=identity;
 for(const [,fn,args] of (value??'').matchAll(/(\w+)\(([^)]*)\)/g)){
  const v=args.split(/[\s,]+/).filter(Boolean).map(Number);
  if(fn==='translate')m=multiply(m,[1,0,0,1,v[0],v[1]??0]);
  else if(fn==='scale')m=multiply(m,[v[0],0,0,v[1]??v[0],0,0]);
  else if(fn==='rotate'){const a=v[0]*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=v[1]??0,cy=v[2]??0;m=multiply(multiply(multiply(m,[1,0,0,1,cx,cy]),[c,s,-s,c,0,0]),[1,0,0,1,-cx,-cy]);}
 }
 return m;
}
const attributes=(tag:string)=>Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const unescape=(v:string)=>v.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
/** Points along an SVG elliptical arc (endpoint form, SVG 1.1 F.6.5), excluding the start point. */
function arcPoints(from:Pt,rx:number,ry:number,phi:number,large:boolean,sweep:boolean,to:Pt):Pt[]{
 if(!rx||!ry||(from[0]===to[0]&&from[1]===to[1]))return [to];
 const c=Math.cos(phi*Math.PI/180),s=Math.sin(phi*Math.PI/180),dx=(from[0]-to[0])/2,dy=(from[1]-to[1])/2;
 const x1=c*dx+s*dy,y1=-s*dx+c*dy;rx=Math.abs(rx);ry=Math.abs(ry);
 const scale=x1*x1/(rx*rx)+y1*y1/(ry*ry);if(scale>1){rx*=Math.sqrt(scale);ry*=Math.sqrt(scale);}
 const num=rx*rx*ry*ry-rx*rx*y1*y1-ry*ry*x1*x1,den=rx*rx*y1*y1+ry*ry*x1*x1;
 const k=(large===sweep?-1:1)*Math.sqrt(Math.max(0,num/den)),cx1=k*rx*y1/ry,cy1=-k*ry*x1/rx;
 const cx=c*cx1-s*cy1+(from[0]+to[0])/2,cy=s*cx1+c*cy1+(from[1]+to[1])/2;
 const angle=(ux:number,uy:number,vx:number,vy:number)=>Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
 const t0=angle(1,0,(x1-cx1)/rx,(y1-cy1)/ry);let dt=angle((x1-cx1)/rx,(y1-cy1)/ry,(-x1-cx1)/rx,(-y1-cy1)/ry);
 if(!sweep&&dt>0)dt-=2*Math.PI;else if(sweep&&dt<0)dt+=2*Math.PI;
 const steps=Math.max(2,Math.ceil(Math.abs(dt)/(Math.PI/12))),out:Pt[]=[];
 for(let i=1;i<steps;i++){const t=t0+dt*i/steps,ex=rx*Math.cos(t),ey=ry*Math.sin(t);out.push([c*ex-s*ey+cx,s*ex+c*ey+cy]);}
 out.push(to);return out;
}
/** Subpaths of an SVG path using the M/L/H/V/A/Z commands the sheets emit; arcs become short chords. */
function pathPoints(d:string){
 const out:{points:Pt[];closed:boolean}[]=[];let current:Pt=[0,0],start:Pt=[0,0],sub:Pt[]|undefined,command='M';
 const tokens=[...d.matchAll(/[MLHVAZmlhvaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)].map(m=>m[0]);
 for(let i=0;i<tokens.length;){
  if(/[A-Za-z]/.test(tokens[i]))command=tokens[i++];
  if(command==='Z'||command==='z'){if(sub){out[out.length-1].closed=true;current=start;sub=undefined;}continue;}
  const num=()=>Number(tokens[i++]),rel=command===command.toLowerCase();
  let next:Pt[];
  switch(command.toUpperCase()){
   case 'M':case 'L':{const x=num(),y=num();next=[rel?[current[0]+x,current[1]+y]:[x,y]];break;}
   case 'H':{const x=num();next=[[rel?current[0]+x:x,current[1]]];break;}
   case 'V':{const y=num();next=[[current[0],rel?current[1]+y:y]];break;}
   case 'A':{const rx=num(),ry=num(),phi=num(),large=num()!==0,sweep=num()!==0,x=num(),y=num();next=arcPoints(current,rx,ry,phi,large,sweep,rel?[current[0]+x,current[1]+y]:[x,y]);break;}
   default:i++;continue;
  }
  if(next.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])))break;
  if(command.toUpperCase()==='M'){sub=[next[0]];out.push({points:sub,closed:false});start=next[0];command=rel?'l':'L';}
  else{if(!sub){sub=[current];out.push({points:sub,closed:false});}sub.push(...next);}
  current=next[next.length-1];
 }
 return out.filter(v=>v.points.length>1);
}

export type Entity=
 {type:'line';layer:string;a:Pt;b:Pt}|
 {type:'poly';layer:string;points:Pt[];closed:boolean}|
 {type:'solid';layer:string;points:Pt[]}|
 {type:'circle';layer:string;center:Pt;radius:number}|
 {type:'text';layer:string;at:Pt;height:number;value:string;angle:number;align:0|1|2;bold:boolean};

/** Convert one generated sheet SVG (viewBox 0 0 2592 1728, 72 units/in) to entities in paper units. */
export function sheetEntities(svg:string,units:Units,offsetX=0):Entity[]{
 const k=units==='US'?1/72:25.4/72,height=sheetFormat.height,entities:Entity[]=[];
 const paper=(m:Matrix,p:Pt):Pt=>{const [x,y]=applyTo(m,p);return [offsetX+x*k,(height-y)*k];};
 const stack:{m:Matrix;content:boolean}[]=[{m:identity,content:false}];
 const re=/<(\/?)([a-zA-Z]+)((?:[^>"]|"[^"]*")*?)(\/?)>([^<]*)/g;
 for(const [,close,name,raw,selfClose,after] of svg.matchAll(re)){
  const top=stack[stack.length-1];
  if(name==='g'){if(close)stack.pop();else if(!selfClose){const a=attributes(raw);stack.push({m:multiply(top.m,transform(a.transform)),content:top.content||a['data-sheet-content']!==undefined});}continue;}
  if(close)continue;
  const a=attributes(raw),cls=a.class??'annotation';
  if(/stroke:\s*none/.test(a.style??'')&&name!=='text')continue;
  const m=multiply(top.m,transform(a.transform)),scale=Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
  const layer=cls==='divider'&&!top.content?'G-TTLB':classLayer[cls]??'S-ANNO';
  const filled=cls==='leader-arrow'||cls==='dot'||/fill:\s*#/.test(a.style??'');
  if(name==='line')entities.push({type:'line',layer,a:paper(m,[+a.x1,+a.y1]),b:paper(m,[+a.x2,+a.y2])});
  else if(name==='rect'){const x=+a.x,y=+a.y,w=+a.width,h=+a.height;entities.push({type:'poly',layer,closed:true,points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>paper(m,p as Pt))});}
  else if(name==='circle')entities.push({type:'circle',layer,center:paper(m,[+a.cx,+a.cy]),radius:+a.r*scale*k});
  else if(name==='polyline'){const v=(a.points??'').split(/[\s,]+/).filter(Boolean).map(Number),pts:Pt[]=[];for(let i=0;i+1<v.length;i+=2)pts.push(paper(m,[v[i],v[i+1]]));if(pts.length>1)entities.push({type:'poly',layer,closed:false,points:pts});}
  else if(name==='path')for(const sub of pathPoints(a.d??'')){
   const pts=sub.points.map(p=>paper(m,p));
   if(filled&&sub.closed&&(pts.length===3||pts.length===4))entities.push({type:'solid',layer,points:pts});
   else entities.push({type:'poly',layer,closed:sub.closed,points:pts});
  }
  else if(name==='text'){
   const value=unescape(after).trim();if(!value)continue;
   const angle=-Math.atan2(m[1],m[0])*180/Math.PI,anchor=a['text-anchor'];
   entities.push({type:'text',layer:top.content?'S-ANNO-TEXT':'G-TTLB-TEXT',at:paper(m,[+a.x,+a.y]),height:+(a['font-size']??9)*.716*scale*k,value,angle:Math.abs(angle)<1e-9?0:angle,align:anchor==='middle'?1:anchor==='end'?2:0,bold:+(a['font-weight']??400)>=600});
  }
 }
 return entities;
}

