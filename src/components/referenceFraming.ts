import {isExistingBracketType,existingBracketProfile} from '../engine/bracketProfiles';
import type {BracketInput} from '../engine/bracketInputs';
import {bracketModelDepth} from '../engine/connectionOptions';
import {buildWeldedBrackets} from './weldedBracketGeometry';
import * as THREE from 'three';
import { shapeMeters, type ReferenceShape } from '../data/aiscReferenceShapes';
import { horizontalPlateGeometry, referenceBoltDiameter, type HardwareBuilder, type Hole, type PartInfo } from './connectionDetails';
import { columnProfile, portalDimensions, profileUpper, taperedISection, type FrameStyle } from './metalBuildingGeometry';

interface FramingMaterials { column: THREE.Material; beam: THREE.Material; plate: THREE.Material; foundation: THREE.Material; weld?:THREE.Material; edge: THREE.LineBasicMaterial }
interface FramingOptions {
  supports: number[]; girderDepth: number; girderWidth: number; girderFlangeT?: number;
  columnHeight: number; roofBottom?: number; column: ReferenceShape; crosshead: ReferenceShape; frameStyle?:FrameStyle;
  materials: FramingMaterials; hardware?: HardwareBuilder;
  bracket?:BracketInput;
  columnConnectionHoles?:{station:number;x:number;y:number;diameter:number}[];
  continuousBearing?:{width:number;length:number;thickness:number};
  independentBearing?: {thickness:number;seatLength:number};
}

