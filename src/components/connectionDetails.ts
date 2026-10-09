import * as THREE from 'three';
import {filletWeld,stiffenerWelds} from './weldGeometry';
import { buildFastenerPieces } from './fastenerGeometry';
import { bearingStiffenerGeometry } from './bearingStiffenerGeometry';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Representative detailing in meters. Hardware proportions, clearances, and layouts
// are visualization templates; they are not a checked connection or shop drawing.
export interface Hole { x: number; z: number; diameter: number; slotLength?:number; slotAxis?:'x'|'z' }
export interface PartInfo { id: string; family: string; description: string; diameter?: number; grip?: number; components?: string; support?: { x: number; z: number }; anchor?: boolean; threadPitch?: number; weld?: {kind:string;size?:number;length:number;location?:'field'|'shop';existingSteel?:boolean} }
export const referenceBoltDiameter = .01905;

export function horizontalPlateGeometry(length: number, width: number, thickness: number, holes: Hole[] = []) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, -width / 2); shape.lineTo(length / 2, -width / 2);
  shape.lineTo(length / 2, width / 2); shape.lineTo(-length / 2, width / 2); shape.closePath();
  for (const h of holes) {
    const hole = new THREE.Path(),r=h.diameter/2,half=Math.max(0,((h.slotLength??h.diameter)-h.diameter)/2);
    if(half>0&&h.slotAxis!=='z'){hole.absarc(h.x-half,-h.z,r,Math.PI/2,Math.PI*1.5,false);hole.absarc(h.x+half,-h.z,r,-Math.PI/2,Math.PI/2,false);hole.closePath();}
    else if(half>0){hole.absarc(h.x,-h.z-half,r,Math.PI,Math.PI*2,false);hole.absarc(h.x,-h.z+half,r,0,Math.PI,false);hole.closePath();}
    else hole.absarc(h.x,-h.z,r,0,Math.PI*2,true);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -thickness / 2, 0);
  geometry.userData.plateHoles=holes.map(h=>({...h}));geometry.userData.plateThickness=thickness;
  return geometry;
}

export function holeRimGeometry(holes:Hole[],thickness:number){
 const points:number[]=[];
 for(const h of holes)for(const side of [-1,1])for(let i=0;i<32;i++){
  for(const step of [i,i+1]){const angle=step*Math.PI/16,half=Math.max(0,((h.slotLength??h.diameter)-h.diameter)/2);points.push(h.x+Math.cos(angle)*h.diameter/2+(h.slotAxis!=='z'?Math.sign(Math.cos(angle))*half:0),side*(thickness/2+.0003),h.z+Math.sin(angle)*h.diameter/2+(h.slotAxis==='z'?Math.sign(Math.sin(angle))*half:0));}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));return geometry;
}

export function createHardwareBuilder(material: THREE.Material) {
  const cache = new Map<string, THREE.BufferGeometry>();
  let count = 0;
  const geometry = (diameter: number, grip: number, anchor: boolean, embed: number) => {
    const key = `${diameter}/${grip}/${anchor}/${embed}`, existing = cache.get(key); if (existing) return existing;
    const pieces=buildFastenerPieces(diameter,grip,anchor,embed),parts=pieces.map(p=>p.geometry),converted=parts.map(p=>p.index?p.toNonIndexed():p);
    const merged=mergeGeometries(converted)!;
    merged.userData.components=[...new Set(pieces.map(p=>p.kind))];
    for(const p of new Set([...parts,...converted]))p.dispose();cache.set(key,merged);return merged;
  };
  const bolt = (parent: THREE.Group, info: Omit<PartInfo, 'components'>, position: THREE.Vector3, axis = new THREE.Vector3(0, 1, 0), anchor = false, embed = .16) => {
    const diameter = info.diameter ?? referenceBoltDiameter, grip = info.grip ?? .0254;
    const mesh = new THREE.Mesh(geometry(diameter, grip, anchor, embed), material); mesh.name = info.id;
    mesh.userData.part = { ...info, diameter, grip, anchor, threadPitch:diameter/8, components: anchor ? 'Anchor rod · hex nut · washer · helical threads' : 'Shank · hex head · hex nut · two washers · helical threads' } satisfies PartInfo;
    mesh.position.copy(position); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()); parent.add(mesh); count++; return mesh;
  };
  return { bolt, get count() { return count; } };
}
export type HardwareBuilder = ReturnType<typeof createHardwareBuilder>;

