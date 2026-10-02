import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { sanitizeLibrary, moveTrack, playNext, MAX_TRACKS } from '../shared/queue.mjs';
const { createLibraryStore } = createRequire(import.meta.url)('../desktop/library.cjs');
const track = (id, videoId = 'jfKfPfyJRdk') => ({ id, videoId, startSeconds: 0, title: id, author: '' });
test('queue edits preserve entry identity, duplicates and current-relative play next', () => {
  const queue = ['a', 'b', 'c', 'd'].map(id => track(id));
  assert.deepEqual(moveTrack(queue, 'd', 0).map(x => x.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(playNext(queue, 'a', 'c').map(x => x.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(playNext(queue, 'd', null).map(x => x.id), ['d', 'a', 'b', 'c']);
  assert.equal(playNext(queue, 'c', 'c'), queue);
  assert.equal(sanitizeLibrary({ queue }).queue.length, 4);
  assert.deepEqual(queue.map(x => x.id), ['a', 'b', 'c', 'd']);
});
test('library bounds and validates untrusted tracks and playlists', () => {
  const library = sanitizeLibrary({ queue: [track('a'), track('a'), track('bad', 'https://evil'), { ...track('b'), title: 'x'.repeat(1000), startSeconds: Infinity }], playlists: [{ id: 'p', name: '  Focus  ', tracks: [track('a')] }, { id: 'bad', name: '' }] });
  assert.equal(library.queue.length, 2);
  assert.equal(library.queue[1].title.length, 500);
  assert.equal(library.queue[1].startSeconds, 0);
  assert.equal(library.playlists[0].name, 'Focus');
  assert.equal(library.playlists.length, 1);
  assert.equal(sanitizeLibrary({ queue: Array.from({ length: 600 }, (_, index) => track(`id${index}`)) }).queue.length, MAX_TRACKS);
  assert.deepEqual(sanitizeLibrary(null), { queue: [], playlists: [] });
});
test('atomic native library saves survive restart without shared mutable snapshots', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'haru-library-'));
  try {
    const file = path.join(dir, 'library.json');
    const store = await createLibraryStore(file);
    store.save({ queue: [track('a')], playlists: [{ id: 'p', name: 'Focus', tracks: [track('a')] }] });
    store.get().queue.length = 0;
    assert.equal(store.get().queue.length, 1);
    assert.deepEqual((await createLibraryStore(file)).get(), JSON.parse(await readFile(file, 'utf8')));
    store.save({ queue: [], playlists: store.get().playlists });
    assert.equal((await createLibraryStore(file)).get().playlists[0].tracks.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
