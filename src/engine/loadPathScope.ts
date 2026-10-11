import type {ProjectInput} from './types';
import {capAngleGeometry} from './capAngle';

/**
 * What of the top-flange tie's connection to the column this calculation checks, and what remains by others, for the
 * bracket load-path statement. The cap tieback angle is checked through to the column flange (bolts, end plate,
 * column flange bending, stiffener at the tie level) wherever the receiving column is known; a new column's tie
 * root is checked with the flange attachment; otherwise the tie's column-side connection is by others.
 */
export function tieColumnScope(p:ProjectInput):{byOthers:boolean;sentence:string;title:string}{
 const isNew=!!(p.existingColumn?.enabled&&p.existingColumn.isNew),cap=capAngleGeometry(p);
 const frame='The existing building frame, its connections and foundations beyond the checked column remain by others (listed separately).';
 if(cap?.column.receiver)return {byOthers:false,title:'Bracket and tie load paths to the column',
  sentence:`The top-flange tie is the cap tieback angle, bolted to the column flange: its column bolts, end plate, shims and the column flange in bending${cap.input.stiffener?.enabled?', with the column stiffener at the tie level,':''} are checked under Cap tieback, the bracket welds and the column local effects under Column bracket, and the ${isNew?'new':'existing'} column member under ${isNew?'Supporting structure':'Existing column'}. ${isNew?'':frame}`};
 if(isNew)return {byOthers:false,title:'Bracket and tie load paths to the column',sentence:'The top-flange tie connects to the column independently; its column-side connection is checked with the flange attachment.'};
 return {byOthers:true,title:'Tie connection to the existing column (by others)',
  sentence:`By others: the top-flange tie's connection to the existing column flange (its column-side welds or bolts and the local flange and web effects at the tie) for the tie forces reported here. ${frame}`};
}