interface RunwayDetailsOptions {
  supports: number[]; length: number; depth: number; width: number; flangeT: number; webT: number;
  railBase: number; railZ: number; railBearingWidth: number; railBearingT: number;
  weldedKeeper?:{width:number;thickness:number;projection:number;weld:number;baseWidth:number;baseThickness:number;spacing:number};
  omitStiffeners?:boolean;
  keeperStations?:number[];
  bearingStiffener?:{width:number;thickness:number;cope:number;weld?:number;topCjp?:boolean};
  hardware: HardwareBuilder; plate: THREE.Material; weld: THREE.Material; edge: THREE.LineBasicMaterial;
}
export function buildRunwayDetails(o: RunwayDetailsOptions) {
  const group = new THREE.Group(); group.name = 'runway-connection-details';
  const railHoles: Hole[] = [], clipLocations: number[] = [];
  const box = (name: string, l: number, h: number, w: number, x: number, y: number, z: number, mat = o.plate) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), mat); mesh.name = name; mesh.position.set(x, y, z); group.add(mesh);
    if (mat === o.plate) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), o.edge)); return mesh;
  };
  // Pair of bearing stiffeners inside each supported girder end.
  (o.omitStiffeners?[]:o.supports).forEach((support, i) => {
    const directions = i === 0 ? [1] : i === o.supports.length - 1 ? [-1] : [-1, 1];
    const stiffenerW=o.bearingStiffener?.width??Math.max(.002,(o.width-o.webT)/2-.008),h=Math.max(.004,o.depth-2*o.flangeT);
    const thickness=o.bearingStiffener?.thickness??.012,cope=o.bearingStiffener?.cope??Math.min(.02,stiffenerW/3,h/4);
    for (const dir of directions) for (const side of [-1, 1]) {
      const x = support + dir * Math.min(.075, (o.supports[i + (dir > 0 ? 1 : -1)] - support) * dir / 4);
      const mesh=new THREE.Mesh(bearingStiffenerGeometry(stiffenerW,h,thickness,cope,side),o.plate);
      mesh.name=`bearing-stiffener-S${i+1}-${dir}-${side}`;mesh.position.set(x,0,side*o.webT/2);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),o.edge));group.add(mesh);
      mesh.userData.part = { id: mesh.name, family: 'Girder bearing stiffener', description: 'Full-depth fitted plate pair; web-side corners coped for fillet clearance. Weld beads shown schematically.' } satisfies PartInfo;
      if(side===1)stiffenerWelds(group,`stiffener-S${i+1}-${dir}`,x,o.depth,o.flangeT,o.webT,stiffenerW,thickness,cope,o.bearingStiffener?.weld??.004,!!o.bearingStiffener?.topCjp,o.weld,{x:support,z:0});
    }
  });
  // The checked capped template uses welded sliding keepers. Do not show bolts
  // or holes penetrating a channel that the design requires to be unperforated.
  if(o.weldedKeeper){
    const k=o.weldedKeeper,stations=Math.max(1,Math.min(80,Math.ceil(o.length/k.spacing)));
    const locations=o.keeperStations??Array.from({length:stations+1},(_,i)=>-o.length/2+i*o.length/stations);
    for(const [i,x] of locations.entries()){
      clipLocations.push(x);
      for(const side of [-1,1]){
        const root=o.railZ+side*(k.baseWidth/2+k.projection/2),height=k.baseThickness+k.thickness;
        const keeper=box(`rail-clip-${i+1}-${side}`,k.width,height,k.thickness,x,o.railBase+height/2,root+side*k.thickness/2);
        keeper.userData.part={id:keeper.name,family:'Welded rail keeper',description:'Integral sliding keeper; channel remains unperforated. Entered keeper dimensions and continuous root fillets. This generic keeper is not a proprietary rail-clip product.'} satisfies PartInfo;
        box(`rail-keeper-toe-${i+1}-${side}`,k.width,k.thickness,k.projection,x,o.railBase+k.baseThickness+k.thickness/2,root-side*k.projection/2);
        for(const edge of [0,1])filletWeld(group,`rail-keeper-weld-${i+1}-${side}-${edge}`,new THREE.Vector3(x-k.width/2,o.railBase,root+side*edge*k.thickness),new THREE.Vector3(x+k.width/2,o.railBase,root+side*edge*k.thickness),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,side*(edge?1:-1)),k.weld,o.weld,'Continuous rail-keeper root fillet; entered leg and keeper width. Rail itself is not welded to the cap.');
      }
    }
    return {group,railHoles,clipLocations};
  }
  // Clamps are omitted when there is no flange room beside the schematic rail foot.
  const available = o.railBearingWidth / 2 - Math.abs(o.railZ);
  // Clamp base outer edge is 109 mm from rail center; keep 5 mm clear.
  if (available >= .114) {
    const stations = Math.max(1, Math.min(80, Math.ceil(o.length / .6))), diameter = referenceBoltDiameter;
    for (let i = 0; i < stations; i++) {
      const x = -o.length / 2 + (i + .5) * o.length / stations; clipLocations.push(x);
      for (const side of [-1, 1]) {
        const z = o.railZ + side * .084, hole = { x: 0, z: side * .005, diameter: diameter + .003 };
        const base = new THREE.Mesh(horizontalPlateGeometry(.09, .06, .012, [hole]), o.plate);
        base.name = `rail-clip-${i + 1}-${side}`; base.position.set(x, o.railBase + .006, o.railZ + side * .079); group.add(base);
        base.add(new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), o.edge));
        base.userData.part = { id: base.name, family: 'Rail clip', description: 'Bolted stepped clamp over the schematic rail foot; representative spacing.' } satisfies PartInfo;
        box(`rail-clip-toe-${i + 1}-${side}`, .09, .006, .034, x, o.railBase + .015, o.railZ + side * .045);
        o.hardware.bolt(group, { id: `RC-${i + 1}-${side > 0 ? 'R' : 'L'}`, family: 'Rail clip bolt', description: 'Clamp-to-girder attachment', diameter, grip: o.railBearingT + .012 }, new THREE.Vector3(x, o.railBase - o.railBearingT, z));
        railHoles.push({ x, z, diameter: diameter + .003 });
      }
    }
  }
  return { group, railHoles, clipLocations };
}
