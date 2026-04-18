"use strict";
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
const fs = require("fs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
let mainWindow = null;
let tray = null;
let pythonProcess = null;
let pendingRequests = /* @__PURE__ */ new Map();
let nextRequestId = 1;
let isQuitting = false;
const isDev = !electron.app.isPackaged;
function getBundledPythonDir() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "bundled-python");
  }
  return path.join(__dirname, "..", "..", "..", "bundled-python");
}
function getPythonPath() {
  return path.join(getBundledPythonDir(), "rpc_server.py");
}
function getModelsDir() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "models");
  }
  return path.join(__dirname, "..", "..", "..", "models");
}
function getPythonDir() {
  return getBundledPythonDir();
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1e3,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "MeetingRecorder",
    show: false,
    backgroundColor: electron.nativeTheme.shouldUseDarkColors ? "#111827" : "#ffffff"
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("close", (event) => {
    const settings = getStoredSettings();
    if (settings.minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow == null ? void 0 : mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function getStoredSettings() {
  try {
    const path$1 = path.join(electron.app.getPath("userData"), "settings.json");
    if (fs__namespace.existsSync(path$1)) {
      return JSON.parse(fs__namespace.readFileSync(path$1, "utf-8"));
    }
  } catch {
  }
  return {};
}
function buildTrayMenu() {
  if (!tray) return;
  const settings = getStoredSettings();
  const minimizeToTray = !!settings.minimizeToTray;
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "显示窗口",
      click: () => {
        mainWindow == null ? void 0 : mainWindow.show();
        mainWindow == null ? void 0 : mainWindow.focus();
      }
    },
    {
      label: "开始/停止录音",
      click: () => {
        mainWindow == null ? void 0 : mainWindow.webContents.send("tray_action", "toggle_recording");
        mainWindow == null ? void 0 : mainWindow.show();
      }
    },
    { type: "separator" },
    {
      label: "最小化到托盘",
      type: "checkbox",
      checked: minimizeToTray,
      click: (menuItem) => {
        const updated = { ...getStoredSettings(), minimizeToTray: menuItem.checked };
        const path$1 = path.join(electron.app.getPath("userData"), "settings.json");
        fs__namespace.writeFileSync(path$1, JSON.stringify(updated, null, 2));
      }
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}
function createTray() {
  const iconName = process.platform === "win32" ? "icon.ico" : "icon.png";
  let iconPath;
  if (electron.app.isPackaged) {
    iconPath = path.join(process.resourcesPath, "resources", iconName);
  } else {
    iconPath = path.join(__dirname, "..", "resources", iconName);
  }
  if (!fs__namespace.existsSync(iconPath)) {
    iconPath = path.join(__dirname, "..", "resources", "icon.png");
  }
  if (!fs__namespace.existsSync(iconPath)) {
    console.log("[Tray] icon not found, skipping tray creation");
    return;
  }
  try {
    tray = new electron.Tray(iconPath);
  } catch (e) {
    console.log("[Tray] failed to create tray:", e);
    return;
  }
  tray.setToolTip("会议录音机");
  buildTrayMenu();
  tray.on("double-click", () => {
    mainWindow == null ? void 0 : mainWindow.show();
    mainWindow == null ? void 0 : mainWindow.focus();
  });
}
function registerGlobalShortcuts() {
  const startRet = electron.globalShortcut.register("CommandOrControl+Shift+R", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("tray_action", "toggle_recording");
    mainWindow == null ? void 0 : mainWindow.show();
  });
  if (!startRet) {
    console.log("Failed to register global shortcut: CommandOrControl+Shift+R");
  }
}
function ensurePythonDeps() {
  var _a, _b;
  const pythonDir = getPythonDir();
  const reqPath = path.join(pythonDir, "requirements.txt");
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const checkProc = child_process.spawn(pythonCmd, [
    "-c",
    'import sounddevice; import funasr; print("OK")'
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let checkOut = "";
  (_a = checkProc.stdout) == null ? void 0 : _a.on("data", (d) => {
    checkOut += d.toString();
  });
  (_b = checkProc.stderr) == null ? void 0 : _b.on("data", (d) => {
  });
  checkProc.on("close", (code) => {
    var _a2;
    if (code === 0 && checkOut.trim() === "OK") {
      startPythonServer();
      return;
    }
    console.log("[deps] Python packages missing, running pip install...");
    mainWindow == null ? void 0 : mainWindow.webContents.send("env_notice", {
      message: "首次启动正在安装 Python 依赖，请稍候...",
      type: "installing"
    });
    const pipProc = child_process.spawn(pythonCmd, [
      "-m",
      "pip",
      "install",
      "-r",
      reqPath,
      "--quiet"
    ], {
      cwd: pythonDir,
      stdio: ["pipe", "pipe", "pipe"]
    });
    (_a2 = pipProc.stderr) == null ? void 0 : _a2.on("data", (data) => {
      const text = data.toString();
      if (text.includes("Downloading") || text.includes("Fetching") || text.includes("%") || text.includes("Installing")) {
        mainWindow == null ? void 0 : mainWindow.webContents.send("model_download", { message: text.trim() });
      }
    });
    pipProc.on("close", (pipCode) => {
      if (pipCode === 0) {
        console.log("[deps] pip install completed successfully");
        mainWindow == null ? void 0 : mainWindow.webContents.send("env_notice", {
          message: "Python 依赖安装完成",
          type: "success"
        });
        setTimeout(() => startPythonServer(), 2e3);
      } else {
        console.error("[deps] pip install failed with code:", pipCode);
        mainWindow == null ? void 0 : mainWindow.webContents.send("env_notice", {
          message: `Python 依赖安装失败（错误码 ${pipCode}），请手动运行：pip3 install -r "${reqPath}"`,
          type: "error"
        });
      }
    });
  });
}
function startPythonServer() {
  var _a, _b;
  const pythonScript = getPythonPath();
  const pythonDir = getPythonDir();
  if (!fs__namespace.existsSync(pythonDir)) {
    console.error("Python directory not found:", pythonDir);
    mainWindow == null ? void 0 : mainWindow.webContents.send("python_error", "Python directory not found");
    return;
  }
  const pythonExeDir = getBundledPythonDir();
  const pythonCmd = process.platform === "win32" ? path.join(pythonExeDir, "python.exe") : path.join(pythonExeDir, "bin", "python");
  const modelsDir = getModelsDir();
  const modelCacheDir = path.join(modelsDir, "hub");
  const torchHubDir = path.join(modelsDir, "torch", "hub");
  const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  let ffmpegPath;
  if (electron.app.isPackaged) {
    ffmpegPath = path.join(process.resourcesPath, "resources", "ffmpeg", ffmpegName);
  } else {
    ffmpegPath = path.join(__dirname, "..", "resources", "ffmpeg", ffmpegName);
  }
  pythonProcess = child_process.spawn(pythonCmd, [pythonScript, `--data-dir=${electron.app.getPath("userData")}`], {
    cwd: pythonDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      // 强制使用 CPU，防止 CUDA 初始化挂起
      "CUDA_VISIBLE_DEVICES": "",
      // 让 modelscope 和 torch 从 bundled models/ 读取模型
      "MODELSCOPE_CACHE": modelCacheDir,
      "TORCH_HUB_DIR": torchHubDir,
      // 让系统 Python 能找到 bundled-python 的 site-packages
      "PYTHONPATH": path.join(pythonDir, "lib", "python3.9", "site-packages"),
      // ffmpeg 路径（用于 pydub 音频转换）
      "FFMPEG_PATH": ffmpegPath
    }
  });
  let buffer = "";
  (_a = pythonProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line);
          const id = msg.id;
          if (id !== void 0 && pendingRequests.has(id)) {
            const { resolve, reject } = pendingRequests.get(id);
            pendingRequests.delete(id);
            if (msg.error) reject(new Error(msg.error.message || msg.error));
            else resolve(msg.result);
          } else {
            handlePythonMessage(msg);
          }
        } catch (e) {
        }
      }
    }
  });
  (_b = pythonProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
    const text = data.toString();
    if (text.includes("Downloading") || text.includes("Fetching") || text.includes("%")) {
      mainWindow == null ? void 0 : mainWindow.webContents.send("model_download", { message: text.trim() });
    }
    console.error("Python stderr:", text);
  });
  pythonProcess.on("close", (code) => {
    console.log("Python process exited with code:", code);
    pythonProcess = null;
  });
  setTimeout(() => {
    sendToPython({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} });
  }, 1e3);
}
function sendToPython(msg) {
  if (pythonProcess == null ? void 0 : pythonProcess.stdin) {
    pythonProcess.stdin.write(JSON.stringify(msg) + "\n");
  }
}
function handlePythonMessage(msg) {
  if (!mainWindow) return;
  switch (msg.method) {
    case "initialized":
      console.log("Python RPC server ready");
      mainWindow.webContents.send("python_ready");
      break;
    case "capture_status":
      mainWindow.webContents.send("capture_status", msg.params);
      break;
    case "realtime_caption":
      mainWindow.webContents.send("realtime_caption", msg.params);
      break;
    case "processing_progress":
      mainWindow.webContents.send("processing_progress", msg.params);
      break;
    case "env_notice":
      mainWindow.webContents.send("env_notice", msg.params);
      break;
    case "processing_error":
      mainWindow.webContents.send("processing_error", msg.params);
      break;
    case "model_download":
      mainWindow.webContents.send("model_download", msg.params);
      break;
  }
}
electron.ipcMain.handle("python_call", async (_event, method, params) => {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`RPC call ${method} timed out`));
    }, 3e5);
    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });
    sendToPython({ jsonrpc: "2.0", id, method, params });
  });
});
electron.ipcMain.handle("select_file", async () => {
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Audio", extensions: ["mp3", "m4a", "wav", "flac", "ogg", "opus", "aac", "wma", "mp4", "mov"] }
    ]
  });
  return result.filePaths;
});
electron.ipcMain.handle("import_audio_file", async (_event, srcPath) => {
  const dataDir = electron.app.getPath("userData");
  const recordingsDir = path.join(dataDir, "recordings");
  if (!fs__namespace.existsSync(recordingsDir)) {
    fs__namespace.mkdirSync(recordingsDir, { recursive: true });
  }
  const ext = path.extname(srcPath);
  const timestamp = Date.now();
  const destFileName = `import_${timestamp}${ext}`;
  const destPath = path.join(recordingsDir, destFileName);
  fs__namespace.copyFileSync(srcPath, destPath);
  return { audioPath: destPath };
});
electron.ipcMain.handle("get_app_path", () => {
  return electron.app.getPath("userData");
});
electron.ipcMain.handle("get_audio_url", (_event, filePath) => {
  if (!filePath) return "";
  if (filePath.startsWith("file://")) return filePath;
  return `file://${encodeURIComponent(filePath)}`;
});
electron.ipcMain.handle("get_dark_mode", () => {
  return electron.nativeTheme.shouldUseDarkColors;
});
electron.ipcMain.handle("set_dark_mode", (_event, dark) => {
  electron.nativeTheme.themeSource = dark ? "dark" : "light";
  return { status: "ok" };
});
electron.nativeTheme.on("updated", () => {
  mainWindow == null ? void 0 : mainWindow.webContents.send("theme_changed", electron.nativeTheme.shouldUseDarkColors);
});
electron.ipcMain.handle("save_settings", (_event, settings) => {
  const path$1 = path.join(electron.app.getPath("userData"), "settings.json");
  fs__namespace.writeFileSync(path$1, JSON.stringify(settings, null, 2));
  return { status: "ok" };
});
electron.ipcMain.handle("get_settings", () => {
  return getStoredSettings();
});
electron.ipcMain.handle("show_item_in_folder", (_event, path2) => {
  electron.shell.showItemInFolder(path2);
});
electron.ipcMain.handle("get_old_recordings", async (_event, params) => {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("RPC call get_old_recordings timed out"));
    }, 3e4);
    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });
    sendToPython({ jsonrpc: "2.0", id, method: "get_old_recordings", params: params || {} });
  });
});
electron.ipcMain.handle("cleanup_old_recordings", async (_event, params) => {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("RPC call cleanup_old_recordings timed out"));
    }, 6e4);
    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });
    sendToPython({ jsonrpc: "2.0", id, method: "cleanup_old_recordings", params: params || {} });
  });
});
electron.app.commandLine.appendSwitch("disable-gpu");
electron.app.commandLine.appendSwitch("disable-software-rasterizer");
electron.app.whenReady().then(() => {
  createWindow();
  createTray();
  registerGlobalShortcuts();
  ensurePythonDeps();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow == null ? void 0 : mainWindow.show();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  isQuitting = true;
  if (pythonProcess) {
    pythonProcess.kill();
  }
  electron.globalShortcut.unregisterAll();
});
