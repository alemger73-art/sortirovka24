import {defineConfig} from 'vite';
import base from './vite.food-test.config';
export default defineConfig({...base,server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:8000'}},preview:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:8000'}}});
