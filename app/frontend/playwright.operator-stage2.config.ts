import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',testMatch:['operator-stage2.spec.ts','operator-ui.spec.ts'],timeout:45000,workers:1,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3184',channel:'chrome',serviceWorkers:'block'},
 projects:[320,390,768,1440].map(width=>({name:`width-${width}`,use:{viewport:{width,height:900}}})),
 webServer:{command:'node node_modules/vite/bin/vite.js preview --config vite.food-test.config.ts --host 127.0.0.1 --port 3184 --strictPort',url:'http://127.0.0.1:3184',reuseExistingServer:false},
});
