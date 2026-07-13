const { app, BrowserWindow, Tray, Menu, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')

const log = (msg) => { try { console.log(msg) } catch (e) { if (e.code !== 'EPIPE') console.error(e) } }
const err = (msg) => { try { console.error(msg) } catch (e) { if (e.code !== 'EPIPE') console.error(e) } }

process.on('uncaughtException', (e) => {
  if (e.code === 'EPIPE') return
  err(`Uncaught exception: ${e.message}\n${e.stack}`)
})

process.on('unhandledRejection', (reason) => {
  err(`Unhandled rejection: ${reason}`)
})

let mainWindow = null
let tray = null
let backend = null
let quitting = false
let stderrBuf = ''
const logFile = path.join(app.getPath('userData'), 'backend.log')

function findAppRoot() {
  if (process.env.LOCAL_AI_ROOT) return process.env.LOCAL_AI_ROOT
  if (process.resourcesPath) {
    let p = process.resourcesPath
    while (p && p.length > 4) {
      if (fs.existsSync(path.join(p, 'backend', 'main.py'))) return p
      p = path.dirname(p)
    }
  }
  let p = path.dirname(app.getPath('exe'))
  while (p && p.length > 4) {
    if (fs.existsSync(path.join(p, 'backend', 'main.py'))) return p
    const parent = path.dirname(p)
    if (parent === p) break
    p = parent
  }
  return path.join(__dirname, '..')
}

function findModelFile() {
  if (process.env.LOCAL_AI_MODEL_PATH) return process.env.LOCAL_AI_MODEL_PATH
  const root = findAppRoot()
  const candidate = path.join(root, 'models', 'Llama-3.2-3B-Instruct-Q4_K_M.gguf')
  if (fs.existsSync(candidate)) return candidate
  return candidate
}

function findResource(p) {
  const absolute = path.resolve(p)
  if (fs.existsSync(absolute)) return absolute
  const root = findAppRoot()
  const resolved = path.join(root, p)
  if (fs.existsSync(resolved)) return resolved
  if (process.resourcesPath) {
    const res = path.join(process.resourcesPath, p)
    if (fs.existsSync(res)) return res
  }
  return absolute
}

function waitForServer(url, retries = 60) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      http.get(url, (res) => resolve())
        .on('error', () => {
          if (n <= 0) return reject(new Error('Backend did not start'))
          setTimeout(() => check(n - 1), 1000)
        })
    }
    check(retries)
  })
}

function stopBackend() {
  return new Promise((resolve) => {
    if (!backend) return resolve()
    backend.removeAllListeners()
    const timer = setTimeout(() => { backend = null; resolve() }, 3000)
    backend.on('exit', () => { clearTimeout(timer); backend = null; resolve() })
    backend.kill('SIGTERM')
    setTimeout(() => {
      try { backend.kill('SIGKILL') } catch (e) {}
    }, 2000)
  })
}

function startBackend() {
  const appRoot = findAppRoot()
  log(`App root: ${appRoot}`)

  const modelPath = findModelFile()
  if (!fs.existsSync(modelPath)) {
    const msg = `Model file not found:\n${modelPath}\n\nPlease download the model and place it at this path, or set the LOCAL_AI_MODEL_PATH environment variable.`
    err(msg)
    dialog.showErrorBox('Model Not Found', msg)
    return
  }
  log(`Model path: ${modelPath}`)
  process.env.LOCAL_AI_MODEL_PATH = modelPath

  const python = findResource(path.join('venv', 'Scripts', 'python.exe'))
  const script = findResource(path.join('backend', 'main.py'))
  log(`Python: ${python}`)
  log(`Script: ${script}`)

  if (!fs.existsSync(python)) {
    const msg = `Python interpreter not found:\n${python}\n\nPlease ensure the Python virtual environment is set up correctly.`
    err(msg)
    dialog.showErrorBox('Python Not Found', msg)
    return
  }

  stderrBuf = ''
  const logStream = fs.createWriteStream(logFile, { flags: 'w' })

  backend = spawn(python, [script], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LOCAL_AI_MODEL_PATH: modelPath },
  })

  logStream.write(`[${new Date().toISOString()}] Started backend (PID ${backend.pid})\n`)
  logStream.write(`  App root: ${appRoot}\n`)
  logStream.write(`  Model: ${modelPath}\n`)

  backend.stdout.on('data', (d) => {
    const txt = d.toString()
    logStream.write(`[stdout] ${txt}`)
    const lines = txt.trim().split('\n').filter(Boolean)
    for (const line of lines) log(`[backend] ${line}`)
  })

  backend.stderr.on('data', (d) => {
    const txt = d.toString()
    logStream.write(`[stderr] ${txt}`)
    stderrBuf += txt
    if (stderrBuf.length > 20000) stderrBuf = stderrBuf.slice(-20000)
    const lines = txt.trim().split('\n').filter(Boolean)
    for (const line of lines) err(`[backend] ${line}`)
  })

  backend.stdout.on('error', (e) => { if (e.code !== 'EPIPE') err(`Backend stdout error: ${e.message}`) })
  backend.stderr.on('error', (e) => { if (e.code !== 'EPIPE') err(`Backend stderr error: ${e.message}`) })

  backend.on('error', (e) => {
    err(`Backend spawn error: ${e.message}`)
    logStream.write(`[${new Date().toISOString()}] Spawn error: ${e.message}\n`)
    logStream.end()
    if (!quitting) dialog.showErrorBox('Backend Error', `Failed to start: ${e.message}`)
  })

  backend.on('exit', (code, signal) => {
    logStream.write(`[${new Date().toISOString()}] Exited with code ${code}, signal ${signal}\n`)
    logStream.end()
    if (backend && backend.exitCode !== null && backend.exitCode !== undefined) {
      if (!quitting && code !== 0 && code !== null) {
        const lastStderr = stderrBuf.slice(-500)
        dialog.showErrorBox('Backend Crashed', `Exit code: ${code}\n\nLast stderr:\n${lastStderr}`)
      }
    }
    backend = null
  })

  backend.on('close', (code) => {
    if (!quitting && code !== 0 && code !== null) {
      const lastStderr = stderrBuf.slice(-500)
      dialog.showErrorBox('Backend Crashed', `Backend exited with code ${code}\n\nLast stderr:\n${lastStderr}`)
    }
  })
}

function createTray() {
  try {
    const iconPath = findResource(path.join('electron', 'tray-icon.png'))
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath)
      tray.setToolTip('Local AI Chatbot')
      const ctx = Menu.buildFromTemplate([
        { label: 'Show', click: () => { if (mainWindow) mainWindow.show() } },
        { type: 'separator' },
        { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
      ])
      tray.setContextMenu(ctx)
      tray.on('double-click', () => { if (mainWindow) mainWindow.show() })
    }
  } catch (e) {
    err(`Tray creation failed: ${e.message}`)
  }
}

app.whenReady().then(async () => {
  startBackend()
  createTray()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  try {
    await waitForServer('http://localhost:8000/api')
    log('Backend is ready')
    mainWindow.loadURL('http://localhost:8000')
  } catch (e) {
    err(`Failed to start: ${e.message}`)
    dialog.showErrorBox('Startup Failed', `Backend did not start in time.\n\nCheck the log file:\n${logFile}`)
    mainWindow.loadURL(`data:text/html,<h1>Backend failed to start</h1><p>${e.message}</p>`)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (e) => {
  if (!quitting) {
    e.preventDefault()
    quitting = true
    if (tray) { tray.destroy(); tray = null }
    await stopBackend()
    app.quit()
  }
})
