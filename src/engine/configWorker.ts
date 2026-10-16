import {buildProject,previewConfig} from './configurator';
/** Configurator work off the main thread: the girder sizing runs a moving-load analysis, the haunch sizing iterates. */
self.onmessage=(event)=>{const {type,config,requestId}=event.data;try{self.postMessage({requestId,result:type==='build'?buildProject(config):previewConfig(config)});}catch(error){self.postMessage({requestId,error:error instanceof Error?error.message:'Configuration failed'});}};
