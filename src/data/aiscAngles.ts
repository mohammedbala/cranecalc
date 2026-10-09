import raw from './aiscAngles.json' with {type:'json'};
/** Original US nominal dimensions, not a tieback capacity catalogue. */
export const aiscAngles=raw;
export const aiscAngleByName=(name:string)=>aiscAngles.find(s=>s.name===name);
