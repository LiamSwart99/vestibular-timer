const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    titleBarStyle: 'default',
    backgroundColor: '#F7F2EC',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  win.loadFile('index.html');
  // Uncomment to open DevTools:
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle file dialog for adding exercises
ipcMain.handle('open-file-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters || [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
  });
  return result;
});
