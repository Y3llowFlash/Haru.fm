import { useEffect, useRef, useState } from 'react';
import { emptyLibrary, sanitizeLibrary } from '../../shared/queue.mjs';
const key = 'haru-fm:library';
export function useQueueLibrary(onError) {
  const [library, setLibrary] = useState(emptyLibrary);
  const [ready, setReady] = useState(false);
  const current = useRef(library);
  const writes = useRef(Promise.resolve());
  const error = useRef(onError);
  error.current = onError;
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const value = window.haru ? await window.haru.getLibrary() : JSON.parse(localStorage.getItem(key) || 'null');
        if (alive) { current.current = sanitizeLibrary(value); setLibrary(current.current); }
      } catch { if (alive) error.current('Your saved queue could not be read.'); }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);
  function change(transform) {
    const next = sanitizeLibrary(transform(current.current));
    current.current = next;
    setLibrary(next);
    // Serialize snapshots so a slow save cannot overwrite a later edit.
    writes.current = writes.current.catch(() => {}).then(async () => {
      if (window.haru) await window.haru.saveLibrary(next);
      else localStorage.setItem(key, JSON.stringify(next));
    }).catch(() => error.current('Your queue or playlists could not be saved.'));
  }
  return { ...library, ready, change, current };
}
