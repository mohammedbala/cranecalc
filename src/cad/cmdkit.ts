import {parseLength,transformEnt,type Affine,type Ent,type NewEnt,type Pt} from './model';
import type {CadStore} from './store';

/** What a command can ask of the editor. */
export interface Env{
 store:CadStore;
 layer():string;
 textHeight():number;setTextHeight(h:number):void;
 dimHeight():number;
 offsetDistance():number|undefined;setOffsetDistance(d:number):void;
 log(message:string):void;
 /** Entities on visible layers whose extents touch e's (trim and extend boundaries). */
 neighbors(e:Ent):Ent[];
 zoomExtents():void;zoomWindow(a:Pt,b:Pt):void;
 openPanel(panel:'layers'|'properties'):void;
 /** A drawing length as it reads at the drawing scale. */
 length(d:number):string;
 /** Command settings that persist between commands (AutoCAD system variables: FILLETRAD, POLYSIDES ...). */
 vars:Record<string,number|string|boolean>;
 /** Block editing (BEDIT, BCLOSE) and attribute editing: the editor's to do. */
 editBlock?(name:string):void;closeBlock?(save:boolean):void;editAttributes?(id:number):void;blockEditing?():string|undefined;
 /** The window of the last selection made by a window or crossing, if any (STRETCH). */
 lastWindow():{box:[number,number,number,number];crossing:boolean}|undefined;
}
export interface Preview{ents?:NewEnt[];rubber?:[Pt,Pt];tip?:string}
export interface Command{
 name:string;
 prompt():string;
 /** Gather a selection (or use the current one) before begin(). */
 selectFirst?:boolean;
 begin?():void;
 point?(p:Pt):void;
 /** The step wants an object picked rather than a point. */
 wantsPick?():boolean;
 pick?(e:Ent|undefined,p:Pt):void;
 /** A typed keyword or value; false if not understood (the editor then reads it as a point). */
 text?(s:string):boolean;
 enter?():void;
 preview?(cursor:Pt):Preview|undefined;
 /** The last point: relative input, ortho, perpendicular snap and the rubber band start here. */
 base?():Pt|undefined;
 /** The command line takes free text (text content). */
 freeText?():boolean;
 /** The selection stays when the command ends (selection commands). */
 keepSelection?:boolean;
 done:boolean;
}

export const strip=(e:Ent):NewEnt=>{const {id:_,...rest}=e;return rest as NewEnt;};
export const key=(s:string)=>s.trim().toUpperCase();
export const num=(s:string)=>parseLength(s);
export const fmtAngle=(a:number)=>`${Number(((a%360+360)%360).toFixed(2))}°`;
/** Selected entities on unlocked layers. */
export const editable=(env:Env)=>env.store.selected().filter(e=>!env.store.layer(e.layer)?.locked);
export const ghosts=(list:Ent[],m:Affine)=>list.length>1500?undefined:list.map(e=>strip(transformEnt(e,m)));
/** An angle typed in degrees, or undefined. */
export const angleText=(s:string)=>{const v=Number(s.trim().replace(/[°d]$/i,''));return s.trim()&&Number.isFinite(v)?v:undefined;};
/** Whether the typed text is the keyword (any of its capitalized short forms, or the full word). */
export const isKey=(s:string,...words:string[])=>{const k=key(s).replace(/\s+/g,' ');return words.some(w=>{const short=w.replace(/[^A-Z]/g,'');return k===w.toUpperCase()||(!!short&&k===short);});};
/** A locked-layer check for picked objects. */
export const lockedPick=(env:Env,e:Ent)=>{if(env.store.layer(e.layer)?.locked){env.log('That object is on a locked layer.');return true;}return false;};

/** In model space, annotation is drafted at the annotation scale: paper sizes divided by it, and marked annotative. */
export const annoFactor=(env:Env)=>env.store.doc.space==='model'?1/(env.store.doc.annoScale??1):1;
export const annoProps=(env:Env):{annotative?:true}=>env.store.doc.space==='model'?{annotative:true}:{};
