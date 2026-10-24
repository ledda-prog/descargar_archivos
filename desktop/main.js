'use strict';

const path = require('node:path');
const { app, BrowserWindow, dialog, session, shell } = require('electron');

let mainWindow;
let localServer;
let quitting = false;

function bundledBinary(name) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', name)
    : null;
}

function configureRuntime() {
  process.env.YT_DLP_PATH = bundledBinary('yt-dlp.exe')
    || require.resolve('youtube-dl-exec/bin/yt-dlp.exe');
  process.env.FFMPEG_PATH = bundledBinary('ffmpeg.exe')
    || require('ffmpeg-static');
  process.env.PUBLIC_BASE_URL ||= 'https://media-hub-umber.vercel.app';
}

async function createWindow() {
  configureRuntime();
  const { startServer } = require('../backend/server');
  localServer = await startServer({ host: '127.0.0.1', port: 0, installSignalHandlers: false });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Guardar con MediaHub', buttonLabel: 'Guardar' });
  });

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    show: false,
    backgroundColor: '#07111f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(wa\.me|github\.com)\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localServer.url)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(localServer.url);
}

async function shutdown() {
  if (quitting) return;
  quitting = true;
  await localServer?.close();
}

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox('MediaHub no pudo iniciar', error.message);
  app.quit();
});

app.on('before-quit', (event) => {
  if (quitting || !localServer) return;
  event.preventDefault();
  shutdown().finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
