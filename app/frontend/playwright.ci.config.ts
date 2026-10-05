import {defineConfig} from '@playwright/test';
import receipt from './playwright.receipt.config';

const suite=process.env.E2E_SUITE || 'ui';
const live=['crm-live.spec.ts','payment-live.spec.ts','menu-live.spec.ts','food-cart.spec.ts','food-checkout.spec.ts','dam-client-ux.spec.ts'];
const liveSuites:Record<string,string>={crm:live[0],payment:live[1],menu:live[2],cart:live[3],checkout:live[4],client:live[5]};
const isLive=!!liveSuites[suite];
// Auth owns an isolated API process so unrelated tests cannot exhaust its SMS/IP window.
const auth=['login.spec.ts','registration.spec.ts'];
export default defineConfig(suite==='receipt' ? receipt : {
 testDir:'./e2e',forbidOnly:true,workers:suite==='ui'?4:1,retries:0,timeout:isLive?150000:45000,reporter:'list',
 ...(isLive?{testMatch:liveSuites[suite]}:suite==='auth'?{testMatch:auth}:{testIgnore:[...live,...auth,'receipt-58.spec.ts']}),
 projects:[{name:'chromium'}],
 use:{baseURL:isLive?'http://127.0.0.1:3187':'http://127.0.0.1:3180',channel:'chrome',serviceWorkers:'block',screenshot:'only-on-failure'},
 webServer:isLive?[
  {command:'python -m tests.payment_browser_server',cwd:'../backend',url:'http://127.0.0.1:3188/__test__/sessions',timeout:120000,env:{DATABASE_URL:'sqlite+aiosqlite:///:memory:',EXTERNAL_SIDE_EFFECTS:'disabled',INTEGRITY_BASE_URL:''}},
  {command:'node node_modules/vite/bin/vite.js preview --config vite.payment-test.config.ts --port 3187 --strictPort',url:'http://127.0.0.1:3187'}
 ]:{command:'node node_modules/vite/bin/vite.js --config vite.ci-test.config.ts --port 3180 --strictPort',url:'http://127.0.0.1:3180'}
});
