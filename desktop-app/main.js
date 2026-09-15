// ============================================================
//  Dombla Desktop — Electron Main Process (Simplified Debug)
// ============================================================

const { app, BrowserWindow, Menu, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Config & State ──────────────────────────────────────────
let mainWindow = null;

// ── Create Main Window ──────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: 'Dombla — Plant Monitor',
        backgroundColor: '#1e1f22',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            spellcheck: false,
        },
        frame: false,
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// ── IPC Handlers ────────────────────────────────────────────
function setupIPC() {
    ipcMain.handle('window:minimize', () => mainWindow?.minimize());
    ipcMain.handle('window:maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });
    ipcMain.handle('window:close', () => {
        mainWindow?.close();
    });
    ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());
    ipcMain.handle('app:getVersion', () => app.getVersion());
    ipcMain.handle('app:getPlatform', () => process.platform);
}

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(() => {
    console.log('[Dombla] App ready, creating window...');
    setupIPC();
    createWindow();
    console.log('[Dombla] Window created');
});

app.on('window-all-closed', () => {
    app.quit();
});
