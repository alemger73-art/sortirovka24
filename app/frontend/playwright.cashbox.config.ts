import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'cashbox.spec.ts',timeout:45000,workers:1,reporter:'list',
  use:{baseURL:'http://127.0.0.1:3194',channel:'chrome',serviceWorkers:'block'},
  projects:[320,390,1440].map(width=>({name:`width-${width}`,use:{viewport:{width,height:900}}})),
  webServer:{command:'node node_modules/vite/bin/vite.js preview --config vite.food-test.config.ts --host 127.0.0.1 --port 3194 --strictPort',url:'http://127.0.0.1:3194',reuseExistingServer:false}});
