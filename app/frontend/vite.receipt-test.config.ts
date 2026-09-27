import {defineConfig} from 'vite';
import path from 'node:path';
import {copyFileSync} from 'node:fs';
export default defineConfig({
  resolve:{alias:{'@':path.resolve(__dirname,'src')}},
  // Bundle the actual production module, avoiding dev-server dependency scanning
  // of generated native build reports in a populated Windows checkout.
  build:{outDir:'test-receipt-build',lib:{entry:path.resolve(__dirname,'e2e/receipt-harness.ts'),formats:['es'],fileName:'receiptPrint'}},
  plugins:[{name:'receipt-harness',closeBundle(){copyFileSync('e2e/receipt-harness.html','test-receipt-build/index.html');}}],
});
