export const MAX_TRACKS = 500;
export const MAX_PLAYLISTS = 50;
export const emptyLibrary = () => ({ queue: [], playlists: [] });
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
export function sanitizeTracks(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, MAX_TRACKS).flatMap(track => {
    if (!track || !validId(track.id) || seen.has(track.id) || !/^[A-Za-z0-9_-]{11}$/.test(track.videoId || '')) return [];
    seen.add(track.id);
    return [{ id: track.id, videoId: track.videoId, startSeconds: Number.isFinite(track.startSeconds) ? Math.round(Math.max(0, Math.min(604800, track.startSeconds))) : 0,
      title: typeof track.title === 'string' ? track.title.slice(0, 500) : '', author: typeof track.author === 'string' ? track.author.slice(0, 200) : '' }];
  });
}
export function sanitizeLibrary(value) {
  const seen = new Set();
  return { queue: sanitizeTracks(value?.queue), playlists: (Array.isArray(value?.playlists) ? value.playlists : []).slice(0, MAX_PLAYLISTS).flatMap(list => {
    if (!list || !validId(list.id) || seen.has(list.id) || typeof list.name !== 'string' || !list.name.trim()) return [];
    seen.add(list.id);
    return [{ id: list.id, name: list.name.trim().slice(0, 80), tracks: sanitizeTracks(list.tracks) }];
  }) };
}
export function moveTrack(tracks, id, position) {
  const from = tracks.findIndex(track => track.id === id);
  if (from < 0 || !Number.isInteger(position)) return tracks;
  const result = [...tracks];
  const [track] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(position, result.length)), 0, track);
  return result;
}
export function playNext(tracks, id, currentId) {
  if (id === currentId) return tracks;
  const remaining = tracks.filter(track => track.id !== id);
  const current = remaining.findIndex(track => track.id === currentId);
  return moveTrack(tracks, id, current < 0 ? 0 : current + 1);
}
export function trackSource(track) {
  return { kind: 'video', videoId: track.videoId, startSeconds: track.startSeconds, canonicalURL: `https://www.youtube.com/watch?v=${track.videoId}` };
}
