import { defineConfig } from '@playwright/test';
import { chromiumChannel } from './server/browserRuntime';
// Smoke tests run against the static GitHub Pages build: calculations, drawings and the printable report
// all run in the browser there, exactly as deployed.
export default defineConfig({testDir:'tests/e2e',timeout:600000,expect:{timeout:30000},workers:1,
 use:{channel:chromiumChannel,launchOptions:process.env.CRANECALC_CHROMIUM_PATH?{executablePath:process.env.CRANECALC_CHROMIUM_PATH}:{},baseURL:'http://127.0.0.1:4175',viewport:{width:1440,height:1000},acceptDownloads:true},
 webServer:{command:'npm run build:pages && npm run preview:pages -- --strictPort',url:'http://127.0.0.1:4175',reuseExistingServer:!process.env.CI,timeout:300000},reporter:'list'});
