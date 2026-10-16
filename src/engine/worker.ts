import { calculate } from './calculate';
// Progress messages ({progress, requestId}) precede the result ({snapshot, requestId}) or the error.
self.onmessage=(event)=>{const {input,requestId}=event.data;try{self.postMessage({snapshot:calculate(input,{onProgress:progress=>self.postMessage({progress,requestId})}),requestId});}catch(error){self.postMessage({error:error instanceof Error?error.message:'Calculation failed',requestId});}};
