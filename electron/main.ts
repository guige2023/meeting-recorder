import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let pythonReady = false

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged

// 获取资源路径（打包后指向 extraResources）
function getResourcePath(relative: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, relative)
  }
  return join(__dirname, '..', relative)
}

// 获取 Python 路径
function getPythonPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python', 'rpc_server.py')
  }
  return join(__dirname, '..', 'python', 'rpc_server.py')
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
    show: false
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
}

// 启动 Python RPC 服务器
function startPythonServer() {
  const pythonScript = getPythonPath()
  const pythonDir = app.isPackaged
    ? join(process.resourcesPath, 'python')
    : join(__dirname, '..', 'python')

  // 确保 python 目录存在
  if (!fs.existsSync(pythonDir)) {
    console.error('Python directory not found:', pythonDir)
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
          handlePythonMessage(msg)
        } catch (e) {
          // ignore non-JSON lines
        }
      }
    }
  })

  pythonProcess.stderr?.on('data', (data: Buffer) => {
    console.error('Python stderr:', data.toString())
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
  }
}

// IPC handlers
ipcMain.handle('python_call', async (_event, method: string, params: any) => {
  return new Promise((resolve, reject) => {
    if (!pythonReady && method !== 'initialize') {
      reject(new Error('Python server not ready'))
      return
    }

    const id = Date.now()
    const timeout = setTimeout(() => {
      reject(new Error(`RPC call ${method} timed out`))
    }, 30000)

    const handler = (msg: any) => {
      if (msg.id === id) {
        clearTimeout(timeout)
        pythonProcess?.stdout?.off('data', handler)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    sendToPython({ jsonrpc: '2.0', id, method, params })
  })
})

ipcMain.handle('select_file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aac', 'wma'] }
    ]
  })
  return result.filePaths
})

ipcMain.handle('get_app_path', () => {
  return app.getPath('userData')
})

app.whenReady().then(() => {
  createWindow()
  startPythonServer()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill()
  }
})
