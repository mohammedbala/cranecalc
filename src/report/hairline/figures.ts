import type {ProjectInput} from '../../engine/types';
import {Scene} from './scene';
import {bracket,column,girders,rail,steelTop,stiffeners,supportGeometry,ties,wheel} from './parts';
import {activeColumnCap} from '../../engine/columnCapInputs';
import {defaultColumnBase} from '../../engine/columnBaseInputs';

const supportName:Record<string,string>={'twin-rib':'TWIN-RIB BRACKET','haunched-seat':'HAUNCHED SEAT','rolled-corbel':'W STUB','tapered-haunch':'TAPERED I HAUNCH','existing':'EXISTING BRACKET','column-cap':'COLUMN CAP','by-others':'SEAT BY OTHERS'};
/**
 * The summary figure: the support assembly, isometric, with the load path numbered as in the summary table:
 * 1 rail, 2 girder, 3 bearing, 4 support, 5 column, 6 base, 7 lateral restraint, 8 longitudinal force.
 * The near bay's girder is left off so the far girder's end, its bearing and the support read clearly.
 */
/** The summary figure's scene and render options (the figure and its layout for checks). */
function supportAssemblyScene(p:ProjectInput){
 const g=supportGeometry(p),S=new Scene(),G=g.girder,y=g.reach,cap=activeColumnCap(p),c=g.column,top=steelTop(g);
 const base=g.column.isNew&&p.columnBase?.enabled?p.columnBase:undefined,brk=G.d*.45,foot=cap?-cap.plate.thickness-G.d*1.1:g.column.bottom;
 if(cap){
  // The girder sits centered on the column: cap plate on the column top, stiffeners under it.
  const pl=cap.plate;S.at(0,c.d/2);column(S,g,'context',-pl.thickness-G.d*1.1,-pl.thickness);S.at();
  S.group('cap/plate',()=>S.box(-pl.length/2,-pl.width/2,-pl.thickness,pl.length/2,pl.width/2,0,'context'));
 }else{column(S,g,'context');stiffeners(S,p,g,'context');bracket(S,p,g,'context');}
 if(base){
  // The column broken below the support; its base plate and footing at the foot.
  const zb=foot-brk-G.d*.8,pl=(base??defaultColumnBase).plate,ym=cap?0:-c.d/2;
  S.at(0,cap?c.d/2:0);column(S,g,'context',zb,foot-brk);S.at();
  S.group('base/plate',()=>S.box(-pl.B/2,ym-pl.N/2,zb-pl.thickness,pl.B/2,ym+pl.N/2,zb,'context')).group('base/footing',()=>S.box(-pl.B*.85,ym-pl.N*.85,zb-pl.thickness-G.d*.35,pl.B*.85,ym+pl.N*.85,zb-pl.thickness-base.grout,'context'));
  S.marker(6,'base',30,6,[pl.B*.85,ym,zb-pl.thickness-G.d*.2]);
 }
 girders(S,g,'context');if(!cap)ties(S,p,g,'context');rail(S,g,'context');
 const xw=-g.gap/2-g.show*.62,zh=wheel(S,g,xw);
 S.arrow([xw,y,zh+700],[xw,y,zh+330],'P').arrow([xw,y+520,zh-20],[xw,y+90,zh-20],'H').arrow([xw-520,y,zh-20],[xw-130,y,zh-20],'F');
 const xb=g.simple?-g.gap/2-g.bearing.length/2:0,zs=-g.seat.thickness;
 const colFoot:[number,number,number]=[0,cap?0:-c.d/2,foot];
 S.path([[xw,y,zh],[xw,y,G.z0+G.d*.5],[xb,y,G.z0+G.d*.5],[xb,y,0],...(cap?[]:[[xb,y*.55,zs-40],[0,0,zs-60]] as [number,number,number][]),colFoot]);
 S.marker(1,'rail',34,-18,[xw+120,y,g.rail.z+g.rail.height*.6]).marker(2,'girder',-8,26,[-g.show*.85,y+G.bf/2,G.z0+G.d*.5]).marker(3,'bearing/plate',30,16,[xb,y+g.bearing.width/2,G.z0*.5])
  .marker(4,cap?'cap/plate':'bracket',44,8,cap?[cap.plate.length/2,0,-cap.plate.thickness/2]:[0,g.seat.projection*.5,zs-60]).marker(5,'column',30,10,cap?[c.bf/2,c.d/2-c.tf,foot+200]:[c.bf/2,-c.tf,foot+200]);
 // Lateral restraint: the top-flange ties, or the girder end fork on a column cap.
 if(p.details&&!cap)S.marker(7,p.details.brace.arrangement==='cap-angle'?'cap-angle':'tie',30,-24,[g.gap/2+80,y*.35,G.z0+G.d-G.tf-40]);else if(cap)S.marker(7,'bearing/stiffener',-34,10,[xb,G.bf/2,G.z0+G.d*.5]);
 S.marker(8,'load/F',-6,-22,[xw-330,y,zh-20]);
 S.label(c.existing?`EXISTING ${c.name}`:c.name,[0,cap?c.d/2:-c.d,top+(cap?-G.d*.2:12*25.4)],0,-8,'middle');
 S.label(supportName[g.support],cap?[cap.plate.length/2,cap.plate.width/2,-cap.plate.thickness]:[-g.seat.length/2,g.seat.projection,zs],cap?8:-6,14,cap?'start':'end',true);
 if(p.details&&!cap)S.label('TOP TIE',[g.gap/2+80,y*.35,G.z0+G.d-G.tf-40],40,-21,'start',true);
 return {S,options:{az:56,title:'Load path through a support',desc:'Isometric view of a runway support: wheel, rail, girder end with its bearing, the support, the top-flange tie and the column. Numbered markers follow the load path listed in the summary table: 1 rail, 2 girder, 3 bearing, 4 support, 5 column, 6 base, 7 lateral restraint, 8 longitudinal force. P vertical wheel load, H side thrust, F longitudinal force. The near girder is omitted for clarity.',width:400,height:320}};
}
export function supportAssemblyFigure(p:ProjectInput,o:{className?:string}={}){const {S,options}=supportAssemblyScene(p);return S.render({...options,className:o.className});}
/** Where the summary figure's markers, leaders and labels sit, for checks. */
export function supportAssemblyLayout(p:ProjectInput){const {S,options}=supportAssemblyScene(p);return S.layout(options);}
