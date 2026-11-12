import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({base:mode==='pages'?'./':'/',define:{'import.meta.env.VITE_PAGES_DEMO':JSON.stringify(mode==='pages'?'true':'false')},plugins:[react()],server:{port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:8017'}},build:{target:'es2022',sourcemap:false}}));
