import {aiscShapeByName} from '../data/aiscSections';
import {aiscChannelByName} from '../data/aiscChannels';
import {cappedElasticProperties} from './capChannel';
import {openSection,type Wall,type WallNode} from './openSection';
import type {Section} from './types';

/** Thin-wall sectorial model of a fully bearing, continuously connected cap.
 * In the overlap the flange and channel web form one median-line plate. Vertical
 * zero-area offsets join the plate centrelines; they add no fictitious stiffness.
 * Fillets are omitted. J conservatively omits the positive overlap contribution
 * in Ellifritt/Lue Eq.15. Catalogue transformed properties govern major bending.
 */
export function cappedMechanics(s:Section){
 const elastic=cappedElasticProperties(s);if(!elastic)return null;
 const w=aiscShapeByName(s.catalogueId!)!,c=aiscChannelByName(s.capCatalogueId!)!;
 const nodes:WallNode[]=[{x:0,y:s.tf/2}],walls:Wall[]=[];
 const branch=(from:number,x:number,y:number,t:number,part:Wall['part'])=>{const to=nodes.length;nodes.push({x,y});walls.push({from,to,t,part});return to;};
 for(const sign of [-1,1])branch(0,sign*s.bf/2,s.tf/2,s.tf,'beam');
 const wt=branch(0,0,s.d-s.tf/2,s.tw,'beam');
 const combinedY=s.d+(s.capTw-s.tf)/2,webY=s.d+s.capTw/2;
 const centre=branch(wt,0,combinedY,0,'link');
 for(const sign of [-1,1]){
  const overlap=branch(centre,sign*s.bf/2,combinedY,s.tf+s.capTw,'beam');
  const step=branch(overlap,sign*s.bf/2,webY,0,'link');
  const corner=branch(step,sign*(s.capWidth-s.capTf)/2,webY,s.capTw,'channel');
  branch(corner,sign*(s.capWidth-s.capTf)/2,s.d+s.capTw-s.capDepth,s.capTf,'channel');
 }
 const thin=openSection(nodes,walls);
 // Using the smaller lateral inertia prevents credit for fillets/plate thickness
 // beyond the sectorial idealization. No empirical Cw fit enters design.
 const Iy=Math.min(elastic.Iy,thin.Iy),J=(w.J+c.J)*25.4**4;
 const fibres=nodes.map((n,i)=>({x:n.x,y:n.y-elastic.cy,omega:thin.omega[i]}));
 // Explicit extreme normal-bending fibres; omega is constant through thickness.
 for(const sign of [-1,1]){
  const bot=sign<0?1:2,outer=sign<0?7:11,tip=sign<0?8:12;
  fibres.push({x:sign*s.bf/2,y:-elastic.cy,omega:thin.omega[bot]});
  fibres.push({x:sign*s.capWidth/2,y:s.d+s.capTw-elastic.cy,omega:thin.omega[outer]});
  fibres.push({x:sign*s.capWidth/2,y:s.d+s.capTw-s.capDepth-elastic.cy,omega:thin.omega[tip]});
 }
 const topOffset=s.d-s.tf/2-thin.shearCenter,bottomOffset=s.tf/2-thin.shearCenter;
 // Bound a channel-half sectorial first moment without assuming cancellation
 // across the overlap: |integral omega dA| <= Ac/2 * max|omega|.
 const omegaMax=Math.max(...thin.omega.map(Math.abs));
 return {...elastic,...thin,Iy,J,elastic,topOffset,bottomOffset,
  centroidOffset:elastic.cy-thin.shearCenter,
  polarRadiusSquared:(elastic.Ix+elastic.Iy)/elastic.A+(elastic.cy-thin.shearCenter)**2,
  fibres,omegaMax,channelHalfWarpBound:c.A*25.4**2/2*omegaMax,
  channelHalfFirstMoment:c.Zx*25.4**3/2,
  channelQ:c.A*25.4**2*Math.abs(elastic.channelCy-elastic.cy),
  maxThickness:Math.max(s.tf+s.capTw,s.capTf,s.tw)};
}
