import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'payment-live.spec.ts',timeout:60000,workers:1,reporter:'list',
 use:{baseURL:'http://127.0.0.1:3187',channel:'chrome',serviceWorkers:'block',trace:'retain-on-failure'},
 projects:[390,1440].map(width=>({name:`width-${width}`,use:{viewport:{width,height:900}}})),
 webServer:[
  {command:'".venv\\Scripts\\python.exe" -m tests.payment_browser_server' ,cwd:'../backend',url:'http://127.0.0.1:3188/__test__/sessions',reuseExistingServer:false,env:{DATABASE_URL:'sqlite+aiosqlite:///:memory:',EXTERNAL_SIDE_EFFECTS:'disabled',INTEGRITY_BASE_URL:''}},
  {command:'node node_modules/vite/bin/vite.js preview --config vite.payment-test.config.ts --port 3187 --strictPort',url:'http://127.0.0.1:3187',reuseExistingServer:false},
 ]});
