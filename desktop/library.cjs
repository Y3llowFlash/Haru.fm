const fs = require('node:fs');
const path = require('node:path');
async function createLibraryStore(file) {
  const { sanitizeLibrary } = await import('../shared/queue.mjs');
  let current;
  try { current = sanitizeLibrary(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { current = sanitizeLibrary(null); }
  return {
    get: () => structuredClone(current),
    save(value) {
      const next = sanitizeLibrary(value);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
      fs.renameSync(`${file}.tmp`, file);
      current = next;
      return structuredClone(current);
    },
  };
}
module.exports = { createLibraryStore };