// One continuous building column per station, with an inward-facing runway
// bracket. The opposite row is mirrored, so both brackets face into the bay.
// These are illustrative connections, not a stiffness or connection design.
export function buildReferenceFraming({ supports, girderDepth, girderWidth, girderFlangeT = .01905, columnHeight, roofBottom = girderDepth / 2 + 2.5, column, crosshead, materials, hardware, frameStyle='rolled',independentBearing,bracket,continuousBearing,columnConnectionHoles=[] }: FramingOptions) {
  bracket=bracket?.enabled?bracket:undefined;
  if(bracket){const r=bracket.receiver;column={name:'Entered receiver I-section',row:0,d:r.depth/25.4,bf:r.width/25.4,tf:r.flangeThickness/25.4,tw:r.webThickness/25.4};}
  const group = new THREE.Group(); group.name = 'reference-support-framing';
  const c = shapeMeters(column), b = shapeMeters(crosshead), plateT = .0254, padH = .2;
  const seatTop = -girderDepth / 2-(independentBearing?.thickness??continuousBearing?.thickness??0), beamTop = seatTop - (bracket?bracket.seatThickness/1000:plateT), beamBottom = beamTop - (bracket?bracketModelDepth(bracket)/1000:b.d);
  const columnBottom = beamBottom - plateT - columnHeight, columnTop = frameStyle==='tapered'?roofBottom+portalDimensions.kneeDepth:roofBottom-plateT, floor = columnBottom - plateT - padH;
  const columnMid=(columnBottom+columnTop)/2,profile=columnProfile(columnTop-columnBottom,beamTop-columnMid,c.d);
  if(bracket){const a=beamBottom-columnMid-.05,z=beamTop-columnMid+.05+(isExistingBracketType(bracket.arrangement)?existingBracketProfile(bracket).continuityAbove/1000:0);profile.splice(1,1,{s:a,lower:-c.d/2,upper:c.d/2},{s:z,lower:-c.d/2,upper:c.d/2});}
  const columnOffset = (bracket?bracket.reach/1000+c.d/2:Math.max(.9, girderWidth / 2 + c.d / 2 + .35)), columnFace = columnOffset - c.d / 2;
  const seatWidth = Math.max(girderWidth + .24, .42), bracketStart = bracket?columnFace-bracket.seatProjection/1000:-seatWidth / 2 - .07, bracketEnd = columnFace - (bracket?0:plateT);
  const capLength = bracketEnd - bracketStart, bracketMid = (bracketStart + bracketEnd) / 2;
  const baseX = c.bf + .24, baseZ = c.d + .24, endPlateWidth = Math.max(b.bf + .12, .24);
  const endPlateTop = beamTop + .11, endPlateBottom = beamBottom - .5, endPlateMid = (endPlateTop + endPlateBottom) / 2;
  const girderBoltHoles: Hole[] = [];
  const outlined = (mesh: THREE.Mesh, name: string, family?: string, support?: { x:number; z:number }) => {
    mesh.name = name; mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), materials.edge));
    if (family) mesh.userData.part = { id:name, family, description:`Representative ${family.toLowerCase()}; connection adequacy not evaluated.`, support } satisfies PartInfo;
    return mesh;
  };
  const box = (parent: THREE.Group, name: string, l: number, h: number, w: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = outlined(new THREE.Mesh(new THREE.BoxGeometry(l,h,w),material),name); mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  };
  const plate = (name: string, l: number, t: number, w: number, x: number, y: number, z: number, holes: Hole[], family: string) => {
    const mesh = outlined(new THREE.Mesh(horizontalPlateGeometry(l,w,t,holes),materials.plate),name,family,{x,z});mesh.position.set(x,y,z);group.add(mesh);return mesh;
  };
  const wMember = (name: string, shape: ReferenceShape, length: number, position: THREE.Vector3, columnAxis: boolean, material: THREE.Material, topHoles: Hole[] = [], bottomHoles: Hole[] = []) => {
    const member = new THREE.Group();member.name = name;member.userData.aiscShape = shape.name;
    const p = shapeMeters(shape);
    for (const [suffix,y,holes] of [['top-flange',(p.d-p.tf)/2,topHoles],['bottom-flange',-(p.d-p.tf)/2,bottomHoles]] as const) {
      const mesh = outlined(new THREE.Mesh(horizontalPlateGeometry(length,p.bf,p.tf,[...holes]),material),suffix);mesh.position.y=y;member.add(mesh);
    }
    box(member,'web',length,p.d-2*p.tf,p.tw,0,0,0,material);
    if (columnAxis) member.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));
    else member.rotation.y=-Math.PI/2;
    member.position.copy(position);group.add(member);
    for(const mesh of member.children)mesh.userData.part={id:`${name}-${mesh.name}`,family:columnAxis?'Building column':'Runway bracket beam',description:`${shape.name} · AISC nominal geometry; rolled fillets omitted.`,support:{x:position.x,z:columnAxis?columnOffset:0}} satisfies PartInfo;
  };
  supports.forEach((x,i) => {
    const seatHoles: Hole[] = [], baseHoles: Hole[] = [], topHoles: Hole[] = [], endHoles: Hole[] = [], columnHoles: Hole[] = [];
    for(const hole of columnConnectionHoles.filter(h=>Math.abs(h.station-x)<1e-6))columnHoles.push({x:hole.y-columnMid,z:hole.x-x,diameter:hole.diameter});
    const diameter=referenceBoltDiameter, holeD=diameter+.003, code=`S${i+1}`;
    if(hardware){
      if(!bracket)for(const sx of [-1,1])for(const sz of [-1,1]){
        const dx=sx*(b.bf/2-.04),z=sz*(girderWidth/2+.06),number=(sx<0?1:3)+(sz<0?0:1);
        seatHoles.push({x:dx,z,diameter:holeD});topHoles.push({x:z-bracketMid,z:-dx,diameter:holeD});
        hardware.bolt(group,{id:`${code}-SC-${number}`,family:'Seat mounting bolt',description:'Bearing seat to column bracket top flange',diameter,grip:plateT+b.tf},new THREE.Vector3(x+dx,beamTop-b.tf,z));
      }
      const adjacent=i===0?supports[1]-x:x-supports[i-1];
      if(!bracket&&!independentBearing&&girderWidth>.15&&(girderWidth-c.tw)>.12&&adjacent>.6){
        const rows=i===0?[.18,.27]:i===supports.length-1?[-.27,-.18]:[-.18,.18];
        let number=0;for(const dx of rows)for(const sz of [-1,1]){
          const z=sz*(girderWidth/2-.04);seatHoles.push({x:dx,z,diameter:holeD});girderBoltHoles.push({x:x+dx,z,diameter:holeD});
          hardware.bolt(group,{id:`${code}-GS-${++number}`,family:'Girder seat bolt',description:'Runway bottom flange to bracket bearing seat',diameter,grip:plateT+girderFlangeT},new THREE.Vector3(x+dx,seatTop-plateT,z));
        }
      }
      // Column flange and bracket end-plate holes share a horizontal bolt axis.
      if(!bracket)for(const sx of [-1,1])for(const level of [0,1]){
        const dx=sx*Math.min(endPlateWidth/2-.055,c.bf/2-.045),y=level===0?beamTop+.05:beamBottom-.4,number=(sx<0?1:3)+level;
        endHoles.push({x:dx,z:-(y-endPlateMid),diameter:holeD});
        columnHoles.push({x:y-(columnTop+columnBottom)/2,z:dx,diameter:holeD});
        hardware.bolt(group,{id:`${code}-EB-${number}`,family:'Column bracket bolt',description:'Bracket end plate to building-column inner flange',diameter,grip:plateT+c.tf,support:{x,z:columnOffset}},new THREE.Vector3(x+dx,y,columnFace+c.tf),new THREE.Vector3(0,0,-1));
      }
      if(frameStyle==='tapered'){
        for(const sx of [-1,1])for(const drop of [.12,.30,.50,.68])columnHoles.push({x:columnTop-drop-columnMid,z:sx*.09,diameter:holeD});
      }
      for(const sx of [-1,1])for(const sz of [-1,1]){
        const ax=sx*(c.bf/2+.06),az=sz*(c.d/2+.06),number=(sx<0?1:3)+(sz<0?0:1),anchorD=.0254;
        baseHoles.push({x:ax,z:az,diameter:anchorD+.006});
        hardware.bolt(group,{id:`${code}-AR-${number}`,family:'Base anchor rod',description:'Building-column base plate to illustrative foundation pad',diameter:anchorD,grip:plateT,support:{x,z:columnOffset}},new THREE.Vector3(x+ax,columnBottom-plateT,columnOffset+az),new THREE.Vector3(0,1,0),true);
      }
    }
    const upperHoles:Hole[]=[];
    const bracedStations=new Set([0,1,supports.length-2,supports.length-1]);
    if(hardware&&bracedStations.has(i))for(const y of [columnBottom+.65,columnTop-.45])for(const sx of [-1,1])for(const sy of [-1,1])upperHoles.push({x:y-columnMid+sy*.055,z:sx*.045,diameter:holeD});
    if(frameStyle==='tapered'){
      const member=taperedISection(`column-${code}`,profile,c.bf,c.tf,c.tw,{steel:materials.column,edge:materials.edge},columnHoles,upperHoles);
      member.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));member.position.set(x,columnMid,columnOffset);group.add(member);
      for(const mesh of member.children)mesh.userData.part={id:`column-${code}-${mesh.name}`,family:'Tapered building column',description:'Illustrative fabricated I-column, deepening toward the moment-frame knee.',support:{x,z:columnOffset}} satisfies PartInfo;
    }else wMember(`column-${code}`,column,columnTop-columnBottom,new THREE.Vector3(x,columnMid,columnOffset),true,materials.column,upperHoles,columnHoles);
    if(!bracket){
    wMember(`bracket-${code}`,crosshead,capLength,new THREE.Vector3(x,(beamTop+beamBottom)/2,bracketMid),false,materials.beam,topHoles);
    plate(`bearing-seat-${code}`,Math.max(b.bf+.12,.7,independentBearing?.seatLength??0),plateT,seatWidth,x,seatTop-plateT/2,0,seatHoles,independentBearing?'Shared bracket spreader (reference)':'Bearing seat plate');
    const end=plate(`bracket-end-plate-${code}`,endPlateWidth,plateT,endPlateTop-endPlateBottom,x,endPlateMid,columnFace-plateT/2,endHoles,'Bracket end plate');end.rotation.x=Math.PI/2;
    // Paired triangular knee plates run from the cantilever underside back to
    // the end plate. They remain visible in member view as part of the bracket.
    for(const sign of [-1,1]){
      const shape=new THREE.Shape();shape.moveTo(.05,beamBottom);shape.lineTo(bracketEnd,beamBottom);shape.lineTo(bracketEnd,beamBottom-.45);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false});geometry.rotateY(-Math.PI/2);geometry.translate(.006,0,0);
      const knee=outlined(new THREE.Mesh(geometry,materials.plate),`bracket-knee-${code}-${sign}`,'Bracket knee plate',{x,z:0});knee.position.x=x+sign*(b.tw/2+.035);group.add(knee);
    }
    }
    plate(`base-plate-${code}`,baseX,plateT,baseZ,x,columnBottom-plateT/2,columnOffset,baseHoles,'Column base plate');
    box(group,`foundation-pad-${code}`,baseX+.2,padH,baseZ+.2,x,floor+padH/2,columnOffset,materials.foundation);
  });
  if(bracket)group.add(buildWeldedBrackets(bracket,supports,seatTop,materials.plate,materials.edge,continuousBearing,materials.weld,hardware));
  return {group,floor,columnBottom,columnTop,columnOffset,columnFace,beamTop,beamBottom,capLength,bracketStart,bracketEnd,seatTop,girderBoltHoles,profile,columnOuter:(y:number)=>columnOffset+profileUpper(profile,y-columnMid)};
}
