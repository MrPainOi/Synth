const electron = require('electron');

// Auto-respawn with Electron if invoked via standard node
if (typeof electron === 'string') {
  const { spawn } = require('child_process');
  const child = spawn(electron, [__filename], { stdio: 'inherit' });
  child.on('close', (code) => process.exit(code || 0));
  return;
}

const { app, BrowserWindow, ipcMain } = electron;
const path = require('path');
const { startServer, stopServer, DEFAULT_PORT } = require('./server');

let mainWindow = null;
let serverPort = DEFAULT_PORT;

async function createWindow() {
  serverPort = await startServer(DEFAULT_PORT);

  const iconPath = path.join(__dirname, 'assets', 'spotify_logo_icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#121212',
    title: 'Synth 2 - Spotify Edition',
    icon: iconPath,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // Load via local server to ensure proper stream buffering & API access
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-state-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-state-change', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for frameless window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('get-server-port', () => {
  return serverPort;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
