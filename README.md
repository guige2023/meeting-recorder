# MeetingRecorder - 本地会议录音与转写

**完全离线的桌面会议录音应用**。支持 macOS 和 Windows，自动识别不同发言人，将会议录音转为文字记录。

## 功能

- **本地录音** — 系统麦克风实时采集，WebRTC/VAD 降噪
- **说话人分离** — Silero-VAD + MFCC 聚类，自动识别不同发言人
- **语音转写** — FunASR SenseVoice 模型，100% 本地运行
- **实时字幕** — 录音时实时输出文字（可选）
- **历史管理** — SQLite 存储，搜索、标签、导出
- **导出格式** — JSON、SRT 字幕、纯文本
- **深色模式** — 支持明暗主题切换
- **系统托盘** — 后台录音，悬浮球控制
- **全局快捷键** — 录音/停止快捷键
- **导入音频转写** — 支持 mp3/m4a/wav/flac/ogg 等格式

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 33 + Vite |
| 前端 | React 18 + TypeScript + TailwindCSS + Zustand |
| 后端 | Python 3.9（bundled）|
| ASR 模型 | FunASR 1.3.1 / SenseVoiceSmall |
| VAD | Silero-VAD（本地）|
| 说话人分离 | Silero-VAD + MFCC + BIC/AHC 聚类 |
| 音频转换 | FFmpeg（bundled）+ soundfile/scipy |
| 构建 | electron-builder（DMG + NSIS）|

## 下载安装包

### macOS
- `release/MeetingRecorder-*-arm64.dmg` — Apple Silicon（M系列芯片）
- `release/MeetingRecorder-*-x64.dmg` — Intel 芯片（需单独构建）

### Windows
- `release/MeetingRecorder Setup *.exe` — NSIS 安装包

**安装包已包含完整的 Python 运行时和 AI 模型，无需用户手动安装任何依赖。**

## 模型说明

以下模型已打包在安装包内（约 1GB）：

| 模型 | 大小 | 用途 |
|------|------|------|
| SenseVoiceSmall | ~888 MB | 语音识别 |
| Silero-VAD | ~34 MB | 语音活动检测 |
| FFmpeg | ~77 MB | 音频格式转换（支持 mp3/m4a/ogg 等） |

## 开发

### 环境要求

- Node.js 18+
- Python 3.9+（仅用于本地开发调试）
- macOS 12+ 或 Windows 10+

### 本地开发

```bash
# 安装依赖
npm install

# 安装 Python 依赖（仅开发时）
pip install sounddevice numpy funasr torch torchaudio soundfile scipy

# 启动开发服务器
npm run dev
```

### 完整打包

```bash
npm run build        # 构建 macOS DMG + Windows EXE
```

### 关键文件

```
├── electron/          Electron 主进程
├── src/               React 前端
├── python/            Python 后端（录音、VAD、ASR、说话人分离）
├── bundled-python/    打包的 Python 运行时
├── models/            AI 模型（SenseVoice + Silero-VAD）
├── resources/ffmpeg/  FFmpeg 静态二进制
└── release/           构建产物
```

### 架构说明

- **Electron 主进程** 启动 Python 子进程，通过 stdio JSON-RPC 通信
- **Python 后端**：`rpc_server.py` 是入口，管理 VAD、ASR、说话人分离模块
- **模型路径**：生产环境从 `app.resourcesPath/models/` 加载，开发环境从项目根目录 `models/` 加载
- **环境变量**：`CUDA_VISIBLE_DEVICES=''`（强制 CPU）、`MODELSCOPE_CACHE`、`TORCH_HUB_DIR`、`FFMPEG_PATH`

## 录音流程

```
麦克风 → sounddevice 采集 → VAD（Silero）→ 语音段切分
                                          ↓
                               说话人分离（MFCC 聚类）
                                          ↓
                               语音段 + 说话人标签 → SenseVoice 转写
                                          ↓
                                    文本 + 时间戳 → Electron（JSON-RPC）
```

## License
MIT
