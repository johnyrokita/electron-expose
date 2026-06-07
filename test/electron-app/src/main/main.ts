import path from "node:path"
import { app, BrowserWindow } from "electron"
import { registerElectronExposeRoutes } from "../generated/electron-expose/main"

registerElectronExposeRoutes()

let _window: BrowserWindow | undefined
const isE2e = process.env.ELECTRON_EXPOSE_E2E === "1"

async function createWindow() {
  const createdWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 480,
    show: !isE2e,
    title: "Electron Expose Calculator",
    backgroundColor: "#f6f4ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  _window = createdWindow
  await createdWindow.loadFile(path.join(__dirname, "index.html"))

  if (isE2e) {
    try {
      const answer = await createdWindow.webContents.executeJavaScript(
        "window.api.math.calculate(6, 7, 'multiply')",
      )
      console.log(`E2E calculator answer: ${answer}`)
      app.quit()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  }
}

app.whenReady().then(() => {
  void createWindow()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})
