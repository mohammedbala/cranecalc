/**
 * The block library: crane runway drafting symbols in paper inches (base point first): grid bubbles, section and
 * detail marks, north arrow, revision delta, elevation target, bolts and anchor rods, AWS A2.4 weld symbols and an
 * ARCH D title block. Library blocks are copied into a drawing the first time they are inserted.
 */
import type {BlockDef} from './blocks';
import {polar,type Align,type Ent,type NewEnt,type Pt} from './model';

const ln=(a:Pt,b:Pt):NewEnt=>({type:'line',layer:'0',a,b});
const pl=(points:Pt[],closed=false):NewEnt=>({type:'poly',layer:'0',points,closed});
const ci=(center:Pt,radius:number):NewEnt=>({type:'circle',layer:'0',center,radius});
const so=(...points:Pt[]):NewEnt=>({type:'solid',layer:'0',points});
const tx=(at:Pt,height:number,value:string,align:Align=1,bold=false):NewEnt=>({type:'text',layer:'0',at,height,value,angle:0,align,bold});
const att=(tag:string,prompt:string,value:string,at:Pt,height:number,align:Align=1,invisible=false):NewEnt=>({type:'attdef',layer:'0',tag,prompt,value,at,height,angle:0,align,...(invisible?{invisible:true}:{})});
const def=(name:string,description:string,base:Pt,ents:NewEnt[]):BlockDef=>({name,description,base,units:'in',entities:ents.map((e,i)=>({...e,id:i+1}) as Ent)});

// ---- AWS A2.4 weld symbols ---------------------------------------------------------------------------------------
type WeldKind='fillet'|'v'|'bevel'|'plug';
/** A weld symbol: arrow tip at the base point, arrow line up to the reference line, basic symbols on the arrow and/or other side. */
function weld(name:string,description:string,kind:WeldKind,sides:'arrow'|'other'|'both',o:{allAround?:boolean;field?:boolean}={}):BlockDef{
 const y=.375,j:Pt=[.5,y],x0=.85,s=.14,ents:NewEnt[]=[];
 ents.push(ln([0,0],j),ln(j,[1.5,y]),so([0,0],[.1,.0396],[.0754,.0752]));
 // Tail with the process or specification note.
 ents.push(ln([1.5,y],[1.62,y+.1]),ln([1.5,y],[1.62,y-.1]),att('TAIL','Tail note (process, specification)','',[1.66,y-.045],.09,0));
 for(const side of sides==='both'?[-1,1]:[sides==='arrow'?-1:1]){
  const yy=(d:number)=>y+side*d;
  if(kind==='fillet')ents.push(pl([[x0,y],[x0,yy(s)],[x0+s,y]]));
  if(kind==='v')ents.push(pl([[x0,y],[x0+s*.55,yy(s)],[x0+s*1.1,y]]));
  if(kind==='bevel')ents.push(ln([x0,y],[x0,yy(s)]),ln([x0,yy(s)],[x0+s*.8,y]));
  if(kind==='plug')ents.push(pl([[x0,y],[x0,yy(s*.8)],[x0+s*1.1,yy(s*.8)],[x0+s*1.1,y]]));
  const ty=side<0?y-s*.8:y+s*.25;
  ents.push(att(side<0?'SIZE':'SIZE2',side<0?'Weld size (arrow side)':'Weld size (other side)',kind==='fillet'?'5/16':'',[x0-.04,ty],.09,2),att(side<0?'LENGTH':'LENGTH2',side<0?'Length-pitch (arrow side)':'Length-pitch (other side)','',[x0+s*1.2+.04,ty],.09,0));
 }
 if(o.allAround)ents.push(ci(j,.055));
 if(o.field)ents.push(ln(j,[.5,y+.27]),so([.5,y+.27],[.66,y+.215],[.5,y+.16]));
 return def(name,description,[0,0],ents);
}

const titleRows:[string,string,string,number][]=[
 ['PROJECT','Project name','CRANE RUNWAY',.16],['CLIENT','Client','',.12],['TITLE','Sheet title','GENERAL ARRANGEMENT',.16],
 ['PROJNO','Project number','',.12],['DATE','Date','',.1],['SCALE','Scale','AS NOTED',.1],['DRAWN','Drawn by','',.1],['CHECKED','Checked by','',.1],['REV','Revision','0',.12],
];

