const fs = require('node:fs');
const path = require('node:path');

const defaults = Object.freeze({
  mode: 'cozy', alwaysOnTop: false, volume: 65, muted: false, lastInput: '', animations: true,
  cozyBounds: null, miniBounds: null,
});

function sanitizePreferences(input) {
  const result = { ...defaults };
  if (!input || typeof input !== 'object') return result;
  result.mode = input.mode === 'mini' ? 'mini' : 'cozy';
  result.alwaysOnTop = input.alwaysOnTop === true;
  result.animations = input.animations !== false;
  result.muted = input.muted === true;
  if (Number.isFinite(input.volume)) result.volume = Math.round(Math.max(0, Math.min(100, input.volume)));
  if (typeof input.lastInput === 'string') result.lastInput = input.lastInput.slice(0, 2048);
  for (const key of ['cozyBounds', 'miniBounds']) {
    const bounds = input[key];
    if (bounds && ['x', 'y', 'width', 'height'].every((name) => Number.isFinite(bounds[name]))) {
      result[key] = {
        x: Math.round(bounds.x), y: Math.round(bounds.y),
        width: Math.round(Math.max(420, Math.min(1000, bounds.width))),
        height: Math.round(Math.max(540, Math.min(1200, bounds.height))),
      };
    }
  }
  return result;
}

function createPreferenceStore(file) {
  let current = { ...defaults };
  try { current = sanitizePreferences(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* First run or invalid settings. */ }
  return {
    get: () => ({ ...current }),
    update(patch) {
      current = sanitizePreferences({ ...current, ...patch });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(current, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, file);
      return { ...current };
    },
  };
}

module.exports = { defaults, sanitizePreferences, createPreferenceStore };
