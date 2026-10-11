import type {CheckResult} from './types';

/**
 * Bolting basis for runway connections. AIST TR-13 §5.14: bolted structural connections of the runway use
 * pretensioned high-strength bolts, slip-critical where the loading is cyclic. AISC 360-16 J3.1 defers the
 * pretensioning requirement to the RCSC Specification (2014 §4.2 pretensioned joints: fatigue without reversal,
 * significant load reversal; §4.3 slip-critical joints: fatigue with reversal). The former AISC 360-10 J1.10 list
 * (crane supports in buildings with cranes over 5 tons; live loads producing impact or reversal) is not in AISC
 * 360-16 (AISC Modern Steel Construction, Steel Interchange, June 2020), so no crane-capacity exemption applies.
 */
export const runwayBoltingBasis='AIST TR-13 §5.14: runway bolted connections are pretensioned high-strength bolts, slip-critical where the loading is cyclic (RCSC Specification 2014 §4.2–§4.3, as referenced by AISC 360-16 J3.1). AISC 360-16 has no crane-capacity exemption (the AISC 360-10 J1.10 list was removed).';

/** Snug-tight bolts selected at a runway connection: not permitted, an open item until pretensioned bolts are selected. */
export function snugTightNotPermitted(id:string,title:string,group:string,what:string):CheckResult{
 return {id,group,title,status:'fail',equation:'\\text{snug-tight}\\ \\Rightarrow\\ \\text{not permitted}',referenceIds:['tr13-bolting','rcsc-joints','aisc-connections'],
  note:`OPEN ITEM: the ${what} are entered as snug-tight. ${runwayBoltingBasis} Select bolts pretensioned against steel sleeves so the slotted ply still slides.`};
}
