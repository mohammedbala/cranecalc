import {z} from 'zod';
const positive=z.number().finite().positive();
export const capDesignSchema=z.object({
 Fy:positive,Fu:positive,Fexx:positive,weldSize:positive,developmentLength:positive,
 cmaaClass:z.enum(['unconfirmed','A','B','C','D','E','F']),
 fullLength:z.boolean(),continuousWelds:z.boolean(),contactConfirmed:z.boolean(),
 unperforated:z.boolean(),topStiffenerCjp:z.boolean(),
 materialSource:z.string().max(300),dutySource:z.string().max(300),fitupNote:z.string().max(500)
});
export type CapDesignInput=z.infer<typeof capDesignSchema>;
export const emptyCapDesign:CapDesignInput={Fy:50*6.894757293168,Fu:65*6.894757293168,Fexx:490,weldSize:6.35,developmentLength:1219.2,cmaaClass:'unconfirmed',fullLength:true,continuousWelds:true,contactConfirmed:false,unperforated:false,topStiffenerCjp:false,materialSource:'',dutySource:'',fitupNote:''};
