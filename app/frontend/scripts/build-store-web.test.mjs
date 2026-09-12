import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./build-store-web.mjs', import.meta.url));
for (const api of ['http://api.example.com', 'https://localhost', 'https://api.example.com/api', 'https://user:password@api.example.com']) {
  test(`reject invalid store API origin: ${new URL(api).origin}`, () => {
    const result = spawnSync(process.execPath, [script, 'android'], {
      env: { ...process.env, API_BASE_URL: api }, encoding: 'utf8', timeout: 15000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Store API URL must be a public HTTPS origin/);
  });
}
test('reject server secrets before bundling', () => {
  const result = spawnSync(process.execPath, [script, 'android'], {
    env: { ...process.env, API_BASE_URL: 'https://api.example.com', VITE_SERVER_SECRET: 'test-marker-not-a-real-secret' }, encoding: 'utf8', timeout: 15000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Remove server-only secret VITE_SERVER_SECRET/);
  assert.doesNotMatch(result.stderr, /test-marker-not-a-real-secret/);
});
