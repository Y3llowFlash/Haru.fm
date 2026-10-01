export const defaultPreferences = { mode: 'cozy', alwaysOnTop: false, volume: 65, muted: false, lastInput: '', animations: true };
const key = 'haru-fm:preferences';

export async function readPreferences() {
  try {
    const data = window.haru ? await window.haru.getPreferences() : JSON.parse(localStorage.getItem(key) || '{}');
    return { ...defaultPreferences, ...data };
  } catch { return { ...defaultPreferences }; }
}

export async function savePreferences(patch) {
  if (window.haru) return window.haru.savePreferences(patch);
  try {
    const previous = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...previous, ...patch }));
  } catch { /* Playback remains usable when storage is unavailable. */ }
}
