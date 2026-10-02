import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { _electron } from 'playwright';
const root = path.resolve(import.meta.dirname, '..');
const userData = await mkdtemp(path.join(os.tmpdir(), 'haru-queue-'));
const fixture = await readFile(path.join(root, 'tests/fixtures/youtube-api.js'), 'utf8');
const args = [...(process.platform === 'linux' && !process.env.DISPLAY ? ['--headless', '--ozone-platform=headless'] : []), ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--disable-gpu', path.join(root, 'tests/fixtures/electron-main.cjs')];
let app, page, checks = 0;
function pass(message) { checks++; console.log(`PASS ${message}`); }
async function launch() {
  app = await _electron.launch({ args, cwd: root, env: { ...process.env, HARU_QA_USER_DATA: userData } });
  page = await app.firstWindow();
  await page.waitForFunction(() => !document.querySelector('#youtube-link')?.disabled);
  await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('haru:metadata'); ipcMain.handle('haru:metadata', (_, id) => ({ title: `Song ${id}`, author: 'Test artist' })); });
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.evaluate(fixture);
}
async function add(id) { await page.getByLabel('YouTube video or playlist link', { exact: true }).fill(`https://youtu.be/${id}`); await page.getByRole('button', { name: 'Add', exact: true }).click(); }
async function current(id, status = 'playing') { await page.waitForFunction(([id, status]) => window.__fakePlayer?.id === id && window.__fakePlayer.playbackState === status, [id, status === 'playing' ? 1 : 5]); }
try {
  await launch();
  await add('jfKfPfyJRdk'); await add('5qap5aO4i9A'); await add('DWcJFNfaw9c');
  assert.equal(await page.locator('.queue-tracks > li').count(), 3); assert.equal(await page.evaluate(() => window.__playerCreations), 0); pass('adding videos does not start playback');
  await page.getByRole('button', { name: 'Play queue', exact: true }).click(); await current('jfKfPfyJRdk'); pass('Play queue starts its first video');
  await page.locator('.queue-tracks > li').nth(2).getByRole('button', { name: 'Play next', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.haru.getLibrary().then(x => x.queue.map(t => t.videoId))), ['jfKfPfyJRdk', 'DWcJFNfaw9c', '5qap5aO4i9A']); pass('Play next edits order around current entry');
  await page.evaluate(() => window.__fakePlayer.state(0)); await current('DWcJFNfaw9c'); pass('ended advances once and plays the next video');
  await page.getByRole('button', { name: 'Move track 2 down', exact: true }).click();
  assert.equal(await page.locator('.current-track').getAttribute('data-track-id'), (await page.evaluate(() => window.haru.getLibrary())).queue[2].id); pass('reordering preserves currently playing entry');
  await page.evaluate(() => window.__fakePlayer.state(0)); await page.waitForTimeout(150); assert.equal(await page.evaluate(() => window.__fakePlayer.playbackState), 0); pass('queue end stops without wrapping');
  await page.getByLabel('Playlist name', { exact: true }).fill('Focus'); await page.getByRole('button', { name: 'Save new', exact: true }).click();
  await page.waitForFunction(() => window.haru.getLibrary().then(x => x.playlists.length === 1));
  await page.getByLabel('Playlist name', { exact: true }).fill('Focus mix'); await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.waitForFunction(() => window.haru.getLibrary().then(x => x.playlists[0].name === 'Focus mix')); pass('save and rename a local playlist');
  await page.getByRole('button', { name: 'Append', exact: true }).click(); await page.waitForFunction(() => window.haru.getLibrary().then(x => x.queue.length === 6)); pass('append creates independent queue entries');
  await page.getByRole('button', { name: 'Replace queue', exact: true }).click(); await page.waitForFunction(() => window.haru.getLibrary().then(x => x.queue.length === 3));
  await page.getByRole('button', { name: 'Play queue', exact: true }).click(); await current('jfKfPfyJRdk');
  await page.evaluate(() => window.__fakePlayer.options.events.onError({ target: window.__fakePlayer, data: 101 })); await page.waitForSelector('.unavailable-track');
  await page.getByRole('button', { name: 'Next track', exact: true }).click(); await current('5qap5aO4i9A'); pass('unavailable row stays visible and Next skips it');
  await page.getByRole('button', { name: 'Remove track 2', exact: true }).click(); await current('DWcJFNfaw9c'); pass('removing current song advances while playing');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(720, 540));
  await page.waitForTimeout(150);
  const geometry = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { width: innerWidth, height: innerHeight, video: rect('.player-viewport'), room: rect('.room'), hidden: document.querySelector('.monitor').hidden, queue: rect('.queue-panel'), form: rect('.link-form'), footer: rect('footer'), creations: window.__playerCreations };
  });
  assert.ok(geometry.hidden && geometry.video.height === 0 && geometry.room.height >= 190 && Math.abs(geometry.room.width / geometry.room.height - 1.5) < .01, JSON.stringify(geometry));
  assert.ok(geometry.room.right <= geometry.queue.left && geometry.queue.right <= geometry.width && geometry.form.bottom <= geometry.height && geometry.footer.bottom <= geometry.height, JSON.stringify(geometry));
  assert.equal(geometry.creations, 1); pass('smallest expanded Home window shows a large retro room and keeps the same player');
  await mkdir(path.join(root, 'test-results'), { recursive: true }); await page.screenshot({ path: path.join(root, 'test-results/queue-cozy.png') });
  await page.getByRole('button', { name: 'Switch to Mini Mode', exact: true }).click(); await page.waitForSelector('.app-window.mini'); assert.equal(await page.locator('.queue-panel').count(), 0);
  await page.getByRole('button', { name: 'Show queue', exact: true }).click(); await page.waitForSelector('.queue-panel');
  await page.screenshot({ path: path.join(root, 'test-results/queue-mini.png') }); assert.equal(await page.evaluate(() => window.__playerCreations), 1); pass('Mini starts closed and can open queue without remounting');
  await page.getByRole('button', { name: 'Close queue', exact: true }).click();
  await page.getByLabel('YouTube video or playlist link', { exact: true }).fill('https://www.youtube.com/playlist?list=PL1234567890abc'); await page.getByRole('button', { name: 'Add', exact: true }).click(); await page.getByRole('alert').waitFor(); pass('playlist-only Add rejects full playlist import');
  await page.getByRole('button', { name: 'Show queue', exact: true }).click(); await page.waitForSelector('.queue-panel');
  await page.evaluate(() => { window.__holdCueState = true; });
  await page.getByRole('button', { name: 'Play queued track 1', exact: true }).click();
  await page.waitForFunction(() => typeof window.__completeCue === 'function');
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await page.evaluate(() => { window.__completeCue(); window.__holdCueState = false; });
  await page.waitForTimeout(100); assert.notEqual(await page.evaluate(() => window.__fakePlayer.playbackState), 1); pass('clearing during a pending cue cancels automatic playback');
  const playlistId = (await page.evaluate(() => window.haru.getLibrary())).playlists[0].id;
  await page.getByLabel('Saved playlist', { exact: true }).selectOption(playlistId);
  await page.getByRole('button', { name: 'Replace queue', exact: true }).click();
  await page.waitForFunction(() => window.haru.getLibrary().then(x => x.queue.length === 3));
  await page.getByRole('button', { name: 'Play queue', exact: true }).click(); await current('jfKfPfyJRdk');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Remove track 1', exact: true }).click(); await current('5qap5aO4i9A', 'cued'); pass('removing a paused current track cues its successor without autoplay');
  const saved = await page.evaluate(() => window.haru.getLibrary()); await app.close(); await launch();
  assert.deepEqual(await page.evaluate(() => window.haru.getLibrary()), saved); assert.equal(await page.evaluate(() => window.__playerCreations), 0); pass('queue and playlists survive restart without autoplay');
  await page.getByRole('button', { name: 'Show queue', exact: true }).click(); await page.waitForSelector('.queue-panel'); await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await page.waitForFunction(() => window.haru.getLibrary().then(x => x.queue.length === 0 && x.playlists.length === 1)); pass('clearing queue preserves saved playlists');
  await page.getByLabel('Saved playlist', { exact: true }).selectOption(saved.playlists[0].id);
  await page.getByRole('button', { name: 'Delete playlist', exact: true }).click(); assert.equal((await page.evaluate(() => window.haru.getLibrary())).playlists.length, 1);
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click(); await page.waitForFunction(() => window.haru.getLibrary().then(x => x.playlists.length === 0)); pass('delete requires explicit inline confirmation');
  console.log(`${checks} queue and playlist checks passed.`);
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }); }
