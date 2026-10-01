const { app, BrowserWindow, ipcMain, session, shell, screen, powerMonitor } = require('electron');
const path = require('node:path');
const { createStaticServer } = require('./server.cjs');
const { createPreferenceStore } = require('./preferences.cjs');
const { isTrustedIPC, isSafeYouTubeURL, isDevelopmentURL } = require('./security.cjs');

app.setName('Haru.fm');
app.setAppUserModelId('fm.haru.desktop');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();

let mainWindow;
let localServer;
let preferences;
let appOrigin;
let saveTimer;
let changingMode = false;
const metadataCache = new Map();

function safeSave(patch) {
  try { return preferences.update(patch); }
  catch (error) { console.error('Could not save preferences:', error.message); return preferences.get(); }
}

function fitBounds(mode, saved) {
  const fallback = { width: mode === 'mini' ? 440 : 500, height: mode === 'mini' ? 570 : 880 };
  const area = saved ? screen.getDisplayMatching(saved).workArea : screen.getPrimaryDisplay().workArea;
  const width = Math.max(420, Math.min(saved?.width || fallback.width, area.width));
  const height = Math.max(540, Math.min(saved?.height || fallback.height, area.height));
  return {
    width, height,
    x: Math.max(area.x, Math.min(saved?.x ?? area.x + area.width - width - 30, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(saved?.y ?? area.y + Math.round((area.height - height) / 2), area.y + area.height - height)),
  };
}

function captureBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || changingMode) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      safeSave({ [`${preferences.get().mode}Bounds`]: mainWindow.getBounds() });
    }
  }, 250);
}

function sendSuspendState(suspended) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('haru:suspend', suspended);
}

function registerIPC() {
  function handle(channel, handler) {
    ipcMain.handle(channel, (event, value) => {
      if (!mainWindow || !isTrustedIPC(event, mainWindow, appOrigin)) throw new Error('Untrusted window.');
      return handler(value);
    });
  }
  handle('haru:preferences:get', () => preferences.get());
  handle('haru:preferences:save', (patch) => {
    const allowed = {};
    if (patch && typeof patch === 'object') {
      if (Number.isFinite(patch.volume)) allowed.volume = patch.volume;
      if (typeof patch.muted === 'boolean') allowed.muted = patch.muted;
      if (typeof patch.lastInput === 'string') allowed.lastInput = patch.lastInput.slice(0, 2048);
      if (typeof patch.animations === 'boolean') allowed.animations = patch.animations;
    }
    return safeSave(allowed);
  });
  handle('haru:pin', (value) => {
    if (typeof value !== 'boolean') throw new Error('Invalid pin state.');
    mainWindow.setAlwaysOnTop(value);
    safeSave({ alwaysOnTop: value });
    return mainWindow.isAlwaysOnTop();
  });
  handle('haru:mode', (mode) => {
    if (!['cozy', 'mini'].includes(mode)) throw new Error('Invalid layout.');
    const previous = preferences.get();
    clearTimeout(saveTimer);
    const next = safeSave({ mode, [`${previous.mode}Bounds`]: mainWindow.getBounds() });
    changingMode = true;
    mainWindow.setBounds(fitBounds(mode, next[`${mode}Bounds`]));
    changingMode = false;
    return mode;
  });
  handle('haru:minimize', () => mainWindow.minimize());
  handle('haru:close', () => mainWindow.close());
  handle('haru:open-youtube', (url) => {
    if (!isSafeYouTubeURL(url)) throw new Error('Only YouTube links are allowed.');
    return shell.openExternal(url);
  });
  handle('haru:metadata', async (videoId) => {
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video.');
    if (metadataCache.has(videoId)) return metadataCache.get(videoId);
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) return null;
      const data = await response.json();
      const metadata = { title: String(data.title || 'YouTube video').slice(0, 500), author: String(data.author_name || 'YouTube').slice(0, 200) };
      if (metadataCache.size >= 100) metadataCache.delete(metadataCache.keys().next().value);
      metadataCache.set(videoId, metadata);
      return metadata;
    } catch { return null; }
  });
}

async function createWindow() {
  const current = preferences.get();
  let entry;
  if (!app.isPackaged && process.env.HARU_DEV_URL) {
    if (!isDevelopmentURL(process.env.HARU_DEV_URL)) throw new Error('Development server must be on localhost.');
    entry = process.env.HARU_DEV_URL;
  } else {
    localServer = await createStaticServer(path.join(__dirname, '../dist'));
    entry = localServer.url;
  }
  appOrigin = new URL(entry).origin;
  const appSession = session.fromPartition('persist:haru-fm');
  appSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  appSession.setPermissionCheckHandler(() => false);
  // The official embed requires desktop app identity. Restrict this header to YouTube requests.
  appSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    for (const name of Object.keys(headers)) if (name.toLowerCase() === 'referer') delete headers[name];
    headers.Referer = 'https://fm.haru.desktop/';
    callback({ requestHeaders: headers });
  });
  mainWindow = new BrowserWindow({
    ...fitBounds(current.mode, current[`${current.mode}Bounds`]),
    minWidth: 420, minHeight: 540, frame: false, show: false, resizable: true,
    title: 'Haru.fm', backgroundColor: '#111722', alwaysOnTop: current.alwaysOnTop,
    icon: path.join(__dirname, '../dist/app.png'), autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), session: appSession,
      nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true,
      sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, autoplayPolicy: 'document-user-activation-required',
      // Keep the existing embedded player and its timers active when minimized
      // or covered. Window visibility is separate from a system suspend.
      backgroundThrottling: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeYouTubeURL(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.on('resize', captureBounds);
  mainWindow.on('move', captureBounds);
  mainWindow.on('close', () => {
    clearTimeout(saveTimer);
    if (!mainWindow.isMinimized()) safeSave({ [`${preferences.get().mode}Bounds`]: mainWindow.getBounds() });
  });
  mainWindow.on('closed', () => { mainWindow = null; app.quit(); });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(entry);
}

if (locked) {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    preferences = createPreferenceStore(path.join(app.getPath('userData'), 'preferences.json'));
    registerIPC();
    powerMonitor.on('suspend', () => sendSuspendState(true));
    powerMonitor.on('resume', () => sendSuspendState(false));
    await createWindow();
  }).catch((error) => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { clearTimeout(saveTimer); localServer?.close(); });
}
