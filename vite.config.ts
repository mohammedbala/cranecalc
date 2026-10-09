import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({
  base:'./',
  define:{'import.meta.env.VITE_STATIC_HOST':JSON.stringify(mode==='pages'?'true':'false')},
  plugins:[react()],
  server:{port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:4174'}},
}));
