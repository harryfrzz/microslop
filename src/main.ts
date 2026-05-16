import { app, BrowserWindow, desktopCapturer, ipcMain, shell } from 'electron';
import path from 'node:path';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const backendUrl = process.env.MICROSLOP_BACKEND_URL || 'http://127.0.0.1:8765';
let mainWindow: BrowserWindow | null = null;
let captureTimer: NodeJS.Timeout | null = null;
let captureEnabled = false;
let captureIntervalSeconds = 5;
let lastCaptureResult: unknown = null;

const getDataFolder = () => path.join(process.cwd(), 'app-data');

const getActiveWindow = async (): Promise<{ appName: string; windowTitle: string }> => {
  if (process.platform !== 'darwin') {
    return { appName: '', windowTitle: '' };
  }
  return new Promise((resolve) => {
    const script = 'tell application "System Events" to tell (first process whose frontmost is true) to return {name, name of front window}';
    execFile('osascript', ['-e', script], { timeout: 1200 }, (error, stdout) => {
      if (error) {
        resolve({ appName: '', windowTitle: '' });
        return;
      }
      const [appName = '', windowTitle = ''] = stdout.trim().split(', ');
      resolve({ appName, windowTitle });
    });
  });
};

const getSettings = async () => {
  try {
    const response = await fetch(`${backendUrl}/settings`);
    if (response.ok) {
      const settings = await response.json();
      captureIntervalSeconds = Number(settings.captureIntervalSeconds || 5);
      captureEnabled = Boolean(settings.captureEnabled);
      return settings;
    }
  } catch {
    // UI status endpoint reports backend connection failures.
  }
  return null;
};

const sendCapture = async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
  const source = sources[0];
  if (!source) {
    throw new Error('No screen source available. Check screen recording permissions.');
  }
  const png = source.thumbnail.toPNG();
  const hash = crypto.createHash('sha256').update(png).digest('hex');
  const active = await getActiveWindow();
  const form = new FormData();
  form.append('screenshot', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'capture.png');
  form.append('timestamp', new Date().toISOString());
  form.append('appName', active.appName);
  form.append('windowTitle', active.windowTitle);
  form.append('screenHash', hash);
  const response = await fetch(`${backendUrl}/capture/index`, { method: 'POST', body: form });
  lastCaptureResult = await response.json();
  mainWindow?.webContents.send('capture:result', lastCaptureResult);
  return lastCaptureResult;
};

const stopCaptureLoop = () => {
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
};

const startCaptureLoop = async () => {
  await getSettings();
  captureEnabled = true;
  stopCaptureLoop();
  void sendCapture().catch((error) => {
    lastCaptureResult = { status: 'failed', error: String(error.message || error) };
  });
  captureTimer = setInterval(() => {
    if (captureEnabled) {
      void sendCapture().catch((error) => {
        lastCaptureResult = { status: 'failed', error: String(error.message || error) };
      });
    }
  }, captureIntervalSeconds * 1000);
  return { captureEnabled, captureIntervalSeconds };
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'microslop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

ipcMain.handle('capture:start', async () => {
  await fetch(`${backendUrl}/privacy/resume`, { method: 'POST' }).catch((): null => null);
  return startCaptureLoop();
});

ipcMain.handle('capture:pause', async () => {
  captureEnabled = false;
  stopCaptureLoop();
  await fetch(`${backendUrl}/privacy/pause`, { method: 'POST' }).catch((): null => null);
  return { captureEnabled };
});

ipcMain.handle('capture:now', async () => sendCapture());

ipcMain.handle('capture:state', async () => ({ captureEnabled, captureIntervalSeconds, lastCaptureResult }));

ipcMain.handle('data:open-folder', async () => {
  await shell.openPath(getDataFolder());
  return getDataFolder();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
