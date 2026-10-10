import { loadAiscSection, defaultAiscShape, sectionPropertyKeys } from '../data/aiscSections';
import type { ProjectInput } from './types';
export const exampleProject:ProjectInput = {
 schemaVersion:1,title:'North bay · Crane runway',number:'CR-001',engineer:'',units:'US',method:'LRFD',scope:'design',system:'simple',spans:[7620],
 section:loadAiscSection({kind:'welded',name:'Welded I · 24 × 10',d:609.6,bf:254,tf:19.05,tw:12.7,capWidth:300,capDepth:100,capTf:12,capTw:12,Fy:50*6.894757293168,Fu:65*6.894757293168,E:29000*6.894757293168,density:7850,Ix:0.0001,Iy:0.0001,A:0.0001,Sx:0.0001,Sy:0.0001,Zx:0.0001,Zy:0.0001,J:0.0001,Cw:0.0001,propertySource:''},defaultAiscShape),
 cranes:[{id:'crane-1',name:'Bridge crane 01',wheels:[{offset:0,loaded:110000,unloaded:42000,lateral:8000},{offset:3657.6,loaded:110000,unloaded:42000,lateral:8000}],impact:0.25,includesImpact:false,longitudinal:22000,minSeparation:1500,travelStart:0,travelEnd:7620,operatingClass:'Owner to confirm',loadSource:'Illustrative manufacturer schedule; replace before design'}],
 deadLoad:0,railWeight:0.3,railEccentricity:0,railHeight:75,unbracedLength:7620,lateralBraceSpacing:7620,verticalLimit:600,lateralLimit:400,criteriaSource:'User-defined serviceability criteria; confirm with crane supplier',
 fatigue:{category:'C',cycles:2000000,detail:'Select and document actual welded detail',location:3810},
 connections:{enabled:true,bolts:4,boltDiameter:19.05,plateThickness:12.7,edgeDistance:38.1,boltPitch:76.2,weldSize:6,weldLength:150,stiffenerThickness:12,stiffenerWidth:100,braceArea:600,braceLength:3000,braceRadius:20,Fexx:490},notes:'Example inputs only. Replace with project-specific crane and restraint data.'
};

// Upgrade only the old illustrative section, preserving project loads, material,
// criteria and all customized section geometry when reopening existing storage.
export function migrateExampleSection(project:ProjectInput):ProjectInput {
 const s=project.section;
 if(s.kind==='welded'&&s.name==='Welded I · 24 × 10'&&s.d===609.6&&s.bf===254&&s.tf===19.05&&s.tw===12.7&&!s.propertySource&&sectionPropertyKeys.every(key=>s[key]===.0001))
  return {...project,section:loadAiscSection(s,defaultAiscShape)};
 return project;
}
