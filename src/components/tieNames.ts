import type {ProjectInput} from '../engine/types';
import {capAngleGeometry} from '../engine/capAngle';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {detailRef,detailTitles,capAngleTitles} from './sheetGraphics';

/**
 * What restrains the girder top flange at the column, as the support, bracket and force-table notes name it:
 * "THE CAP TIEBACK ANGLES (1/S-03)" with a cap angle tieback, else the direct flange ties.
 */
export function topFlangeRestraint(p:ProjectInput,withRef=true){
 if(capAngleGeometry(p))return `THE CAP TIEBACK ANGLES${withRef?` (${detailRef(capAngleTitles.section)})`:''}`;
 const tie=flangeTieGeometry(p),name=tie&&tie.sides.length===1&&tie.sides[0]>0?'THE TOP FLANGE TIES':'THE FLANGE TIES';
 return `${name}${tie&&withRef?` (${detailRef(detailTitles.flangeTie)})`:''}`;
}
