const { app, BrowserWindow, ipcMain, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const cron = require('node-cron');

// --- Paths ---
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');
const isDev = !app.isPackaged;
const projectRoot = path.join(__dirname, '..');

// Backend and daemon live inside the application package (asar or project directory).
function getBackendDir() {
  return path.join(projectRoot, 'backend');
}

function getDaemonDir() {
  return path.join(projectRoot, 'daemon');
}

// Frontend dist dirs always live in the asar (or project root in dev).
function getKioskDistPath() {
  return path.join(projectRoot, 'kiosk-app', 'dist');
}

function getMobileDistPath() {
  return path.join(projectRoot, 'mobile-app', 'dist');
}

// Uploads dir should be writable — use userData in production.
function getUploadsDir() {
  if (isDev) return path.join(projectRoot, 'backend', 'uploads');
  const dir = path.join(userDataPath, 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let setupWindow = null;
let kioskWindow = null;
let backendProcess = null;
let daemonProcess = null;
let cloudflaredProcess = null;

// --- Settings I/O ---
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading settings:', e);
  }
  return {};
}

function saveSettingsToDisk(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// --- Window Creation ---
function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 600,
    height: 720,
    frame: false,
    resizable: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  setupWindow.on('closed', () => { setupWindow = null; });
}

function createKioskWindow(port, mobileUrl, publicUrl) {
  kioskWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    kiosk: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const kioskUrl = `http://localhost:${port}/kiosk?mobileUrl=${encodeURIComponent(mobileUrl)}&backendUrl=${encodeURIComponent(publicUrl)}`;
  console.log(`[Main] Loading Kiosk URL: ${kioskUrl}`);
  kioskWindow.loadURL(kioskUrl);

  // Admin escape: Ctrl+Shift+Q to exit kiosk mode
  kioskWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key === 'Q') {
      app.quit();
    }
  });
  
  kioskWindow.on('closed', () => { kioskWindow = null; });
}

// --- Server Management ---
function waitForServer(url, maxRetries = 30, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const http = require('http');
    
    const check = () => {
      attempts++;
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (attempts >= maxRetries) {
          reject(new Error(`Server at ${url} did not start in time`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
    };
    check();
  });
}

function startBackendServer(settings) {
  return new Promise((resolve, reject) => {
    const backendDir = getBackendDir();
    const entryFile = path.join(backendDir, 'dist', 'index.js');
    
    console.log(`[Main] isDev=${isDev}`);
    console.log(`[Main] Backend dir: ${backendDir}`);
    console.log(`[Main] Entry file: ${entryFile}`);
    console.log(`[Main] Entry file exists: ${fs.existsSync(entryFile)}`);
    
    backendProcess = utilityProcess.fork(entryFile, [], {
      cwd: process.resourcesPath,
      env: { 
        ...process.env, 
        PORT: '4000',
        RAZORPAY_KEY_ID: settings?.RAZORPAY_KEY_ID || '',
        RAZORPAY_KEY_SECRET: settings?.RAZORPAY_KEY_SECRET || '',
        CUSTOM_DOMAIN: settings?.CUSTOM_DOMAIN || '',
        KIOSK_DIST_PATH: getKioskDistPath(),
        MOBILE_DIST_PATH: getMobileDistPath(),
        UPLOADS_DIR: getUploadsDir(),
      },
      stdio: 'pipe'
    });

    const logFilePath = path.join(userDataPath, 'app-services.log');
    fs.appendFileSync(logFilePath, `\n--- START BACKEND --- ${new Date().toISOString()}\n`);

    backendProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      console.log('[Backend]', msg);
      fs.appendFileSync(logFilePath, `[Backend] ${msg}\n`);
    });

    backendProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error('[Backend Err]', msg);
        fs.appendFileSync(logFilePath, `[Backend Err] ${msg}\n`);
      }
    });

    backendProcess.on('exit', (code) => {
      console.error(`[Main] Backend process exited with code: ${code}`);
      fs.appendFileSync(logFilePath, `[Main] Backend process exited with code: ${code}\n`);
    });

    waitForServer('http://localhost:4000/api/health')
      .then(() => {
        console.log('[Main] Backend is ready!');
        resolve(4000);
      })
      .catch(reject);
  });
}

