import { defineConfig } from '@playwright/test';
import { chromiumChannel } from './server/browserRuntime';
export default defineConfig({testDir:'tests/e2e',timeout:60000,expect:{timeout:15000},use:{channel:chromiumChannel,baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:1000}},webServer:{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:30000},reporter:'list'});
