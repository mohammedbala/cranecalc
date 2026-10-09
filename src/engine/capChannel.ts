import {aiscChannelByName,matchesCappedSection} from '../data/aiscChannels';
import {aiscShapeByName} from '../data/aiscSections';
import type {Section} from './types';

/** Elastic properties from the tabulated component areas, centroids and inertias.
 * The channel is inverted over the W top flange. All values returned in mm/N.
 * Full composite longitudinal action is an analysis assumption; weld adequacy
 * and monosymmetric stability are NOT established by this transformation.
 */
export function cappedElasticProperties(s:Section){
 if(!matchesCappedSection(s)||s.capWidth<s.bf+2*s.capTf||s.capDepth>=s.d)return null;
 const w=aiscShapeByName(s.catalogueId!)!,c=aiscChannelByName(s.capCatalogueId!)!,inch=25.4;
 const A=w.A+c.A,yw=w.d/2,yc=w.d+c.tw-c.x,cy=(w.A*yw+c.A*yc)/A;
 const Ix=w.Ix+c.Iy+w.A*(yw-cy)**2+c.A*(yc-cy)**2,Iy=w.Iy+c.Ix;
 const topI=w.tf*w.bf**3/12+c.Ix,bottomI=w.tf*w.bf**3/12;
 const topArea=w.bf*w.tf+c.A,topY=(w.bf*w.tf*(w.d-w.tf/2)+c.A*yc)/topArea,bottomY=w.tf/2;
 return {A:A*inch**2,cy:cy*inch,Ix:Ix*inch**4,Iy:Iy*inch**4,
  Sbottom:Ix/cy*inch**3,Stop:Ix/(w.d+c.tw-cy)*inch**3,Sy:Iy/(Math.max(w.bf,c.d)/2)*inch**3,
  topI:topI*inch**4,bottomI:bottomI*inch**4,topS:topI/(c.d/2)*inch**3,
  topY:topY*inch,bottomY:bottomY*inch,h0:(topY-bottomY)*inch,
  nominalWeight:w.weight+c.weight,channelCy:yc*inch};
}

/** Published research estimates, kept separate from design-resistance properties.
 * Ellifritt/Lue, AISC EJ 35(2), 1998, Eqs.11,12,15. Published area ratio range
 * 0.2 <= Ac/Aw <= 0.95, CMAA A/B/C only. These are approximate elastic inputs,
 * not a solution for rail-head torque, shear center, stress recovery or welds.
 */
export function cappedTorsionResearch(s:Section){
 if(!matchesCappedSection(s)||s.capWidth<s.bf+2*s.capTf||s.capDepth>=s.d)return null;
 const w=aiscShapeByName(s.catalogueId!)!,c=aiscChannelByName(s.capCatalogueId!)!,ratio=c.A/w.A;
 if(ratio<.2||ratio>.95)return null;
 const Iy=w.Iy+c.Ix,R=(w.Iy/2+c.Ix)/Iy;
 // Eq.18 repeats R inconsistently with Eq.11. Use Eq.11, which also has
 // the zero-monosymmetry limit for equal flange lateral inertias.
 return {areaRatio:ratio,Cw:w.Cw*(.79+1.79*Math.sqrt(ratio))*25.4**6,
  J:(w.J+c.J+w.bf*c.tw*w.tf*(c.tw+w.tf))*25.4**4,
  beta:.87*(2*R-1)*(w.d+c.bf/2)*25.4};
}
