import path from "node:path"
import { app, BrowserWindow } from "electron"
import started from "electron-squirrel-startup"
import { registerElectronExposeRoutes } from "../generated/electron-expose/main"

if (started) {
  app.quit()
}

registerElectronExposeRoutes()

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 520,
    height: 500,
    minWidth: 420,
    minHeight: 440,
    title: "Electron Expose Calculator",
    backgroundColor: "#f5f3ee",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    )
  }
}

app.on("ready", createWindow)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
