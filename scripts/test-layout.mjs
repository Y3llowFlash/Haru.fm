import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const userData = await mkdtemp(path.join(os.tmpdir(), 'haru-layout-'));
const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const fixture = await readFile(path.join(root, 'tests/fixtures/youtube-api.js'), 'utf8');
const headless = process.platform === 'linux' && !process.env.DISPLAY;
// Exercise the common Windows 125% display scale as well as native client sizing.
const args = [...(headless ? ['--headless', '--ozone-platform=headless'] : []), ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--disable-gpu', '--force-device-scale-factor=1.25', path.join(root, 'tests/fixtures/electron-main.cjs')];
const sizes = [[420, 540], [440, 570], [500, 700], [500, 720], [500, 880], [720, 540], [760, 760], [800, 540], [1000, 600], [420, 1000]];
let app;
let checks = 0;
let nativePerCssPixel = 1;

async function resize(page, width, height) {
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [Math.round(width * nativePerCssPixel), Math.round(height * nativePerCssPixel)]);
  // Windows' frameless client edges can round by a few CSS pixels at fractional
  // display scales. Visibility and aspect checks below use the actual viewport.
  await page.waitForFunction(([w, h]) => Math.abs(innerWidth - w) <= 3 && Math.abs(innerHeight - h) <= 3, [width, height], { timeout: 5000 }).catch(async error => {
    console.error('Resize geometry:', await page.evaluate(() => ({ width: innerWidth, height: innerHeight, deviceScale: devicePixelRatio })), await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds()));
    throw error;
  });
}

async function inspect(page, mode, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.evaluate(() => {
    const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const selectors = ['.titlebar', '.close-button', '.monitor', '.player-viewport', '.track-info', '.transport-buttons', '.seek', '.time-volume', '.link-form', 'footer'];
    if (document.querySelector('.message')) selectors.push('.message');
    return { width: innerWidth, height: innerHeight, scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, elements: Object.fromEntries(selectors.map(selector => [selector, bounds(selector)])), room: bounds('.room'), playerCreations: window.__playerCreations };
  });
  const detail = `${mode} ${label}: ${JSON.stringify(geometry)}`;
  assert.ok(geometry.scrollHeight <= geometry.height + 1 && geometry.scrollWidth <= geometry.width + 1, `no document overflow; ${detail}`);
  for (const [name, rect] of Object.entries(geometry.elements)) {
    assert.ok(rect && rect.top >= -1 && rect.left >= -1 && rect.bottom <= geometry.height + 1 && rect.right <= geometry.width + 1, `${name} is fully visible; ${detail}`);
  }
  const player = geometry.elements['.player-viewport'];
  assert.ok(player.width >= 199.9 && player.height >= 199.9, `player meets minimum dimensions; ${detail}`);
  assert.ok(Math.abs(player.width / player.height - 16 / 9) < .01, `player preserves 16:9; ${detail}`);
  if (mode === 'cozy') assert.ok(geometry.room.height > 0 && Math.abs(geometry.room.width / geometry.room.height - 1.5) < .02, `room remains visible with its original proportions; ${detail}`);
  assert.equal(geometry.playerCreations, 1, `resizing keeps the existing player; ${detail}`);
  checks++;
  console.log(`PASS ${mode} ${label} (client ${geometry.width}x${geometry.height}): controls visible, player 16:9, no page scrolling`);
}

try {
  app = await _electron.launch({ args, cwd: root, env: { ...process.env, HARU_QA_USER_DATA: userData }, timeout: 30000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => document.querySelector('#youtube-link')?.disabled === false);
  // Forced Chromium scaling may differ from the host Windows display's native
  // DIP scale. Calibrate the native client size to the renderer's CSS pixels.
  const nativeWidth = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize()[0]);
  const cssWidth = await page.evaluate(() => innerWidth);
  nativePerCssPixel = nativeWidth / cssWidth;
  console.log('Display sizing:', { nativeWidth, cssWidth, nativePerCssPixel, deviceScale: await page.evaluate(() => devicePixelRatio) });
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('haru:metadata');
    ipcMain.handle('haru:metadata', () => ({ title: 'Mossberg Arki — တဝဲလည်လည် သီချင်းခေါင်းစဉ် · A very long music title for resizing', author: 'A channel name that must fit in a small player window' }));
  });
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.evaluate(fixture);
  await page.getByLabel('YouTube video or playlist link', { exact: true }).fill('https://youtu.be/jfKfPfyJRdk');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  for (const mode of ['cozy', 'mini']) {
    if (mode === 'mini') { await page.getByRole('button', { name: 'Switch to Mini Mode', exact: true }).click(); await page.waitForSelector('.app-window.mini'); }
    for (const [width, height] of sizes) {
      await resize(page, width, height);
      await inspect(page, mode, `${width}x${height}`);
      assert.ok(await page.locator('.app-window').evaluate(node => node.classList.contains('is-playing')), 'resizing preserves playback');
      if ((width === 420 && height === 540) || (width === 500 && height === 880) || (width === 800 && height === 540)) {
        await page.screenshot({ path: path.join(output, `resize-${mode}-${width}x${height}.png`) });
      }
    }
    await resize(page, 420, 540);
    await page.evaluate(() => window.__fakePlayer.options.events.onError({ target: window.__fakePlayer, data: 101 }));
    await page.waitForSelector('.message');
    await inspect(page, mode, '420x540 with an error notice');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.message'));
    await page.waitForFunction(() => !document.querySelector('.play-button').disabled);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  }
  console.log(`${checks} responsive-window checks passed.`);
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }); }
