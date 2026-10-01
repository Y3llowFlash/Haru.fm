import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sanitizePreferences, createPreferenceStore } = require('../desktop/preferences.cjs');
const { isSafeYouTubeURL, isTrustedIPC, isDevelopmentURL } = require('../desktop/security.cjs');
const { createStaticServer } = require('../desktop/server.cjs');

test('preferences constrain values and survive a restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'haru-settings-'));
  try {
    const file = path.join(dir, 'settings.json');
    const store = createPreferenceStore(file);
    store.update({ volume: 250, mode: 'mini', alwaysOnTop: true, animations: false, lastInput: 'https://youtu.be/jfKfPfyJRdk' });
    const restored = createPreferenceStore(file).get();
    assert.equal(restored.volume, 100); assert.equal(restored.mode, 'mini'); assert.equal(restored.alwaysOnTop, true);
    assert.equal(restored.animations, false); assert.match(restored.lastInput, /youtu.be/);
    assert.equal(sanitizePreferences({ volume: NaN, mode: 'evil', miniBounds: { x: 0, y: 0, width: -1, height: 0 } }).miniBounds.width, 420);
    await writeFile(file, '{broken');
    assert.equal(createPreferenceStore(file).get().volume, 65);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('external links and development origin are explicitly constrained', () => {
  assert.equal(isSafeYouTubeURL('https://www.youtube.com/watch?v=jfKfPfyJRdk'), true);
  for (const url of ['https://youtube.com.bad.test', 'https://user:pass@youtube.com', 'file:///tmp/file', 'http://youtube.com', 'https://youtube.com:444/']) assert.equal(isSafeYouTubeURL(url), false);
  assert.equal(isDevelopmentURL('http://127.0.0.1:5173'), true);
  assert.equal(isDevelopmentURL('https://attacker.test'), false);
});
test('only the app main frame can invoke privileged window actions', () => {
  const frame = { url: 'http://127.0.0.1:9000/index.html' };
  const sender = { mainFrame: frame };
  const window = { webContents: sender };
  assert.equal(isTrustedIPC({ sender, senderFrame: frame }, window, 'http://127.0.0.1:9000'), true);
  assert.equal(isTrustedIPC({ sender, senderFrame: { url: 'https://www.youtube.com/embed/jfKfPfyJRdk' } }, window, 'http://127.0.0.1:9000'), false);
  assert.equal(isTrustedIPC({ sender: {}, senderFrame: frame }, window, 'http://127.0.0.1:9000'), false);
});
test('packaged server serves assets with CSP and blocks traversal, spoofed hosts and writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'haru-server-'));
  await writeFile(path.join(dir, 'index.html'), '<p>Haru.fm</p>');
  await writeFile(path.join(dir, 'app.js'), 'console.log("Haru.fm")');
  const server = await createStaticServer(dir);
  try {
    const root = await fetch(server.url);
    assert.equal(root.status, 200); assert.equal(await root.text(), '<p>Haru.fm</p>');
    assert.match(root.headers.get('content-security-policy'), /object-src 'none'/);
    assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
    assert.match((await fetch(`${server.url}app.js`)).headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${server.url}app.js`, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(server.url, { method: 'POST', body: 'x' })).status, 405);
    const spoofedHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(server.url, { headers: { Host: 'attacker.test' } }, (response) => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(spoofedHostStatus, 403);
    assert.notEqual((await fetch(`${server.url}%2e%2e%2fsecret.txt`)).status, 200);
    assert.equal((await fetch(new URL('/index.html', server.url))).status, 404);
    assert.equal(await readFile(path.join(dir, 'index.html'), 'utf8'), '<p>Haru.fm</p>');
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
