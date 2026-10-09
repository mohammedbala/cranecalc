import {restoreHardwareAuditModel} from './hardwareAuditModel';
import {checkHardwareClashes} from './hardwareClashes';
self.onmessage=event=>{try{self.postMessage({audit:checkHardwareClashes(restoreHardwareAuditModel(event.data))});}catch(error){self.postMessage({error:error instanceof Error?error.message:'Hardware scan failed'});}};
