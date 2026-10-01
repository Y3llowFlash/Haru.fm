import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { _electron } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const userData = await mkdtemp(path.join(os.tmpdir(), 'haru-ui-'));
const screenshots = path.join(root, 'test-results');
const fakePlayerScript = await readFile(path.join(root, 'tests/fixtures/youtube-api.js'), 'utf8');
await mkdir(screenshots, { recursive: true });
const headless = process.platform === 'linux' && !process.env.DISPLAY;
const args = [...(headless ? ['--headless', '--ozone-platform=headless'] : []), ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--disable-gpu', path.join(root, 'tests/fixtures/electron-main.cjs')];
let app;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log(`PASS ${message}`); };

async function expectBackgroundProgress(page, label) {
  const before = await page.evaluate(() => ({ ticks: window.__backgroundTicks, time: window.__fakePlayer.time, displayedTime: document.querySelector('.time-display').textContent, pauses: window.__haruCalls.filter(([type]) => type === 'pause').length, creations: window.__playerCreations }));
  await page.waitForFunction(previous => window.__backgroundTicks >= previous.ticks + 4 && window.__fakePlayer.time > previous.time && document.querySelector('.time-display').textContent !== previous.displayedTime, before, { timeout: 5000 });
  const after = await page.evaluate(() => ({ pauses: window.__haruCalls.filter(([type]) => type === 'pause').length, creations: window.__playerCreations, state: window.__fakePlayer.playbackState, frameAlive: window.__fakePlayer.iframe.isConnected, displayedTime: document.querySelector('.time-display').textContent }));
  check(after.state === 1 && after.frameAlive && after.pauses === before.pauses && after.creations === before.creations, `${label}: timers and playback continue on the same player without pause commands`);
}

