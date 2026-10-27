'use strict';

// Electron main process. The renderer is the same Vite bundle as the web
// build, served from dist over a privileged app:// origin: file:// has no
// stable storage origin, and this app keeps projects in IndexedDB.
const { app, BrowserWindow, Menu, dialog, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const APP_SCHEME = 'app';
const APP_ORIGIN = `${APP_SCHEME}://terrain-o`;
const ENTRY_URL = `${APP_ORIGIN}/editor.html`;
const DEV_URL = process.env.TERRAIN_DEV_URL || 'http://127.0.0.1:5173/editor.html';
const DIST = path.join(__dirname, '..', 'dist');

// A packaged build always runs the bundled files. During development the Vite
// dev server is used unless TERRAIN_USE_DIST=1, which lets a test exercise the
// exact production bundle without installing anything.
const USE_DIST = app.isPackaged || process.env.TERRAIN_USE_DIST === '1';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

async function serveFromDist(request) {
  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filePath = path.resolve(DIST, relative || 'editor.html');

  // Path traversal must never leave the build directory.
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const body = await fs.readFile(filePath);
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

let mainWindow = null;

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function attachDownloadHandler() {
  // Exports are normal browser downloads; a real desktop program asks where to
  // put them instead of dropping files silently in Downloads.
  session.defaultSession.on('will-download', async (event, item) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    item.pause();
    const filename = item.getFilename() || 'export';
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva il file esportato',
      buttonLabel: 'Salva',
      defaultPath: path.join(app.getPath('documents'), filename),
      filters: [{ name: 'Tutti i file', extensions: ['*'] }],
    });
    if (canceled || !filePath) {
      item.cancel();
      return;
    }
    item.setSavePath(filePath);
    item.resume();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0e11',
    title: 'Terrain / O',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    const allowed = USE_DIST
      ? url.startsWith(APP_ORIGIN)
      : url.startsWith(APP_ORIGIN) || url.startsWith('http://127.0.0.1:5173');
    if (!allowed) {
      event.preventDefault();
      openExternal(url);
    }
  });

  void mainWindow.loadURL(USE_DIST ? ENTRY_URL : DEV_URL);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.setAppUserModelId('it.terraino.editor');

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  app.whenReady().then(() => {
    // The editor ships its own menu bar; the OS menu would duplicate it.
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    protocol.handle(APP_SCHEME, serveFromDist);
    attachDownloadHandler();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