function startDaemonServer() {
  return new Promise((resolve, reject) => {
    const daemonDir = getDaemonDir();
    const entryFile = path.join(daemonDir, 'dist', 'index.js');
    
    console.log(`[Main] Daemon dir: ${daemonDir}`);
    console.log(`[Main] Daemon entry: ${entryFile}`);
    console.log(`[Main] Daemon entry exists: ${fs.existsSync(entryFile)}`);
    
    daemonProcess = utilityProcess.fork(entryFile, [], {
      cwd: process.resourcesPath,
      env: { ...process.env },
      stdio: 'pipe'
    });

    const logFilePath = path.join(userDataPath, 'app-services.log');
    fs.appendFileSync(logFilePath, `\n--- START DAEMON --- ${new Date().toISOString()}\n`);

    daemonProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      console.log('[Daemon]', msg);
      fs.appendFileSync(logFilePath, `[Daemon] ${msg}\n`);
    });

    daemonProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error('[Daemon Err]', msg);
        fs.appendFileSync(logFilePath, `[Daemon Err] ${msg}\n`);
      }
    });

    daemonProcess.on('exit', (code) => {
      console.error(`[Main] Daemon process exited with code: ${code}`);
      fs.appendFileSync(logFilePath, `[Main] Daemon process exited with code: ${code}\n`);
    });

    setTimeout(() => {
      console.log('[Main] Daemon started (timeout)');
      resolve(4001);
    }, 4000);
  });
}

// --- Auto Updater ---
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded. App will update on restart.');
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error in auto-updater:', err);
  });

  // Check on startup
  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch(e) {}

  // Schedule cron job to check every day at 3:00 AM
  cron.schedule('0 3 * * *', () => {
    console.log('[AutoUpdater] Running scheduled check at 3:00 AM');
    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch(e) {}
  });
}

// --- IPC Handlers ---
ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    saveSettingsToDisk(settings);
    await launchKiosk(settings);
    return { success: true };
  } catch (err) {
    console.error('[Main] Launch error:', err);
    return { success: false, error: err.message || 'Failed to start services' };
  }
});

async function launchKiosk(settings) {
  // 1. Start Backend
  console.log('[Main] Starting Backend...');
  const backendPort = await startBackendServer(settings);

  // 2. Start Daemon
  console.log('[Main] Starting Daemon...');
  await startDaemonServer();

  // 3. Start Cloudflare Tunnel
  console.log('[Main] Starting Cloudflare Tunnel...');
  const cloudflaredPath = isDev 
    ? path.join(__dirname, '..', 'bin', 'cloudflared.exe') 
    : path.join(process.resourcesPath, 'bin', 'cloudflared.exe');
    
  if (fs.existsSync(cloudflaredPath) && settings.CLOUDFLARE_TOKEN) {
    const { spawn } = require('child_process');
    cloudflaredProcess = spawn(cloudflaredPath, ['tunnel', '--no-autoupdate', 'run', '--token', settings.CLOUDFLARE_TOKEN], {
      detached: false,
      stdio: 'pipe'
    });
    
    cloudflaredProcess.stdout.on('data', (data) => console.log(`[Cloudflared] ${data}`));
    cloudflaredProcess.stderr.on('data', (data) => console.error(`[Cloudflared] ${data}`));
    cloudflaredProcess.on('exit', (code) => console.log(`[Cloudflared] Exited with code ${code}`));
  } else {
    console.error('[Main] Missing cloudflared.exe or Token!');
  }

  // 4. Set custom domain URL
  console.log('[Main] Configuring custom domain...');
  let publicUrl = settings.CUSTOM_DOMAIN.replace(/\/$/, "");
  if (!publicUrl.startsWith('http')) {
    publicUrl = 'https://' + publicUrl;
  }
  const mobileUrl = `${publicUrl}/mobile`;

  console.log(`[Main] Mobile URL: ${mobileUrl}`);
  console.log(`[Main] Backend URL: http://localhost:${backendPort}`);

  // 5. Close setup, open kiosk
  if (setupWindow) setupWindow.close();
  createKioskWindow(backendPort, mobileUrl, publicUrl);
}

// --- App Lifecycle ---
app.whenReady().then(() => {
  setupAutoUpdater();
  const settings = loadSettings();
  
  if (settings.CUSTOM_DOMAIN && settings.CLOUDFLARE_TOKEN && settings.RAZORPAY_KEY_ID && settings.RAZORPAY_KEY_SECRET) {
    launchKiosk(settings).catch((err) => {
      console.error('[Main] Auto-launch failed:', err);
      createSetupWindow();
    });
  } else {
    createSetupWindow();
  }
});

app.on('window-all-closed', () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
  if (daemonProcess) { daemonProcess.kill(); daemonProcess = null; }
  if (cloudflaredProcess) { cloudflaredProcess.kill(); cloudflaredProcess = null; }
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
  if (daemonProcess) { daemonProcess.kill(); daemonProcess = null; }
  if (cloudflaredProcess) { cloudflaredProcess.kill(); cloudflaredProcess = null; }
});
