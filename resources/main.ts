import path from 'node:path'

import { app, BrowserWindow } from 'electron'

async function createWindow(): Promise<void> {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    webPreferences: {
      // This is our preload script, resolved relative to this file
      preload: path.join(import.meta.dirname, '../preload/index.js'),
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    // Use the Vite dev server URL if it exists, for development
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // Otherwise load the local index.html file, resolved relative to this file
    await mainWindow.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }

  // Open the DevTools
  mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished initialization and is
// ready to create browser windows, some APIs can only be used after this event
app.on('ready', () => createWindow().catch(console.error))

// Quit when all windows are closed, except on macOS, where it's common to
// keep the application and its menu bar active until the user quits
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// On OS X it's common to re-create a window in the app when the dock icon is
// clicked and there are no other windows open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(console.error)
  }
})
