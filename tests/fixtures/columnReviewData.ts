import type {ProjectInput} from '../../src/engine/types';
import {designsBracing} from '../../src/engine/newColumnBracing';

/**
 * Supporting-column data that the structural review (group G2) made required for an existing building column:
 * where the crane longitudinal force leaves the column, the frame type, the TR-13 §5.3 frame service data, the site
 * seismic record and the lateral-system evaluation, and the 10-year wind on the braced line. Test projects that
 * assert a fully passing, exportable package supply these fictitious records; without them the package carries the
 * open items (as DEMO-FOCUS-005 does). Mutates and returns `p`.
 */
export function withColumnReviewData<T extends ProjectInput>(p:T):T{
 const c=p.existingColumn;
 if(c?.enabled&&!c.isNew){
  c.longitudinalExit??='girder-strut';c.frame??={type:'braced',source:'Test record: braced frame with roof diaphragm'};
  c.service??={wind10:0,spreadD:0,spreadS:0,roofSnow:20*4.788025898e-5,source:'Test record: frame analysis'};
  c.siteSeismic??={enabled:false,SDS:0,sdc:'A',Ie:1,R:3,liftedLoadSecured:false,friction:.6,source:'Test record: seismic design not required',alteration:{dcrIncrease:0,source:'Test record: lateral system evaluation'}};
 }
 const b=p.longitudinalBracing;if(b?.enabled&&!designsBracing(p))b.wind10??=0;
 return p;
}
