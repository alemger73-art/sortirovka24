import {defineConfig} from '@playwright/test';
import crm from './playwright.crm.config';
export default defineConfig({...crm,testMatch:['menu-live.spec.ts'],timeout:150000,outputDir:'test-results-menu',use:{...crm.use,actionTimeout:15000,screenshot:'only-on-failure'}});
