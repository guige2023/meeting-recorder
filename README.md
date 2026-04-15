# MeetingRecorder

本地会议录音 + 说话人识别 + 语音转写工具。

支持 Windows 和 macOS，数据完全保存在本地。

## 功能特性

### Phase 1 · 核心录音
- **本地录音**：sounddevice 直接从麦克风录制，WAV 格式 16kHz 单声道
- **说话人分割**：Silero VAD + MFCC 层次聚类，纯本地无需外部 API
- **语音转写**：阿里 FunASR SenseVoice Small，中文识别优秀
- **按人聚合**：识别不同说话人，转写结果按人分组展示
- **全文搜索**：SQLite FTS5，搜索会议内容，300ms 防抖

### Phase 2 · 导入与格式
- **多格式导入**：mp3 / m4a / wav / flac / ogg / aac / wma / ape / opus
- **自动转写**：导入后自动触发说话人分割 + 转写流程

### Phase 3 · 桌面体验
- **Electron 桌面**：窗口管理、系统菜单、IPC 通信
- **深色模式**：跟随系统 / 手动切换，tailwindcss dark class
- **系统托盘**：录音状态显示、最小化到托盘、快捷操作
- **全局快捷键**：⌘⇧R 开始/停止录音（macOS）
- **首次引导**：欢迎页 + 操作说明

### Phase 4 · 实时字幕
- **实时字幕**：录音同时显示字幕流
- **字幕跟随**：当前说话人高亮

### Phase 5 · 播放与编辑
- **音频播放器**：Web Audio API 播放，带进度条和倍速
- **发言统计**：各说话人时长占比
- **标题编辑**：点击直接修改会议标题
- **发言人人名编辑**：重命名说话人标签
- **标签管理**：为会议添加/删除标签

### Phase 6 · 导出
- **单会议导出**：TXT / Markdown / JSON / SRT（字幕）
- **批量导出**：勾选多个会议，一次性打包为 ZIP（含 json/txt/md/srt/wav）

### Phase 7 · 系统集成
- **系统托盘**：图标路径修复、动态菜单、录音状态切换
- **深色模式开关**：Settings 界面实时切换，nativeTheme 同步
- **主题监听**：跟随系统主题变化自动切换

### Phase 8 · 打包发布
- **macOS DMG**：arm64 + x64，APFS 格式，97MB
- **版本管理**：semver 规范，v1.0.1

---

**跨平台**：macOS (.dmg) + Windows (.exe)

## 技术架构

```
React + TypeScript + Vite (前端)
        ↓ IPC
  Electron 主进程
        ↓ stdio JSON-RPC
  Python RPC Server
   ┌────┴────┐
   ↓         ↓
AudioCapture  TranscriptionService
(sounddevice)  ├─ Silero VAD（本地，说话人分割）
   ↓          └─ SenseVoice（阿里，中文转写）
WAV 16kHz         ↓
              SQLite（按人聚合）
```

## 技术选型

| 模块 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 录音 | sounddevice |
| 说话人分割 | Silero VAD + MFCC + 层次聚类（纯本地） |
| 语音转写 | FunASR SenseVoice Small |
| 数据库 | SQLite + FTS5 |

## 安装依赖

```bash
# 克隆项目
cd meeting-recorder

# 安装 Node 依赖
npm install

# 安装 Python 依赖
pip install -r python/requirements.txt
```

## 开发

```bash
npm run dev
```

## 打包

```bash
# macOS
npm run build

# Windows
npm run build:win
```

## 使用说明

### 录音
1. 点击「开始录音」
2. 录音结束后点击「停止」
3. 系统自动进行说话人分割 + 转写
4. 在历史记录中查看结果

### 导入音频
支持 mp3 / m4a / wav / flac / ogg 等格式，自动处理并转写。

### 搜索
在历史记录页搜索框输入关键词，搜索转写内容。

### 导出
点击展开会议详情，选择「导出 TXT」或「导出 Markdown」。

## 注意事项

- 首次运行 SenseVoice 模型会自动下载（约 200MB）
- Python 3.8+ 推荐
- macOS 需要授予麦克风权限
- Windows 需要安装 Python（建议 3.9+）
