import {cappedDemonstrationProject,newColumnDemonstrationProject} from '../../src/engine/demonstration';
import {selectBracketArrangement} from '../../src/engine/connectionOptions';
import type {ProjectInput} from '../../src/engine/types';

const inch=25.4,ksi=6.894757293168;
/** AISC W14X90: d 14.0 in, bf 14.5 in, tf 0.71 in, tw 0.44 in. */
const W14X90={depth:14*inch,width:14.5*inch,flangeThickness:.71*inch,webThickness:.44*inch};
/** The bracket's receiving column set to the W14X90 plates; the demonstrations' existing column is already a W14X90. */
export function onW14X90(p:ProjectInput){
 const b=p.details!.bracket!;
 b.receiver={...b.receiver,...W14X90,axialDemand:0,source:'Fictitious survey: existing W14X90 column (d 14.0 in, bf 14.5 in, tf 0.71 in, tw 0.44 in), ASTM A992; 10 ft unbraced; zero other axial loads for local-component demonstration.'};
 // Unstiffened unless a case adds its plates (the capped demonstration carries its own).
 delete b.columnStiffeners;
 p.existingColumn!.shape='W14X90';
 return p;
}
/** Half-depth stiffeners on a W14X90: 6 3/4 in plates, 1/4 in inside the flange tips, 3/4 in clips clear of the 0.60 in fillet. */
const plates=(thickness:number,weld:number)=>({enabled:true,thickness,width:6.75*inch,length:'half' as const,clip:.75*inch,flangeWeld:weld,webWeld:weld});
/**
 * The primary case: the capped 2-ton demonstration with its welded twin-rib bracket on a W14X90 receiving column.
 * Unstiffened, J10.1 local bending of the flange at the ribs fails (1.498); with 1 in stiffener pairs at the seat and
 * the rib bottom (t >= seat thickness / 2), 5/16 in fillets, every check passes.
 */
export function cappedTwinRibW14X90(stiffened:boolean){
 const p=onW14X90(cappedDemonstrationProject());
 if(stiffened)p.details!.bracket!.columnStiffeners=plates(inch,5/16*inch);
 return p;
}
/**
 * The capped demonstration with a W12X58 stub on an older ASTM A36 W14X90 (Fy 36 ksi): J10.1 under the stub's tension
 * flange fails unstiffened; full-depth 3/4 in pairs at the stub flanges with 7/16 in fillets (throat fatigue; the full
 * depth for the column web shear along them under the ASCE 7 crane-as-live combinations) pass.
 */
export function cappedStubW14X90(stiffened:boolean){
 const p=onW14X90(cappedDemonstrationProject());
 const r=p.details!.bracket!.receiver;p.details!.bracket!.receiver={...r,Fy:36*ksi,Fu:58*ksi,source:r.source.replace('ASTM A992','ASTM A36 (older building, mill certificates)')};
 p.existingColumn={...p.existingColumn!,Fy:36*ksi,Fu:58*ksi};
 p.details=selectBracketArrangement(p.details!,'rolled-corbel');
 const b=p.details.bracket!;b.corbelShape='W12X58';b.seatThickness=1.5*inch;b.seatWeld=.375*inch;
 b.rolled={...b.rolled!,flangeJoint:'cjp',flangeWeld:.3125*inch,webWeld:.3125*inch,stiffenerThickness:.5*inch,stiffenerWeld:.25*inch,seatPlate:true};
 p.details.endBearing!.bolts.edge=2.125*inch;p.details.brace.release!.travel=.1875*inch;
 if(stiffened)b.columnStiffeners={...plates(.75*inch,7/16*inch),length:'full'};
 return p;
}
/**
 * New freestanding W14X90 runway columns (the demonstration uses W14X120). The columns cantilever along the runway:
 * designed rod bracing would put its gusset on the column web at the seat, where the stiffeners go.
 */
export function newW14X90Columns(stiffened:boolean){
 const p=newColumnDemonstrationProject();p.existingColumn!.shape='W14X90';
 const b=p.details!.bracket!;b.receiver={...b.receiver,...W14X90,source:'New W14X90 column designed here; no other loads'};
 if(stiffened){p.longitudinalBracing!.enabled=false;p.existingColumn!.longitudinal='column';b.columnStiffeners=plates(inch,5/16*inch);}
 return p;
}
