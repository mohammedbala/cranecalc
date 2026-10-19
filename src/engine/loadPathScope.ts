import type {ProjectInput} from './types';
import {capAngleGeometry} from './capAngle';
import {tiedToBuilding} from './craneColumnInputs';

/**
 * What of the top-flange tie's connection to the column this calculation checks, and what remains by others, for the
 * bracket load-path statement. The cap tieback angle is checked through to the column flange (bolts, end plate,
 * column flange bending, stiffener at the tie level) wherever the receiving column is known; a new column's tie
 * root is checked with the flange attachment; otherwise the tie's column-side connection is by others.
 */
export function tieColumnScope(p:ProjectInput):{byOthers:boolean;sentence:string;title:string}{
 const tied=tiedToBuilding(p),isNew=!tied&&!!(p.existingColumn?.enabled&&p.existingColumn.isNew),cap=capAngleGeometry(p);
 const frame='The existing building frame, its connections and foundations beyond the checked column remain by others (listed separately).';
 if(cap?.column.receiver)return {byOthers:false,title:'Bracket and tie load paths to the column',
  sentence:`The top-flange tie is the cap tieback angle, bolted to the column flange: its column bolts, end plate, shims and the column flange in bending${cap.input.stiffener?.enabled?', with the column stiffener at the tie level,':''} are checked under Cap tieback, the bracket welds and the column local effects under Column bracket, and the ${isNew?'new':'existing'} column member under ${isNew?'Supporting structure':tied?'Building column':'Existing column'}. ${tied?'The column tie\'s tab and its connection to the building column are by others for the column-tie force reported here. ':''}${isNew?'':frame}`};
 // A crane column tied to the building: both ties reach the existing building column, whose connections are by others.
 if(tied)return {byOthers:true,title:'Tie connections to the building column (by others)',
  sentence:`By others: the connections of the top-flange tie and of the column tie to the existing building column (the tie's column gusset welds or bolts, the column tie's tab, and the local flange and web effects at both) for the tie forces reported here. The building column member is checked under Building column, the crane column under Crane column. ${frame}`};
 if(isNew)return {byOthers:false,title:'Bracket and tie load paths to the column',sentence:'The top-flange tie connects to the column independently; its column-side connection is checked with the flange attachment.'};
 return {byOthers:true,title:'Tie connection to the existing column (by others)',
  sentence:`By others: the top-flange tie's connection to the existing column flange (its column-side welds or bolts and the local flange and web effects at the tie) for the tie forces reported here. ${frame}`};
}
