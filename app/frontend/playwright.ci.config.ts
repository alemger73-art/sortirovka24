import {defineConfig} from '@playwright/test';
import receipt from './playwright.receipt.config';

const suite=process.env.E2E_SUITE || 'ui';
const live=['crm-live.spec.ts','payment-live.spec.ts','menu-live.spec.ts','food-cart.spec.ts','food-checkout.spec.ts'];
export default defineConfig(suite==='receipt' ? receipt : {
 testDir:'./e2e',forbidOnly:true,workers:1,retries:0,timeout:90000,reporter:'list',
 ...(suite==='live'?{testMatch:live}:{testIgnore:[...live,'receipt-58.spec.ts']}),
 use:{baseURL:suite==='live'?'http://127.0.0.1:3187':'http://127.0.0.1:3180',channel:'chrome',serviceWorkers:'block',screenshot:'only-on-failure'},
 webServer:suite==='live'?[
  {command:'python -m tests.payment_browser_server',cwd:'../backend',url:'http://127.0.0.1:3188/__test__/sessions',timeout:120000,env:{DATABASE_URL:'sqlite+aiosqlite:///:memory:',EXTERNAL_SIDE_EFFECTS:'disabled',INTEGRITY_BASE_URL:''}},
  {command:'node node_modules/vite/bin/vite.js preview --config vite.payment-test.config.ts --port 3187 --strictPort',url:'http://127.0.0.1:3187'}
 ]:{command:'node node_modules/vite/bin/vite.js preview --config vite.ci-test.config.ts --port 3180 --strictPort',url:'http://127.0.0.1:3180'}
});
