import {describe,it,expect} from 'vitest';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {loadCappedSection} from '../src/data/aiscChannels';
import {connectionSheetSvg} from '../src/components/connectionSheet';
import {simpleSupportSheetSvg} from '../src/components/simpleSupportSheet';
import {flangeTieSheetSvg} from '../src/components/flangeTieSheet';
import {bracketSheetSvg} from '../src/components/bracketSheet';
import {connectionConceptSheetSvg} from '../src/components/connectionConceptSheet';
import {loadAiscSection,aiscWShapes} from '../src/data/aiscSections';
import {validateProject} from '../src/engine/calculate';
import {defaultFraming} from '../src/components/framingSettings';
import type {CalculationSnapshot} from '../src/engine/types';
import {detailRef} from '../src/components/sheetGraphics';

type Point=[number,number];
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
// Inspect the geometry actually emitted to the drawing, in sheet coordinates: each detail is drawn
// in its own coordinates and translated into its grid cell. Shared branches inside a single callout
// are intentional; intersections between callouts are not.
export function crossingLeaders(svg:string){
 const cells=[...svg.matchAll(/<g data-detail-cell="[^"]*" transform="translate\(([-\d.e]+) ([-\d.e]+)\)">/g)].map(m=>({at:m.index!,dx:+m[1],dy:+m[2]}));
 // A detail's content runs from its cell group to its title, drawn after it at sheet level.
 const offset=(i:number):Point=>{const c=cells.filter(v=>v.at<i).at(-1);return c&&svg.indexOf('<g data-view-title=',c.at)>i?[c.dx,c.dy]:[0,0];};
 const routes=[...svg.matchAll(/<g data-multileader="component">(.*?)<\/g>/gs)].flatMap((g,id)=>{const [dx,dy]=offset(g.index!);
  return [...g[1].matchAll(/data-leader-path="true" points="([^"]+)"/g)].map(m=>({id,points:m[1].split(' ').map(p=>{const [x,y]=p.split(',').map(Number);return [x+dx,y+dy] as Point;})}));});
 const hits:string[]=[];
 for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
  const a=routes[i],b=routes[j];if(a.id===b.id)continue;
  for(let ai=1;ai<a.points.length;ai++)for(let bi=1;bi<b.points.length;bi++){
   const p=a.points[ai-1],q=b.points[bi-1],r=sub(a.points[ai],p),s=sub(b.points[bi],q),den=cross(r,s),qp=sub(q,p);
   if(Math.abs(den)<1e-7){
    if(Math.abs(cross(qp,r))<1e-7 && Math.hypot(...r)>0){
     const axis=Math.abs(r[0])>Math.abs(r[1])?0:1;
     if(Math.max(Math.min(p[axis],a.points[ai][axis]),Math.min(q[axis],b.points[bi][axis]))<=Math.min(Math.max(p[axis],a.points[ai][axis]),Math.max(q[axis],b.points[bi][axis])))hits.push(`${a.id}/${b.id} overlap`);
    }
   }else{
    const t=cross(qp,s)/den,u=cross(qp,r)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)hits.push(`${a.id}/${b.id} crossing`);
   }
  }
 }
 return hits;
}
describe('connection-sheet leader routes',()=>{
 it('keeps leaders separate for every catalogue shape that fits the demonstration connection geometry',()=>{
  let checked=0;
  for(const shape of aiscWShapes){
   const input=demonstrationProject();input.section=loadAiscSection(input.section,shape.name);input.aist!.netFlangeArea=input.section.bf*input.section.tf;
   if(validateProject(input).length)continue;
   const s:CalculationSnapshot={input,revision:'drawing-test',createdAt:'',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''};
   expect(crossingLeaders(connectionSheetSvg(s)),shape.name).toEqual([]);
   expect(crossingLeaders(simpleSupportSheetSvg(s)),shape.name+' independent ends').toEqual([]);checked++;
  }
  for(const name of ['W24X84','W30X99']){
   const input=cappedDemonstrationProject();input.section=loadCappedSection(input.section,name,'C15X33.9');input.aist!.netFlangeArea=input.section.bf*input.section.tf;
   const s:CalculationSnapshot={input,revision:'cap-drawing-test',createdAt:'',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''};
   const svg=connectionSheetSvg(s);expect(svg).toContain(`CAP ATTACHMENT: SEE ${detailRef('CAPPED GIRDER SECTION')}`);
   expect(crossingLeaders(svg),name+' capped').toEqual([]);
   expect(crossingLeaders(flangeTieSheetSvg(s)),name+' flange ties').toEqual([]);
  }
  expect(checked).toBeGreaterThan(20);
 },120000); // Sweeps every catalogue W shape; about 30 s on a 4-core runner.
 it.each(['W24X131','W24X250','W36X150'])('keeps independent callouts apart for %s, both unit systems and reference frame styles',name=>{
  const original:CalculationSnapshot={input:demonstrationProject(),revision:'drawing-test',createdAt:'',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''};
  for(const units of ['US','SI'] as const)for(const frameStyle of ['tapered','rolled'] as const){
   const s=structuredClone(original);s.input.units=units;s.input.section=loadAiscSection(s.input.section,name);s.input.aist!.netFlangeArea=s.input.section.bf*s.input.section.tf;
   const svg=connectionSheetSvg(s,{...defaultFraming,frameStyle});
   expect(svg.match(/data-leader-path/g)!.length).toBeGreaterThan(15);
   expect(crossingLeaders(svg)).toEqual([]);
  }
 });
 it('keeps field-weld leaders separate on existing-column attachments',()=>{
  for(const units of ['US','SI'] as const){
   const input=cappedDemonstrationProject();input.units=units;
   const s:CalculationSnapshot={input,revision:'field-weld-test',createdAt:'',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''};
   expect(crossingLeaders(bracketSheetSvg(s)),units+' bracket').toEqual([]);
   expect(crossingLeaders(flangeTieSheetSvg(s)),units+' tie').toEqual([]);
   for(const bracket of ['haunched-seat','rolled-corbel'] as const)for(const tie of ['paired-bars','flexible-plate','bearing-link','paired-links'] as const){
    input.details!.bracket!.arrangement=bracket;input.details!.brace.arrangement=tie;
    expect(crossingLeaders(connectionConceptSheetSvg(s)),units+' '+bracket+' '+tie).toEqual([]);
   }
  }
 });
 it('detects crossing and overlapping routes, but permits a common branch inside one callout',()=>{
  const route=(points:string)=>`<g data-multileader="component"><polyline data-leader-path="true" points="${points}"/></g>`;
  expect(crossingLeaders(route('0,0 10,10')+route('0,10 10,0'))).toHaveLength(1);
  expect(crossingLeaders(route('0,0 10,0')+route('5,0 15,0'))).toHaveLength(1);
  expect(crossingLeaders('<g data-multileader="component"><polyline data-leader-path="true" points="0,0 10,10"/><polyline data-leader-path="true" points="0,10 10,0"/></g>')).toEqual([]);
 });
});
