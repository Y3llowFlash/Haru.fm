import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { _electron } from 'playwright';

// An optional external-service check, separate from deterministic regression checks.
// Uses the example video from YouTube's official IFrame API documentation.
const root = path.resolve(import.meta.dirname, '..');
const userData = await mkdtemp(path.join(os.tmpdir(), 'haru-live-'));
const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const headless = process.platform === 'linux' && !process.env.DISPLAY;
const args = [...(headless ? ['--headless', '--ozone-platform=headless'] : []), ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--disable-gpu', path.join(root, 'tests/fixtures/electron-main.cjs')];
const report = { status: 'running', date: new Date().toISOString(), platform: process.platform, videoId: 'M7lc1UVf-VE', checks: [], failedRequests: [], error: '', limitation: 'A runner cannot verify audible sound or playback on a user device.' };
let app;
let page;
const check = (condition, message) => { assert.ok(condition, message); report.checks.push(message); console.log(`PASS ${message}`); };

try {
  app = await _electron.launch({ args, cwd: root, env: { ...process.env, HARU_QA_USER_DATA: userData }, timeout: 30000 });
  page = await app.firstWindow();
  page.on('requestfailed', (request) => {
    if (report.failedRequests.length < 12) report.failedRequests.push({ host: new URL(request.url()).hostname, error: request.failure()?.errorText });
  });
  await page.waitForFunction(() => document.querySelector('#youtube-link')?.disabled === false);
  await page.getByLabel('YouTube video or playlist link', { exact: true }).fill(`https://www.youtube.com/watch?v=${report.videoId}`);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-button').disabled || document.querySelector('.message[role="alert"]'), null, { timeout: 50000 });
  const error = page.locator('.message[role="alert"]');
  if (await error.count()) throw new Error(await error.innerText());
  check(await page.locator('.player-host iframe').count() === 1, 'real YouTube IFrame API initialized');
  check(await page.getByRole('button', { name: 'Play', exact: true }).count() === 1, 'loading did not autoplay');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.is-playing') || document.querySelector('.message[role="alert"]'), null, { timeout: 60000 });
  if (await error.count()) throw new Error(await error.innerText());
  await page.waitForFunction(() => {
    const current = document.querySelector('.time-display').textContent.split('/')[0].trim().split(':').reduce((sum, value) => sum * 60 + Number(value), 0);
    return current >= 2;
  }, null, { timeout: 40000 });
  check(true, 'real YouTube playback reported playing and advanced its time');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.monitor-label').textContent.includes('PAUSED'));
  check(true, 'custom Pause paused real YouTube playback');
  await page.getByRole('button', { name: 'Switch to Mini Mode', exact: true }).click();
  await page.waitForSelector('.app-window.mini');
  const frame = await page.locator('.player-host iframe').boundingBox();
  check(frame.width >= 200 && frame.height >= 200, 'real player remains visible in Mini Mode');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('.is-playing');
  check(true, 'real player resumes after a layout change');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  console.error(`Live YouTube check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (page) {
    report.playerMessage = await page.locator('.message').textContent().catch(() => '');
    await page.screenshot({ path: path.join(output, 'live-player.png'), fullPage: true }).catch(() => {});
  }
  await writeFile(path.join(output, 'live-player.json'), JSON.stringify(report, null, 2));
  await app?.close();
  await rm(userData, { recursive: true, force: true });
}
