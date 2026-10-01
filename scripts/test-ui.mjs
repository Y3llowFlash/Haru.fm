import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { _electron } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const userData = await mkdtemp(path.join(os.tmpdir(), 'haru-ui-'));
const screenshots = path.join(root, 'test-results');
await mkdir(screenshots, { recursive: true });
const headless = process.platform === 'linux' && !process.env.DISPLAY;
const args = [...(headless ? ['--headless', '--ozone-platform=headless'] : []), ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--disable-gpu', path.join(root, 'tests/fixtures/electron-main.cjs')];
let app;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log(`PASS ${message}`); };

async function launch() {
  const electronApp = await _electron.launch({ args, cwd: root, env: { ...process.env, HARU_QA_USER_DATA: userData }, timeout: 30000 });
  const page = await electronApp.firstWindow();
  await page.waitForSelector('.brand');
  await page.waitForFunction(() => !document.querySelector('#youtube-link').disabled);
  return { electronApp, page };
}

try {
  let page;
  ({ electronApp: app, page } = await launch());
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://i.ytimg.com/**', (route) => route.abort());
  // The deterministic player double tests our integration and controls without claiming live media playback.
  await page.evaluate(() => {
    window.__haruCalls = [];
    window.__playerCreations = 0;
    window.YT = { Player: class {
      constructor(node, options) {
        this.options = options; this.time = 0; this.duration = 210; this.list = []; this.index = -1; this.id = null;
        this.iframe = document.createElement('iframe');
        this.iframe.srcdoc = '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0d1522;color:#9baac0;font:14px monospace">Automated playback fixture</body>';
        node.replaceWith(this.iframe);
        window.__playerCreations++;
        window.__fakePlayer = this;
        setTimeout(() => options.events.onReady({ target: this }), 0);
      }
      state(code) { this.options.events.onStateChange({ target: this, data: code }); }
      cueVideoById(source) { this.id = source.videoId; this.time = source.startSeconds || 0; this.list = []; this.index = -1; window.__haruCalls.push(['cueVideo', this.id]); this.state(5); }
      cuePlaylist(source) { this.list = ['jfKfPfyJRdk', '5qap5aO4i9A', 'DWcJFNfaw9c']; this.index = source.index || 0; this.id = this.list[this.index]; this.time = 0; window.__haruCalls.push(['cuePlaylist', this.index]); this.state(5); }
      playVideo() { window.__haruCalls.push(['play']); this.state(1); }
      pauseVideo() { window.__haruCalls.push(['pause']); this.state(2); }
      seekTo(value) { this.time = value; window.__haruCalls.push(['seek', value]); }
      setVolume(value) { window.__haruCalls.push(['volume', value]); }
      nextVideo() { this.index = Math.min(this.index + 1, this.list.length - 1); this.id = this.list[this.index]; this.time = 0; window.__haruCalls.push(['next']); this.state(1); }
      previousVideo() { this.index = Math.max(0, this.index - 1); this.id = this.list[this.index]; this.time = 0; window.__haruCalls.push(['previous']); this.state(1); }
      getVideoUrl() { return this.id ? `https://www.youtube.com/watch?v=${this.id}` : ''; }
      getPlaylist() { return this.list; }
      getPlaylistIndex() { return this.index; }
      getCurrentTime() { return this.time; }
      getDuration() { return this.duration; }
      getIframe() { return this.iframe; }
      destroy() { this.iframe.remove(); }
    } };
  });
  const input = page.getByLabel('YouTube video or playlist link', { exact: true });
  await input.fill('https://youtube.com.attacker.test/watch?v=jfKfPfyJRdk');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  check((await page.getByRole('alert').innerText()).includes('Use a link'), 'rejects deceptive YouTube links');
  await input.fill('https://youtu.be/jfKfPfyJRdk?t=30');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled);
  check(await page.getByRole('button', { name: 'Next track', exact: true }).isDisabled(), 'single videos do not offer an unrelated next track');
  check(await page.evaluate(() => window.__haruCalls.some(([type]) => type === 'cueVideo') && !window.__haruCalls.some(([type]) => type === 'play')), 'loads without autoplay');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('.is-playing');
  check(await page.locator('.vinyl').evaluate((element) => getComputedStyle(element).animationPlayState === 'running'), 'vinyl animation follows actual playback state');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.is-playing'));
  check(await page.locator('.vinyl').evaluate((element) => getComputedStyle(element).animationPlayState === 'paused'), 'pausing stops the vinyl animation');
  await page.getByRole('slider', { name: 'Seek', exact: true }).press('End');
  check(await page.evaluate(() => window.__haruCalls.some(([type, value]) => type === 'seek' && value === 210)), 'seek control reaches the requested time');
  await page.getByRole('slider', { name: 'Volume', exact: true }).press('Home');
  await page.waitForFunction(() => window.__haruCalls.some(([type, value]) => type === 'volume' && value === 0));
  check(true, 'volume control reaches the embedded player');
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  check((await page.getByRole('slider', { name: 'Volume', exact: true }).inputValue()) !== '0', 'unmute restores an audible volume');
  await input.fill('https://www.youtube.com/playlist?list=PLabcDEF0123456789');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Next track"]').disabled);
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await page.waitForFunction(() => window.__fakePlayer.index === 1);
  check(true, 'playlist next advances to the next video');
  await page.getByRole('button', { name: 'Previous track or restart', exact: true }).click();
  check(await page.evaluate(() => window.__fakePlayer.index === 0), 'playlist previous returns to the previous video');
  await page.screenshot({ path: path.join(screenshots, 'cozy.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to Mini Mode', exact: true }).click();
  await page.waitForSelector('.app-window.mini');
  check(await page.locator('.room').count() === 0, 'Mini Mode removes the decorative room');
  check(await page.evaluate(() => window.__playerCreations === 1), 'mode changes preserve the existing player');
  const frame = await page.locator('.player-host iframe').boundingBox();
  check(frame.width >= 200 && frame.height >= 200, 'Mini Mode keeps the YouTube viewport at least 200 by 200');
  check(await page.evaluate(() => innerWidth >= 340 && document.documentElement.scrollWidth <= innerWidth), 'layout stays usable after native resizing without horizontal overflow');
  await page.getByRole('button', { name: 'Pin window', exact: true }).click();
  if (headless) check((await page.evaluate(() => window.haru.getPreferences())).alwaysOnTop, 'pin action persists the requested preference (headless compositor has no stacking order)');
  else check(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), 'pin toggles the native always-on-top window');
  await page.getByRole('button', { name: 'Minimize window', exact: true }).focus();
  await page.getByRole('button', { name: 'Minimize window', exact: true }).press('Enter');
  await page.waitForFunction(() => document.querySelector('.monitor-label').textContent.includes('PAUSED'));
  check(true, 'minimizing pauses playback');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); });
  await page.screenshot({ path: path.join(screenshots, 'mini.png'), fullPage: true });
  await page.evaluate(() => window.__fakePlayer.options.events.onError({ target: window.__fakePlayer, data: 101 }));
  check((await page.getByRole('alert').innerText()).includes('owner'), 'blocked embeds show an actionable YouTube error');
  check(await page.evaluate(() => typeof window.require === 'undefined'), 'renderer cannot access Node.js');
  check(errors.length === 0, 'renderer has no uncaught JavaScript errors');
  console.log('Layout:', await page.evaluate(() => ({ width: innerWidth, height: innerHeight, contentWidth: document.documentElement.scrollWidth, player: document.querySelector('.player-viewport').getBoundingClientRect().toJSON() })));
  await app.close(); app = null;
  ({ electronApp: app, page } = await launch());
  await page.waitForSelector('.app-window.mini');
  check((await inputValue(page)) === 'https://www.youtube.com/playlist?list=PLabcDEF0123456789', 'last link survives an app restart');
  check((await page.evaluate(() => window.haru.getPreferences())).alwaysOnTop, 'pin preference survives an app restart');
  check(await page.locator('iframe').count() === 0, 'restarting does not start YouTube or autoplay');
  console.log(`${checks} UI and native-window checks passed.`);
} finally {
  await app?.close();
  await rm(userData, { recursive: true, force: true });
}

async function inputValue(page) { return page.getByLabel('YouTube video or playlist link', { exact: true }).inputValue(); }
