/**
 * Sample calculation packages published with the site. Each file is in public/samples and is served next to the app,
 * so the links work on the Pages build, the local build and the dev server alike.
 */
export interface SampleCalc {
 id:string;title:string;project:string;summary:string;contents:string[];
 /** PDF and its cover thumbnail, relative to public/. */
 file:string;cover:string;pages:number;bytes:number;issued:string;
}

export const sampleCalcs:SampleCalc[]=[{
 id:'demo-focus-005',
 title:'New crane runway in an existing building',
 project:'DEMO-FOCUS-005 · 5-ton crane on five 25 ft simple spans · W14X61 + C15X50 capped girders · tapered I haunches welded to the existing W14X90 columns',
 summary:'A 35-page excerpt laid out the way a calculation package is submitted: the cover, the scope with an isometric of the building, the design basis, the load development, the member and connection checks, the forces delivered to the building and six ARCH D drawing sheets.',
 contents:[
  'Crane loads to AIST TR-13 and ASCE 7-16, with a moving-load envelope of every crane position',
  'Capped girder to AISC 360-16 and Design Guide 7: load-height lateral-torsional buckling, torsion and warping',
  'Tapered haunch welded to the existing column: welds, J10 local checks, column stiffeners and fatigue',
  'Existing column check, cap tieback angles and the forces handed to the building engineer',
  'Drawing sheets S-00 to S-04: cover and notes (continued on S-00A), general arrangement, connections, cap tiebacks and end stops',
 ],
 file:'samples/CraneRunway-Sample-Calculation.pdf',cover:'samples/CraneRunway-Sample-Calculation-cover.jpg',
 pages:35,bytes:1645624,issued:'2026-10-19',
}];
