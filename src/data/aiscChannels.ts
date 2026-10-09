import raw from './aiscChannels.json' with {type:'json'};
import {aiscShapeByName,loadAiscSection,matchesAiscSection} from './aiscSections';
import type {Section} from '../engine/types';
export const aiscChannels=raw;
export const aiscChannelByName=(name:string)=>raw.find(v=>v.name===name);
export function loadCappedSection(section:Section,beamName:string,channelName:string):Section{
 const c=aiscChannelByName(channelName);if(!c)throw Error(`Unknown AISC channel: ${channelName}`);
 const w=loadAiscSection(section,beamName);
 return {...w,kind:'cap',name:`${beamName} + ${channelName}`,capCatalogueId:channelName,
  capWidth:c.d*25.4,capDepth:c.bf*25.4,capTw:c.tw*25.4,capTf:c.tf*25.4};
}
export function matchesCappedSection(s:Section){
 if(s.kind!=='cap'||!s.catalogueId||!s.capCatalogueId||!aiscShapeByName(s.catalogueId)||!aiscChannelByName(s.capCatalogueId))return false;
 const expected=loadCappedSection(s,s.catalogueId,s.capCatalogueId);
 return s.name===expected.name&&matchesAiscSection({...s,kind:'rolled',name:s.catalogueId})&&
  (['capWidth','capDepth','capTw','capTf'] as const).every(k=>Math.abs(s[k]-expected[k])<=Math.abs(expected[k])*1e-10);
}