async function minimizeNative() {
  await app.evaluate(async ({ BrowserWindow }, headless) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (headless || window.isMinimized()) { window.minimize(); return; }
    await new Promise(resolve => { window.once('minimize', resolve); window.minimize(); });
  }, headless);
}

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
  await page.evaluate(fakePlayerScript);
  await page.evaluate(() => {
    window.__backgroundTicks = 0;
    setInterval(() => {
      window.__backgroundTicks++;
      if (window.__fakePlayer?.playbackState === 1) window.__fakePlayer.time += .25;
    }, 250);
  });
  const input = page.getByLabel('YouTube video or playlist link', { exact: true });
  await input.fill('https://youtube.com.attacker.test/watch?v=jfKfPfyJRdk');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  check((await page.getByRole('alert').innerText()).includes('Use a link'), 'rejects deceptive YouTube links');
  await page.evaluate(() => { window.__holdCueState = true; });
  await input.fill('https://youtu.be/jfKfPfyJRdk?t=30');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => window.__completeCue);
  check(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled(), 'Play waits for the actual video cue, not only iframe readiness');
  await page.evaluate(() => { window.__holdCueState = false; window.__completeCue(); });
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
  await page.evaluate(() => { window.__fakePlayer.setVolume(38); window.__fakePlayer.mute(); });
  await page.waitForFunction(() => document.querySelector('[aria-label="Volume"]').value === '38' && document.querySelector('[aria-label="Unmute"]'));
  check(true, 'native YouTube volume and mute changes synchronize with the app');
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  await page.waitForFunction(() => !window.__fakePlayer.isMuted() && window.__fakePlayer.getVolume() === 38);
  check(true, 'custom unmute clears native mute without losing the volume');
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await page.waitForFunction(() => window.__fakePlayer.isMuted());
  check(await page.getByRole('slider', { name: 'Volume', exact: true }).inputValue() === '38', 'custom mute preserves the chosen volume');
  await page.getByRole('slider', { name: 'Volume', exact: true }).press('End');
  await page.waitForFunction(() => !window.__fakePlayer.isMuted() && window.__fakePlayer.getVolume() === 100);
  check(true, 'moving the volume slider makes a muted video audible');
  await page.evaluate(() => window.__fakePlayer.state(-1));
  check(await page.getByRole('button', { name: 'Load', exact: true }).isEnabled(), 'an unstarted video leaves Load available for another link');
  await input.fill('https://www.youtube.com/playlist?list=PLabcDEF0123456789');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Next track"]').disabled);
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await page.waitForFunction(() => window.__fakePlayer.index === 1);
  check(true, 'playlist next advances to the next video');
  await page.getByRole('button', { name: 'Previous track or restart', exact: true }).click();
  check(await page.evaluate(() => window.__fakePlayer.index === 0), 'playlist previous returns to the previous video');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  await page.waitForFunction(() => document.querySelector('.monitor-label').textContent.includes('PAUSED'));
  check(true, 'system suspend pauses playback');
  await page.evaluate(() => window.__fakePlayer.playVideo());
  await page.waitForFunction(() => window.__fakePlayer.playbackState === 2);
  check(true, 'a playing event during system sleep cannot override the pause');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  check(await page.getByRole('button', { name: 'Play', exact: true }).count() === 1, 'waking from sleep does not autoplay');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('.is-playing');
  check(true, 'Play works again after waking from sleep');
  await app.evaluate(async ({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows()[0];
    const bounds = main.getBounds();
    const cover = new BrowserWindow({ x: bounds.x - 8, y: bounds.y - 8, width: bounds.width + 16, height: bounds.height + 16, frame: false, show: false, alwaysOnTop: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    await cover.loadURL('data:text/html,<title>Haru QA cover window</title><body style="background:%23273040;color:white">Another application covering Haru.fm</body>');
    cover.show(); cover.focus();
  });
  if (!headless) check(await app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].isFocused() && BrowserWindow.getAllWindows()[1].isFocused()), 'another native window covers Haru.fm and takes focus');
  else check(true, 'headless cover window is created; physical occlusion is verified on Windows');
  await expectBackgroundProgress(page, 'Covered window');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Haru QA cover window').close());
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.__fakePlayer.playVideo();
  });
  await expectBackgroundProgress(page, 'Desktop hidden-visibility event');
  await page.evaluate(() => { delete document.hidden; });
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
  if (!headless) {
    await app.evaluate(async ({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; if (!window.isMinimized()) await new Promise(resolve => window.once('minimize', resolve)); });
    check(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), 'the app button really minimizes the native window');
  } else check(true, 'minimize button is exercised; native taskbar state is verified on Windows');
  await expectBackgroundProgress(page, 'Minimized with the app button');
  check(await page.evaluate(() => document.visibilityState === 'visible'), 'the minimized renderer stays active for the embedded player');
  await page.evaluate(() => window.__fakePlayer.nextVideo());
  await page.waitForFunction(() => window.__fakePlayer.index === 1 && window.__fakePlayer.playbackState === 1);
  check(await page.evaluate(() => window.__playerCreations === 1), 'playlist advancement while minimized keeps the existing player');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); });
  await expectBackgroundProgress(page, 'Restored window');
  await minimizeNative();
  if (!headless) check(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), 'native taskbar-style minimization really minimizes the window');
  else check(true, 'native minimize is exercised; taskbar state is verified on Windows');
  await expectBackgroundProgress(page, 'Minimized through native window controls');
  await page.evaluate(() => document.querySelector('.play-button').click());
  await page.waitForFunction(() => window.__fakePlayer.playbackState === 2);
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); });
  check(await page.getByRole('button', { name: 'Play', exact: true }).count() === 1, 'restoring a deliberately paused player does not autoplay');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await minimizeNative();
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  await page.evaluate(() => window.__fakePlayer.playVideo());
  await page.waitForFunction(() => document.querySelector('.monitor-label').textContent.includes('PAUSED'));
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  check(await page.getByRole('button', { name: 'Play', exact: true }).count() === 1, 'system sleep while minimized still pauses and does not autoplay after wake');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('.is-playing');
  check(true, 'Play works after sleeping while minimized and restoring the window');
  await page.screenshot({ path: path.join(screenshots, 'mini.png'), fullPage: true });
  await page.evaluate(() => window.__fakePlayer.options.events.onError({ target: window.__fakePlayer, data: 101 }));
  check((await page.getByRole('alert').innerText()).includes('owner'), 'blocked embeds show an actionable YouTube error');
  await page.evaluate(() => { window.__haruCalls = []; });
  await input.fill('https://youtu.be/DWcJFNfaw9c');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled);
  check(await page.evaluate(() => window.__haruCalls.some(([type, , list]) => type === 'cuePlaylist' && list === 'PLabcDEF0123456789') && !window.__haruCalls.some(([type]) => type === 'cueVideo')), 'Retry reloads the current source rather than an unsubmitted link');
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await page.waitForFunction(async () => { const prefs = await window.haru.getPreferences(); return prefs.muted === true && prefs.volume === 100; });

  check(await page.evaluate(() => typeof window.require === 'undefined'), 'renderer cannot access Node.js');
  check(errors.length === 0, 'renderer has no uncaught JavaScript errors');
  console.log('Layout:', await page.evaluate(() => ({ width: innerWidth, height: innerHeight, contentWidth: document.documentElement.scrollWidth, player: document.querySelector('.player-viewport').getBoundingClientRect().toJSON() })));
  await app.close(); app = null;
  ({ electronApp: app, page } = await launch());
  await page.waitForSelector('.app-window.mini');
  check((await inputValue(page)) === 'https://www.youtube.com/playlist?list=PLabcDEF0123456789', 'last link survives an app restart');
  check((await page.evaluate(() => window.haru.getPreferences())).alwaysOnTop, 'pin preference survives an app restart');
  check(await page.locator('iframe').count() === 0, 'restarting does not start YouTube or autoplay');
  check(await page.getByRole('button', { name: 'Unmute', exact: true }).count() === 1 && await page.getByRole('slider', { name: 'Volume', exact: true }).inputValue() === '100', `mute and retained volume survive a restart: ${JSON.stringify(await page.evaluate(() => window.haru.getPreferences()))}`);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://i.ytimg.com/**', (route) => route.abort());
  await page.route('https://www.youtube.com/iframe_api', (route) => route.abort());
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForSelector('.message[role="alert"]');
  check((await page.getByRole('alert').innerText()).includes('Could not reach YouTube'), 'failed API downloads show a connection error');
  await page.unroute('https://www.youtube.com/iframe_api');
  await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({ body: fakePlayerScript, contentType: 'text/javascript' }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled);
  check(await page.evaluate(() => window.__playerCreations === 1 && !window.__haruCalls.some(([type]) => type === 'play')), 'Retry recovers a failed API download without autoplay');
  await app.close(); app = null;
  ({ electronApp: app, page } = await launch());
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://i.ytimg.com/**', (route) => route.abort());
  await page.evaluate(fakePlayerScript);
  await page.evaluate(() => { window.__holdPlayerReady = true; });
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => window.__fakePlayer);
  await page.evaluate(() => {
    window.__retiredPlayer = window.__fakePlayer;
    window.__retiredPlayer.options.events.onError({ target: window.__retiredPlayer, data: 153 });
  });
  await page.waitForSelector('.message[role="alert"]');
  check(await page.locator('.player-host iframe').count() === 0, 'failed player initialization removes the unusable frame');
  await page.evaluate(() => { window.__holdPlayerReady = false; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled);
  await page.evaluate(() => {
    const retired = window.__retiredPlayer;
    retired.options.events.onReady({ target: retired });
    retired.options.events.onStateChange({ target: retired, data: 1 });
    retired.options.events.onError({ target: retired, data: 101 });
  });
  check(await page.locator('.message[role="alert"]').count() === 0 && await page.locator('.is-playing').count() === 0 && await page.locator('.player-host iframe').count() === 1, 'late callbacks from a failed player cannot corrupt its replacement');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('.is-playing');
  check(await page.evaluate(() => window.__playerCreations === 2), 'replacement player remains usable after stale callbacks');
  check(errors.length === 0, 'recovery paths have no uncaught JavaScript errors');
  console.log(`${checks} UI and native-window checks passed.`);
} finally {
  await app?.close();
  await rm(userData, { recursive: true, force: true });
}

async function inputValue(page) { return page.getByLabel('YouTube video or playlist link', { exact: true }).inputValue(); }
