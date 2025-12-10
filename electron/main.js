const { app, BrowserWindow } = require("electron")
const path = require("path")
const fs = require("fs")

function loadConfig() {
    const configPath = path.join(__dirname, "config.json")
    const configData = fs.readFileSync(configPath, "utf-8")
    return JSON.parse(configData)
}

function buildSteamUrl(config) {
    const url = new URL("/_steam", config.endpoint)
    for (const source of config.sources) {
        url.searchParams.append("source", source)
    }
    return url.toString()
}

function createWindow() {
    const config = loadConfig()

    const win = new BrowserWindow({
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    })

    win.loadURL(buildSteamUrl(config))

    // Hide menu bar completely
    win.setMenuBarVisibility(false)

    // win.webContents.openDevTools()
}

app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
    app.quit()
})
