import { calculate } from './calculate';
self.onmessage=(event)=>{const {input,requestId}=event.data;try{self.postMessage({snapshot:calculate(input),requestId});}catch(error){self.postMessage({error:error instanceof Error?error.message:'Calculation failed',requestId});}};
