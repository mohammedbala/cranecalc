import {line,dimH,dimV,n,type XY} from './sheetGraphics';
import type {RibGeometry} from '../engine/bracketRib';

/** Closed outline of plate linework. */
export const outline=(points:XY[],cls='runway-line')=>`<path class="${cls}" d="M${points.map(v=>`${n(v[0])},${n(v[1])}`).join('L')}Z"/>`;
/**
 * Side elevation of a haunched rib under the seat: root depth at the column face, straight sloping free edge to the
 * tip depth at the seat edge. x of the tip and the face, y of the rib top (seat underside); k points per mm.
 */
export const haunchedRibOutline=(g:RibGeometry,tip:number,face:number,rootY:number,k:number,cls='runway-line')=>outline([[tip,rootY],[face,rootY],[face,rootY+g.root*k],[tip,rootY+g.tip*k]],cls);
/**
 * The haunched rib in the transverse bracket section with its dimensions: the projection below the root, and on the
 * tip side the tip depth nearest the part and the root depth beyond it, its lower extension line carried from the root
 * corner under the sloping edge.
 */
export function haunchedRibView(g:RibGeometry,v:{tip:number;face:number;rootY:number;bot:number;k:number},dim:(mm:number)=>string){
 const {tip,face,rootY,bot,k}=v,tipY=rootY+g.tip*k;
 let svg=haunchedRibOutline(g,tip,face,rootY,k);
 // Projection: the tip extension line starts just below the tip corner.
 svg+=dimH(tip,face,bot,bot+22,dim(g.length))+line([tip,tipY+2],[tip,bot]);
 svg+=dimV(rootY,tipY,tip,tip-22,dim(g.tip));
 svg+=dimV(rootY,bot,tip,tip-48,dim(g.root))+line([face-2,bot],[tip,bot]);
 return svg;
}
/** Looking at the column: each rib's tip edge across its thickness, and the tip and root depths at the left rib. */
export function haunchedFaceRibs(g:RibGeometry,spacing:number,v:{cx:number;ribTop:number;bot:number;k:number},dim:(mm:number)=>string){
 const {cx,ribTop,bot,k}=v,tipY=ribTop+g.tip*k,left=cx-spacing*k/2,half=g.thickness*k/2;
 let svg='';
 for(const x of [left,cx+spacing*k/2])svg+=line([x-half,tipY],[x+half,tipY],'runway-line');
 svg+=dimV(ribTop,tipY,left-half,left-half-24,dim(g.tip))+dimV(ribTop,bot,left-half,106,dim(g.root));
 return svg;
}
/** Callout of the two haunched rib plates. */
export const haunchedRibCallout=(g:RibGeometry,thickness:string,dim:(mm:number)=>string)=>[`2 HAUNCHED RIB PL ${thickness}`,`${dim(g.root)} AT COLUMN TO ${dim(g.tip)} AT TIP`,`X ${dim(g.length)} PROJ.`];
/** Fabrication note for the sloping free edge, the Category A plain-plate detail of the fatigue check. */
export const haunchedRibNotes=(units:'US'|'SI')=>[`CUT THE SLOPING FREE EDGE OF EACH HAUNCHED RIB STRAIGHT FROM THE ROOT TO THE TIP, THERMALLY CUT TO A SURFACE ROUGHNESS OF ${units==='SI'?'25 MICROMETERS (1,000 MICROINCHES)':'1,000 MICROINCHES (25 MICROMETERS)'} OR LESS (AISC 360 TABLE A-3.1, ITEM 1.1). NO NOTCHES, GOUGES OR RE-ENTRANT CORNERS; NO WELDS OR ATTACHMENTS ON THE FREE EDGE.`];
