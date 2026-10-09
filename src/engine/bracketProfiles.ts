import type {BracketInput} from './bracketInputs';
import {defaultExistingBracket} from './existingBracketInputs';
import {aiscShapeByName} from '../data/aiscSections';

export const defaultExistingWShape='W12X65';
export const isExistingBracketType=(kind?:string)=>kind==='existing-corbel'||kind==='existing-w-corbel';
export const defaultWideFlangeBracket=()=>({...structuredClone(defaultExistingBracket),shape:defaultExistingWShape});
export function selectExistingWideFlange(b:BracketInput,shape:string):BracketInput{
 const current=b.wideFlange??defaultWideFlangeBracket();
 if(current.shape===shape)return {...b,wideFlange:current};
 return {...b,wideFlange:{...current,shape,surveyConfirmed:false,conditionConfirmed:false,
  rating:{...defaultExistingBracket.rating,method:current.rating.method}}};
}
/** Catalogue geometry is derived, so imports cannot silently substitute custom
 * dimensions while retaining a W-shape designation. Custom plate inputs stay
 * separate and are restored when that bracket type is reselected. */
export function existingBracketProfile(b?:BracketInput){
 if(b?.arrangement!=='existing-w-corbel')return b?.existing??defaultExistingBracket;
 const e=b.wideFlange??defaultWideFlangeBracket(),shape=aiscShapeByName(e.shape);
 return shape?{...e,depth:shape.d*25.4,width:shape.bf*25.4,flangeThickness:shape.tf*25.4,webThickness:shape.tw*25.4}:e;
}
export function existingBracketLabel(b?:BracketInput){
 return b?.arrangement==='existing-w-corbel'?`${b.wideFlange?.shape??defaultExistingWShape} WIDE-FLANGE BRACKET`:'BUILT-UP I-BRACKET';
}
export function existingBracketSectionArea(b:BracketInput){
 const e=existingBracketProfile(b),shape=b.arrangement==='existing-w-corbel'?aiscShapeByName(b.wideFlange?.shape??defaultExistingWShape):undefined;
 return shape?shape.A*25.4**2:2*e.width*e.flangeThickness+(e.depth-2*e.flangeThickness)*e.webThickness;
}
