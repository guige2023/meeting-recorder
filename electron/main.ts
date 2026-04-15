import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  globalShortcut,
  nativeTheme,
  shell
} from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let pythonProcess: ChildProcess | null = null
let pythonReady = false
let pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
let nextRequestId = 1
let isQuitting = false

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged

function getResourcePath(relative: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, relative)
  }
  return join(__dirname, '..', relative)
}

function getPythonPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python', 'rpc_server.py')
  }
  return join(__dirname, '..', 'python', 'rpc_server.py')
}

function getPythonDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python')
  }
  return join(__dirname, '..', 'python')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MeetingRecorder',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111827' : '#ffffff',
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (event) => {
      // 检查设置：是否最小化到托盘
    const settings = getStoredSettings()
    if (settings.minimizeToTray && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function getStoredSettings(): Record<string, any> {
  try {
    const path = join(app.getPath('userData'), 'settings.json')
    if (fs.existsSync(path)) {
      return JSON.parse(fs.readFileSync(path, 'utf-8'))
    }
  } catch {}
  return {}
}

function buildTrayMenu() {
  if (!tray) return
  const settings = getStoredSettings()
  const minimizeToTray = !!settings.minimizeToTray

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: '开始/停止录音',
      click: () => {
        mainWindow?.webContents.send('tray_action', 'toggle_recording')
        mainWindow?.show()
      }
    },
    { type: 'separator' },
    {
      label: '最小化到托盘',
      type: 'checkbox',
      checked: minimizeToTray,
      click: (menuItem) => {
        const updated = { ...getStoredSettings(), minimizeToTray: menuItem.checked }
        const path = join(app.getPath('userData'), 'settings.json')
        fs.writeFileSync(path, JSON.stringify(updated, null, 2))
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

function createTray() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  let iconPath: string

  // 打包后: process.resourcesPath/resources/
  // 开发模式: 项目根目录 resources/（__dirname = dist-electron/，上级 = 项目根）
  if (app.isPackaged) {
    iconPath = join(process.resourcesPath, 'resources', iconName)
  } else {
    iconPath = join(__dirname, '..', 'resources', iconName)
  }

  if (!fs.existsSync(iconPath)) {
    iconPath = join(__dirname, '..', 'resources', 'icon.png')
  }
  if (!fs.existsSync(iconPath)) {
    console.log('[Tray] icon not found, skipping tray creation')
    return
  }

  try {
    tray = new Tray(iconPath)
  } catch (e) {
    console.log('[Tray] failed to create tray:', e)
    return
  }

  tray.setToolTip('会议录音机')
  buildTrayMenu()

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function registerGlobalShortcuts() {
  // 全局快捷键：CmdOrCtrl+Shift+R 开始/停止录音
  const startRet = globalShortcut.register('CommandOrControl+Shift+R', () => {
    mainWindow?.webContents.send('tray_action', 'toggle_recording')
    mainWindow?.show()
  })

  if (!startRet) {
    console.log('Failed to register global shortcut: CommandOrControl+Shift+R')
  }
}

function startPythonServer() {
  const pythonScript = getPythonPath()
  const pythonDir = getPythonDir()

  if (!fs.existsSync(pythonDir)) {
    console.error('Python directory not found:', pythonDir)
    mainWindow?.webContents.send('python_error', 'Python directory not found')
    return
  }

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

  pythonProcess = spawn(pythonCmd, [pythonScript], {
    cwd: pythonDir,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  let buffer = ''

  pythonProcess.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line)
          const id = msg.id
          if (id !== undefined && pendingRequests.has(id)) {
            const { resolve, reject } = pendingRequests.get(id)!
            pendingRequests.delete(id)
            if (msg.error) reject(new Error(msg.error.message || msg.error))
            else resolve(msg.result)
          } else {
            handlePythonMessage(msg)
          }
        } catch (e) {
          // ignore non-JSON lines
        }
      }
    }
  })

  pythonProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString()
    // 发送模型下载进度（SenseVoice 下载信息会打到 stderr）
    if (text.includes('Downloading') || text.includes('Fetching') || text.includes('%')) {
      mainWindow?.webContents.send('model_download', { message: text.trim() })
    }
    console.error('Python stderr:', text)
  })

  pythonProcess.on('close', (code) => {
    console.log('Python process exited with code:', code)
    pythonProcess = null
    pythonReady = false
  })

  // 发送初始化消息
  setTimeout(() => {
    sendToPython({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} })
  }, 1000)
}

function sendToPython(msg: object) {
  if (pythonProcess?.stdin) {
    pythonProcess.stdin.write(JSON.stringify(msg) + '\n')
  }
}

function handlePythonMessage(msg: any) {
  if (!mainWindow) return

  switch (msg.method) {
    case 'initialized':
      pythonReady = true
      console.log('Python RPC server ready')
      mainWindow.webContents.send('python_ready')
      break
    case 'capture_status':
      mainWindow.webContents.send('capture_status', msg.params)
      break
    case 'realtime_caption':
      mainWindow.webContents.send('realtime_caption', msg.params)
      break
    case 'processing_progress':
      mainWindow.webContents.send('processing_progress', msg.params)
      break
    case 'env_notice':
      mainWindow.webContents.send('env_notice', msg.params)
      break
    case 'processing_error':
      mainWindow.webContents.send('processing_error', msg.params)
      break
    case 'model_download':
      mainWindow.webContents.send('model_download', msg.params)
      break
  }
}

// IPC handlers
ipcMain.handle('python_call', async (_event, method: string, params: any) => {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++

    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`RPC call ${method} timed out`))
    }, 300000)

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout)
        resolve(result)
      },
      reject: (err) => {
        clearTimeout(timeout)
        reject(err)
      }
    })

    sendToPython({ jsonrpc: '2.0', id, method, params })
  })
})

ipcMain.handle('select_file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aac', 'wma', 'mp4', 'mov'] }
    ]
  })
  return result.filePaths
})

ipcMain.handle('get_app_path', () => {
  return app.getPath('userData')
})

ipcMain.handle('get_audio_url', (_event, filePath: string) => {
  if (!filePath) return ''
  // 将本地路径转为 file:// URL
  if (filePath.startsWith('file://')) return filePath
  return `file://${encodeURIComponent(filePath)}`
})

ipcMain.handle('get_dark_mode', () => {
  return nativeTheme.shouldUseDarkColors
})

ipcMain.handle('set_dark_mode', (_event, dark: boolean) => {
  nativeTheme.themeSource = dark ? 'dark' : 'light'
  return { status: 'ok' }
})

// 监听系统主题变化，通知渲染进程
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme_changed', nativeTheme.shouldUseDarkColors)
})

ipcMain.handle('save_settings', (_event, settings: Record<string, any>) => {
  const path = join(app.getPath('userData'), 'settings.json')
  fs.writeFileSync(path, JSON.stringify(settings, null, 2))
  return { status: 'ok' }
})

ipcMain.handle('get_settings', () => {
  return getStoredSettings()
})

ipcMain.handle('show_item_in_folder', (_event, path: string) => {
  shell.showItemInFolder(path)
})

// 禁用 GPU 加速，避免 macOS 上的崩溃问题
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

// App lifecycle
app.whenReady().then(() => {
  createWindow()
  createTray()
  registerGlobalShortcuts()
  startPythonServer()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  if (pythonProcess) {
    pythonProcess.kill()
  }
  globalShortcut.unregisterAll()
})
