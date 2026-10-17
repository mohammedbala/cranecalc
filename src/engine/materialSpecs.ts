/**
 * ASTM designations for the steels listed in the report and on S-00, from the product form and the specified
 * strengths (AISC 360-16 A3.1 / Manual Table 2-4 preferred specifications). An entered grade (e.g. from mill
 * certificates) is used as given. Tube at 50 ksi is ASTM A1085, which has Fy = 50 ksi for round and rectangular
 * sections alike (A500 Gr. C round is 46 ksi).
 */
export type ProductForm='w-shape'|'channel'|'angle'|'plate'|'rod'|'rail'|'tube';
const ksi=(mpa:number)=>mpa/6.894757293168;
const near=(v:number,t:number)=>Math.abs(v-t)<=1;
export function astmSpec(form:ProductForm,Fy:number,Fu?:number,entered?:string):string{
 const g=entered?.match(/ASTM\s+[A-Z]\d+[^,;.]*/i)?.[0];if(g)return g.trim().replace(/^astm/i,'ASTM');
 const fy=ksi(Fy),fu=Fu!==undefined?ksi(Fu):undefined;
 if(form==='rail')return 'ASTM A759';
 if(form==='tube')return near(fy,50)?'ASTM A1085':near(fy,46)?'ASTM A500 Gr. C (round 46 ksi)':`ASTM A500 Gr. C (Fy ${fy.toFixed(0)} ksi)`;
 if(form==='rod'){
  if(near(fy,36))return 'ASTM A36';if(near(fy,55))return 'ASTM F1554 Gr. 55';if(near(fy,105))return 'ASTM F1554 Gr. 105';
  return near(fy,50)?'ASTM A572 Gr. 50':`ASTM A36 or as specified (Fy ${fy.toFixed(0)} ksi)`;
 }
 if(near(fy,36))return 'ASTM A36';
 if(form==='w-shape'&&near(fy,50)&&(fu===undefined||near(fu,65)))return 'ASTM A992';
 if(near(fy,50))return 'ASTM A572 Gr. 50';
 if(near(fy,42))return 'ASTM A572 Gr. 42';
 if(near(fy,55))return 'ASTM A572 Gr. 55';
 if(near(fy,60))return 'ASTM A572 Gr. 60';
 if(near(fy,65))return 'ASTM A572 Gr. 65';
 return `ASTM A572 (Fy ${fy.toFixed(0)} ksi)`;
}
/**
 * Bolt sleeves (sliding bearings, column-end tie releases, cap tieback slots): thick-walled small sleeves exist in no
 * structural tube specification (ASTM A1085 and A500 list HSS sizes only), so they are machined from cold-finished bar
 * to the OD, bore and length on the details, with the yield strength the sleeve checks use certified by the mill test
 * report (ASTM A108 lists no mechanical properties of its own).
 */
export const sleeveSpec='Machined from ASTM A108 cold-finished carbon steel bar (Grade 1018 or 1045) to the OD, bore and length detailed';
/** Hardware that has no strength input: bolts, nuts, washers. */
/** AISC 360-16 Table J3.2 names the bolt groups Group A (A325) and Group B (A490). */
export const boltSpec=(grade:string|undefined)=>grade==='A490'?'ASTM F3125 Gr. A490 (Group B)':'ASTM F3125 Gr. A325 (Group A)';
export const nutWasherSpec='ASTM A563 Gr. DH heavy hex nuts; ASTM F436 hardened washers';
