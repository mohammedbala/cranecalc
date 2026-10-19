import {describe,expect,it} from 'vitest';
import {acquirable,allSnapModes,objectSnap,resolveSnap,tangentPoints,trackPoint,type SnapSettings} from '../src/cad/snap';
import {expandGroups,fenceSelect,quickSelect,selectSimilar} from '../src/cad/select';
import type {Ent,Pt} from '../src/cad/model';
import {blank,near,setup} from './cadHarness';

const doc={display:'US' as const,realPerUnit:25.4};
const line=(id:number,a:Pt,b:Pt,extra:Partial<Ent>={}):Ent=>({id,type:'line',layer:'0',a,b,...extra} as Ent);
const modes=new Set(allSnapModes);
const settings=(o:Partial<SnapSettings>={}):SnapSettings=>({osnap:true,modes,ortho:false,polar:false,polarAngle:45,otrack:false,grid:null,...o});

describe('CAD object snaps',()=>{
 it('snaps to endpoints before nearest, and to intersections of arcs and lines',()=>{
  const l=line(1,[0,0],[10,0]),c:Ent={id:2,type:'circle',layer:'0',center:[5,0],radius:2};
  expect(objectSnap([.05,.02],[l],doc,.2,modes)).toMatchObject({kind:'end',p:[0,0]});
  expect(objectSnap([4,.05],[l],doc,.2,modes)).toMatchObject({kind:'nea'});
  const x=objectSnap([3.05,.05],[l,c],doc,.2,modes)!;expect(x.kind).toBe('int');near(x.p,[3,0]);
 });
 it('tangent and perpendicular from the base point',()=>{
  const c:Ent={id:1,type:'circle',layer:'0',center:[0,0],radius:1};
  const t=tangentPoints([2,0],[0,0],1);expect(t).toHaveLength(2);near(t[0],[.5,Math.sqrt(3)/2],1e-12);
  expect(objectSnap([.52,.86],[c],doc,.1,new Set(['tan']),[2,0])).toMatchObject({kind:'tan'});
  expect(objectSnap([3,.05],[line(2,[0,0],[10,0])],doc,.2,new Set(['per']),[3,5])).toMatchObject({kind:'per',p:[3,0]});
 });
 it('apparent intersection of lines that do not meet, extension and parallel from acquired lines',()=>{
  const a=line(1,[0,0],[4,0]),b=line(2,[6,-3],[6,-1]);
  const app=objectSnap([6.05,.05],[a,b],doc,.3,new Set(['app']))!;expect(app.kind).toBe('app');near(app.p,[6,0]);
  const ext=objectSnap([7,.05],[a],doc,.2,new Set(['ext']),undefined,[{p:[4,0],dir:[1,0]}])!;expect(ext.kind).toBe('ext');near(ext.p,[7,0]);
  const par=objectSnap([3,5.05],[],doc,.2,new Set(['par']),[0,5],[{p:[4,0],dir:[1,0]}])!;expect(par.kind).toBe('par');near(par.p,[3,5]);
 });
 it('node snaps to spline fit points; acquirable gives a line end with its direction',()=>{
  const l=line(1,[0,0],[0,5]);
  expect(acquirable([.03,4.98],[l],doc,.2)).toMatchObject({p:[0,5],dir:[0,1]});
 });
});

describe('CAD polar and object snap tracking',()=>{
 it('polar tracking holds the cursor on the polar angle from the base point',()=>{
  const r=resolveSnap([5,5.1],[],doc,.3,settings({polar:true}),[0,0]);near(r.p,[5.05,5.05],1e-9);expect(r.tip).toContain('45');
  const off=resolveSnap([5,6],[],doc,.3,settings({polar:true}),[0,0]);near(off.p,[5,6]);
 });
 it('object snap tracking: paths from acquired points and their intersection',()=>{
  const s=settings({otrack:true});
  const one=trackPoint([3,5.1],.3,s,undefined,[{p:[0,5]}])!;near(one.p,[3,5]);
  const two=trackPoint([3.1,5.1],.3,s,undefined,[{p:[0,5]},{p:[3,0]}])!;near(two.p,[3,5]);expect(two.tip).toMatch(/Intersection/);
 });
 it('falls back to grid snap and ortho',()=>{
  near(resolveSnap([1.12,2.37],[],doc,.01,settings({osnap:false,grid:.25})).p,[1,2.25]);
  near(resolveSnap([5,1],[],doc,.01,settings({osnap:false,ortho:true}),[0,0]).p,[5,0]);
 });
});

describe('CAD selection: fence, quick select, similar and groups',()=>{
 const ents:Ent[]=[line(1,[0,0],[10,0]),line(2,[0,5],[10,5],{layer:'A',color:1}),{id:3,type:'circle',layer:'A',center:[5,10],radius:1},line(4,[0,8],[2,8],{layer:'A',color:1})];
 it('fence picks what the fence line crosses',()=>{
  expect(fenceSelect(ents,[[5,-1],[5,6]],doc)).toEqual([1,2]);
  expect(fenceSelect(ents,[[3,9],[7,11]],doc)).toEqual([3]);
 });
 it('quick select by type and property, and exclusion',()=>{
  expect(quickSelect(ents,{type:'*',prop:'layer',op:'=',value:'A'})).toEqual([2,3,4]);
  expect(quickSelect(ents,{type:'line',prop:'color',op:'=',value:'ByLayer'})).toEqual([1]);
  expect(quickSelect(ents,{type:'line',prop:'color',op:'<>',value:'1'})).toEqual([1]);
  expect(quickSelect(ents,{type:'circle',prop:'none',op:'*',exclude:true})).toEqual([1,2,4]);
 });
 it('select similar matches type, layer and properties',()=>{
  expect(selectSimilar(ents,[ents[1]])).toEqual([2,4]);
 });
 it('GROUP, picking a member selects the group, UNGROUP',()=>{
  const {store,run,add}=setup(blank());
  const ids=add({type:'line',layer:'0',a:[0,0],b:[1,0]},{type:'line',layer:'0',a:[0,1],b:[1,1]},{type:'line',layer:'0',a:[0,2],b:[1,2]});
  store.select(ids.slice(0,2));run('GROUP','BRACKET');
  expect(store.doc.groups).toEqual([{name:'BRACKET',ids:ids.slice(0,2)}]);
  expect(expandGroups(store.doc,[ids[1]]).sort()).toEqual(ids.slice(0,2));
  store.select([ids[2],ids[0]]);run('GROUP','');expect(store.doc.groups?.[1].name).toBe('*A1');
  store.undo();expect(store.doc.groups).toHaveLength(1);
  store.select([ids[0]]);run('UNGROUP');expect(store.doc.groups).toEqual([]);
 });
});
