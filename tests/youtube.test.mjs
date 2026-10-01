import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeInput, parseTimestamp, formatTime, playerErrorMessage } from '../src/lib/youtube.js';

const id = 'jfKfPfyJRdk';
const playlist = 'PLabcDEF0123456789';
test('accepts watch, short, mobile, Music, Shorts, live and embed links', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`,
    `https://m.youtube.com/watch?v=${id}`, `https://music.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`, `youtube.com/watch?v=${id}`, id,
  ]) { assert.equal(parseYouTubeInput(url).videoId, id); }
});
test('reads timestamps without allowing an unbounded seek', () => {
  assert.equal(parseYouTubeInput(`https://youtu.be/${id}?t=1h2m3s`).startSeconds, 3723);
  assert.equal(parseYouTubeInput(`https://www.youtube.com/watch?v=${id}#t=90`).startSeconds, 90);
  assert.equal(parseTimestamp('999999999s'), 604800);
  assert.equal(parseTimestamp('-10'), 0);
  assert.equal(parseTimestamp('1mgarbage'), 0);
});
test('playlist URLs preserve video and convert the one-based index', () => {
  const source = parseYouTubeInput(`https://www.youtube.com/watch?v=${id}&list=${playlist}&index=3`);
  assert.equal(source.kind, 'playlist'); assert.equal(source.playlistId, playlist);
  assert.equal(source.videoId, id); assert.equal(source.index, 2);
  assert.equal(parseYouTubeInput(`https://www.youtube.com/playlist?list=${playlist}`).index, 0);
});
test('rejects deceptive hosts, credentials, executable schemes and invalid IDs', () => {
  for (const input of ['', 'javascript:alert(1)', 'file:///etc/passwd',
    `https://youtube.com.attacker.test/watch?v=${id}`, `https://attacker.test/?v=${id}`,
    `https://youtube.com@attacker.test/watch?v=${id}`, `https://user:pass@youtube.com/watch?v=${id}`,
    `https://youtube.com:8443/watch?v=${id}`, 'https://youtu.be/short', 'https://youtube.com/watch', 'x'.repeat(2050),
  ]) assert.throws(() => parseYouTubeInput(input));
});
test('formats playback time and gives actionable embed errors', () => {
  assert.equal(formatTime(0), '0:00'); assert.equal(formatTime(65.9), '1:05');
  assert.equal(formatTime(3723), '1:02:03'); assert.equal(formatTime(NaN), '0:00');
  assert.match(playerErrorMessage(153), /identify/); assert.match(playerErrorMessage(101), /owner/);
});