export const blockLibrary:BlockDef[]=[
 def('GRID-BUBBLE','Column grid bubble with its grid mark',[0,0],[ci([0,0],.25),att('GRID','Grid mark','A',[0,-.0938],.1875)]),
 def('SECTION-MARK','Section mark: section number over sheet, with the view arrow',[0,0],[ci([0,0],.3125),ln([-.3125,0],[.3125,0]),so([.22,.22],[.56,0],[.22,-.22]),att('SECTION','Section number','1',[0,.07],.12),att('SHEET','Sheet number','S-02',[0,-.19],.1)]),
 def('DETAIL-BUBBLE','Detail callout: detail number over sheet',[0,0],[ci([0,0],.3125),ln([-.3125,0],[.3125,0]),att('DETAIL','Detail number','1',[0,.07],.12),att('SHEET','Sheet number','S-02',[0,-.19],.1)]),
 def('NORTH-ARROW','North arrow',[0,0],[ci([0,0],.375),so([0,.375],[.12,-.2],[0,-.08]),pl([[0,.375],[-.12,-.2],[0,-.08]],true),tx([0,.45],.15,'N',1,true)]),
 def('REV-DELTA','Revision delta',[0,0],[pl([polar([0,0],.25,90),polar([0,0],.25,210),polar([0,0],.25,330)],true),att('REV','Revision','1',[0,-.06],.11)]),
 def('ELEV-MARK','Elevation target with its elevation',[0,0],[ci([0,0],.125),so([0,0],[.125,0],[.0884,.0884],[0,.125]),so([0,0],[-.125,0],[-.0884,-.0884],[0,-.125]),ln([.125,0],[1,0]),att('ELEV','Elevation','T.O. RAIL EL. 0\'-0"',[.18,.05],.1,0)]),
 def('BOLT-PLAN','High-strength bolt in plan: hole and centerlines',[0,0],[ci([0,0],.0625),ln([-.1,0],[.1,0]),ln([0,-.1],[0,.1]),att('DIA','Bolt diameter','3/4"',[0,0],.06,1,true)]),
 def('BOLT-ELEV','High-strength bolt in elevation: head, shank, washer and nut',[0,0],[pl([[-.1,0],[.1,0],[.1,.06],[-.1,.06]],true),pl([[-.0375,0],[.0375,0],[.0375,-.5],[-.0375,-.5]],true),
  pl([[-.08,-.5],[.08,-.5],[.08,-.515],[-.08,-.515]],true),pl([[-.1,-.515],[.1,-.515],[.1,-.585],[-.1,-.585]],true),ln([0,.1],[0,-.65]),att('DIA','Bolt diameter and grade','3/4" A325',[.15,-.3],.08,0)]),
 def('ANCHOR-ROD','Anchor rod with nut, washer plate and hooked end',[0,0],[ln([-.03,.15],[-.03,-1.2]),ln([.03,.15],[.03,-1.1]),
  pl([[-.09,.03],[.09,.03],[.09,.1],[-.09,.1]],true),pl([[-.14,0],[.14,0],[.14,.03],[-.14,.03]],true),{type:'arc',layer:'0',center:[.12,-1.2],radius:.15,start:180,end:270},{type:'arc',layer:'0',center:[.12,-1.1],radius:.09,start:180,end:270},
  ln([.12,-1.35],[.3,-1.35]),ln([.12,-1.19],[.3,-1.19]),att('ROD','Rod diameter, grade and embedment','3/4" F1554 GR 36',[.2,-.5],.08,0)]),
 weld('WELD-FILLET','Fillet weld, arrow side (AWS A2.4)','fillet','arrow'),
 weld('WELD-FILLET-OTHER','Fillet weld, other side (AWS A2.4)','fillet','other'),
 weld('WELD-FILLET-BOTH','Fillet weld, both sides (AWS A2.4)','fillet','both'),
 weld('WELD-FILLET-AA','Fillet weld all around (AWS A2.4)','fillet','arrow',{allAround:true}),
 weld('WELD-FILLET-FIELD','Field fillet weld (AWS A2.4)','fillet','arrow',{field:true}),
 weld('WELD-CJP-V','V-groove weld, arrow side (AWS A2.4)','v','arrow'),
 weld('WELD-PJP-BEVEL','Bevel-groove weld, arrow side (AWS A2.4)','bevel','arrow'),
 weld('WELD-PLUG','Plug or slot weld, arrow side (AWS A2.4)','plug','arrow'),
 (()=>{
  // ARCH D (36 × 24 in) border with a 4 in title strip on the right; base point at the lower-left corner of the sheet.
  const ents:NewEnt[]=[pl([[.5,.5],[35.5,.5],[35.5,23.5],[.5,23.5]],true),pl([[31.5,.5],[35.5,.5],[35.5,23.5],[31.5,23.5]],true)];
  let y=23.5;
  for(const [tag,prompt,value,h] of titleRows){const rh=h>=.16?1.2:.75;y-=rh;ents.push(ln([31.5,y],[35.5,y]),tx([31.6,y+rh-.17],.07,prompt.toUpperCase(),0),att(tag,prompt,value,[33.5,y+rh*.3],h));}
  ents.push(tx([33.5,2.2],.12,'SHEET',1),att('SHEET','Sheet number','S-01',[33.5,1.2],.5),ln([31.5,3],[35.5,3]));
  return def('TITLE-ARCHD','ARCH D border and title block with attributes',[0,0],ents);
 })(),
];
export const libraryBlock=(name:string)=>blockLibrary.find(b=>b.name===name);
