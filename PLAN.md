# 会议录音转写桌面应用 — 完整实现方案 v2

> 基于 SenseVoice + pyannote.audio + Electron | 2026-04-15

---

## 一、产品定位

**目标用户**：个人用户，本地离线使用，Windows / macOS 双平台

**核心功能**：会议录音 → 声纹分割（区分说话人）→ 语音转写（中文优先）→ 按人聚合文字记录

**设计原则**：
- 全部本地处理，无网络依赖
- 低配电脑也能运行（Mac M1 16GB / Windows 集显均可）
- 功能完整，不阉割

---

## 二、技术架构

### 2.1 技术栈总览

| 层次 | 技术选型 | 说明 |
|------|----------|------|
| 桌面框架 | Electron 33 + electron-builder | 跨平台，生态成熟 |
| 前端 | React 18 + TypeScript + Vite | 高速构建 |
| 状态管理 | Zustand | 轻量，Electron 友好 |
| 样式 | TailwindCSS | 快速 UI 开发 |
| 音频录制 | Python + sounddevice / pyaudio | 跨平台麦克风采集 |
| 声纹分割 | pyannote.audio 3.x | 开源最强说话人分割 |
| 语音转写 | FunAudioLLM / SenseVoice Small | 阿里开源，中文最优，0.27B 参数 |
| VAD（语音活动检测）| Silero-VAD | 实时字幕必备，过滤静音 |
| 本地数据库 | SQLite + better-sqlite3 | 存储历史记录，全文搜索 |
| IPC 通信 | stdio JSON-RPC | Electron ↔ Python 子进程 |
| 音频格式处理 | FFmpeg（静态二进制）| 导入各种格式转 WAV |
| 国际化 | i18next | 后续多语言预留 |

### 2.2 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────┐  ┌──────────────────────────────────────┐  │
│  │ App Window  │  │  Python Subprocess (stdio JSON-RPC)   │  │
│  │ 管理、托盘  │  │  ┌─────────┐  ┌──────────────────┐  │  │
│  │ 系统权限    │  │  │VAD      │  │ pyannote.audio  │  │  │
│  │ FFmpeg     │  │  │Silero-VAD│  │ (Speaker        │  │  │
│  │ SQLite     │  │  └─────────┘  │  Diarization)   │  │  │
│  │            │  │               └──────────────────┘  │  │
│  │            │  │  ┌─────────────────────────────┐   │  │
│  │            │  │  │ FunAudioLLM / SenseVoice    │   │  │
│  │            │  │  │ (Transcription)             │   │  │
│  └─────────────┘  └──────────────────────────────────────┘  │
│         │                        │                            │
│         └────────── IPC ─────────┘                            │
│                          │                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              React Renderer (TypeScript)                 │  │
│  │  ┌──────────┐  ┌────────────┐  ┌───────────────────┐    │  │
│  │  │Recorder  │  │  History   │  │  Settings        │    │  │
│  │  │View      │  │  ListView  │  │  Panel           │    │  │
│  │  │-波形显示 │  │  -搜索    │  │  -语言选择       │    │  │
│  │  │-实时字幕 │  │  -筛选    │  │  -导出格式       │    │  │
│  │  │-说话人数 │  │  -导出    │  │  -模型路径       │    │  │
│  │  └──────────┘  └────────────┘  └───────────────────┘    │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 数据模型

```sql
-- 会议记录表
CREATE TABLE meetings (
    id          TEXT PRIMARY KEY,        -- UUID
    title       TEXT NOT NULL,           -- 标题（可编辑）
    created_at  INTEGER NOT NULL,        -- Unix timestamp
    duration    REAL,                    -- 录音时长（秒）
    audio_path  TEXT,                    -- 原始音频文件路径
    sample_rate INTEGER DEFAULT 16000,  -- 采样率
    language    TEXT DEFAULT 'zh',      -- 语言
    status      TEXT DEFAULT 'pending',  -- pending/processing/completed/failed
    favorite    INTEGER DEFAULT 0,       -- 是否收藏
    tags        TEXT,                    -- JSON 数组: ["销售", "技术"]
    notes       TEXT,                    -- 用户备注
    speaker_count INTEGER,               -- 识别出的说话人数量
    file_size   INTEGER                  -- 音频文件大小（字节）
);

-- 说话人表
CREATE TABLE speakers (
    id          TEXT PRIMARY KEY,
    meeting_id  TEXT NOT NULL,
    label       TEXT NOT NULL,           -- "Speaker 1", "Speaker 2" ...
    name        TEXT,                    -- 用户重命名后的名字
    color       TEXT,                    -- UI 显示颜色
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- 转写片段表
CREATE TABLE segments (
    id          TEXT PRIMARY KEY,
    meeting_id  TEXT NOT NULL,
    speaker_id  TEXT NOT NULL,
    start_time  REAL NOT NULL,           -- 秒
    end_time    REAL NOT NULL,           -- 秒
    text        TEXT NOT NULL,           -- 转写文本
    confidence  REAL,                    -- 置信度
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE CASCADE
);

-- 全文本搜索虚拟表
CREATE VIRTUAL TABLE segments_fts USING fts5(
    text,
    segment_id UNINDEXED,
    meeting_id UNINDEXED,
    content='segments',
    content_rowid='rowid'
);
```

### 2.4 文件存储结构

```
~/Library/Application Support/MeetingRecorder/   (macOS)
%APPDATA%/MeetingRecorder/                         (Windows)
├── recordings/
│   ├── {meeting_id}.wav         # 原始录音
│   └── {meeting_id}.wav.metadata
├── models/                       # 本地模型缓存
│   ├── sensevoice/
│   └── pyannote/
├── database/
│   └── recorder.db              # SQLite 数据库
└── logs/
    └── app.log
```

---

## 三、功能模块详细设计

### 3.1 录音模块（RecorderView）

**功能清单：**
- [ ] 一键开始/暂停/停止录音
- [ ] 实时波形可视化（Web Audio API 的 AnalyserNode）
- [ ] 录音时长显示
- [ ] 实时显示检测到的说话人数量（实时字幕开启时）
- [ ] 实时字幕显示（可开关，每 2-3 秒刷新）
- [ ] 录音质量指示（麦克风音量过大/过小提示）
- [ ] 中断恢复：意外关闭后重新打开可继续上次的录音

**实时字幕原理：**
```
麦克风流 → Silero-VAD（检测语音起止）→ 截取语音片段（3-5秒）→ SenseVoice 转写 → WebSocket → UI
```
- VAD 检测到语音开始 → 开始缓冲
- VAD 检测到语音结束 或 缓冲满 5 秒 → 提交转写
- 转写结果通过 IPC 推送至渲染进程
- 字幕累积显示，最新片段在底部

**状态机：**
```
IDLE → RECORDING → PAUSED → RECORDING → STOPPED → PROCESSING → COMPLETED
                ↑__________|                         |
                                                      ↓
                                                 FAILED
```

### 3.2 导入模块（ImportView）

**功能清单：**
- [ ] 支持格式：MP3, M4A, WAV, FLAC, OGG, OPUS, AAC, WMA
- [ ] 拖拽文件或点击选择（支持多选）
- [ ] 批量导入队列，显示每个文件的处理进度
- [ ] 自动命名：文件名或创建时间
- [ ] 导入前预览：显示时长、声道数、采样率
- [ ] 跳过已导入文件（按文件名 hash 识别）

**处理流程：**
```
导入文件 → FFmpeg 转换为 WAV 16kHz 单声道 → pyannote 分割 → SenseVoice 转写 → 存入数据库
```

### 3.3 历史记录模块（HistoryView）

**功能清单：**
- [ ] 列表展示：标题、时间、时长、说话人数量、状态
- [ ] 全局全文搜索（搜索转写内容）
- [ ] 按时间范围筛选（今天/本周/本月/自定义）
- [ ] 按说话人数量筛选
- [ ] 按标签筛选（多标签支持）
- [ ] 收藏置顶 / 取消收藏
- [ ] 批量删除、批量导出
- [ ] 列表排序：按时间/按时长/按说话人数

### 3.4 转写结果查看与编辑（DetailView）

**功能清单：**
- [ ] 音频播放条：播放/暂停/进度拖拽/倍速（0.5x-2x）
- [ ] **时间线同步高亮**：播放到某句时，对应文字高亮并滚动到视口
- [ ] 按说话人分组展示（可折叠/展开）
- [ ] 每个人单独查看
- [ ] **手动编辑转写文本**：点击编辑，直接修改
- [ ] **说话人重命名**：把 "Speaker 1" 改成 "张三"
- [ ] 说话人颜色自定义
- [ ] 添加标签（支持多标签）
- [ ] 添加会议备注
- [ ] 会议统计：总时长、各人发言时长占比饼图

### 3.5 导出模块

**功能清单：**
- [ ] **TXT 导出**：纯文本，按时间排序，含说话人标签
- [ ] **JSON 导出**：完整结构化数据（含时间戳、说话人、文本）
- [ ] **Markdown 导出**：可读性好，按人分组，含时间戳
- [ ] **SRT 字幕导出**：带时间轴的字幕格式，可用于视频压制
- [ ] 批量导出：选中多个会议，一键打包 ZIP
- [ ] 导出时可选是否包含音频

### 3.6 设置模块（SettingsView）

**功能清单：**
- [ ] **麦克风选择**：下拉选择系统麦克风设备
- [ ] **语言设置**：中文 / 英文 / 粤语 / 日语 / 韩语 / 自动检测
- [ ] **实时字幕开关**：on/off（不影响录音，只是是否显示实时字幕）
- [ ] **实时字幕刷新间隔**：1秒 / 2秒 / 3秒 / 5秒
- [ ] **导出默认格式**：TXT / JSON / Markdown / SRT
- [ ] **音频质量**：16kHz（转写用）/ 44.1kHz（高音质）
- [ ] **开机启动**：跟随系统启动（可选）
- [ ] **系统托盘**：最小化到托盘 / 关闭退出
- [ ] **模型管理**：查看已下载模型、清除模型缓存
- [ ] **数据管理**：清除所有历史记录、导出/导入数据库

---

## 四、Python 后端核心模块

### 4.1 `rpc_server.py` — JSON-RPC over stdio

```python
# Electron 主进程启动时 spawn 此进程，双方通过 JSON-RPC 通信
# 方法列表：
# - capture_start() / capture_pause() / capture_stop()
# - capture_get_status() → {status, duration, speakers_count}
# - process_file(path) → job_id
# - process_get_status(job_id) → {status, progress, error}
# - realtime_stream() → 实时音频块（用于实时字幕）
# - get_history() / search_history(query)
# - export_meeting(id, format, path)
```

### 4.2 `audio_capture.py` — 音频录制

```python
# 使用 sounddevice（跨平台）
# - 采样率：16000 Hz（转写用标准）
# - 通道：1（单声道）
# - 分块读取：每次读取 0.5 秒音频块
# - 实时流：通过 stdout 实时输出音频块（用于实时字幕）
# - 文件保存：录音结束时写入 WAV 文件
```

### 4.3 `vad.py` — 语音活动检测

```python
# 使用 Silero-VAD
# - 实时音频流处理
# - 输出：每个 0.5s 块是否为语音的概率
# - 可配置：min_speech_duration_ms, min_silence_duration_ms
```

### 4.4 `diarizer.py` — 声纹分割

```python
# 使用 pyannote.audio Pipeline
# - 输入：WAV 文件路径（或音频数组）
# - 输出：List[Segment(start, end, speaker_label)]
# - 参数：min_speakers, max_speakers
# - 注意事项：需要 HuggingFace token 接受协议（免费）
```

### 4.5 `transcriber.py` — 语音转写

```python
# 使用 FunASR / SenseVoice
# from funasr import AutoModel
# model = AutoModel(model="iic/SenseVoiceSmall", device="cuda" or "cpu")
# 支持：
# - 完整文件转写（录音结束后）
# - 流式片段转写（实时字幕，每段 3-5 秒）
# - 输出：text, start, end, language
```

### 4.6 `merger.py` — 结果合并

```python
# 将 pyannote 的说话人分割 + SenseVoice 的转写结果
# 按时间线对齐，输出合并后的结构
# 合并策略：
# - 对于每个 SenseVoice 片段（带时间戳）
# - 查找该时间段内主要说话人（pyannote 结果）
# - 分配给对应 speaker_id
```

---

## 五、实现步骤（Phase 划分）

### Phase 1：项目脚手架 & 录音核心
**目标**：跑通 Electron + Python IPC，录音保存到文件

- [ ] 初始化 Electron 项目（Vite + React + TS）
- [ ] 配置 electron-builder 打包
- [ ] 搭建 Python subprocess + stdio JSON-RPC 通信层
- [ ] Python 端：sounddevice 录音测试（macOS + Windows）
- [ ] WAV 文件正确保存
- [ ] 基础 UI：录音/暂停/停止按钮 + 时长显示
- [ ] 波形可视化（Web Audio API）
- [ ] FFmpeg 静态二进制集成（处理导入音频格式转换）

**交付物**：能录10秒 WAV，播放正常

### Phase 2：SenseVoice 转写 + 说话人分割
**目标**：完成导入音频的完整处理流程

- [ ] FunAudioLLM / SenseVoice 安装和测试
- [ ] pyannote.audio 安装和测试
- [ ] Python 端：导入文件 → 转写完整流程
- [ ] Python 端：说话人分割 → 结果合并
- [ ] SQLite 数据库集成（better-sqlite3）
- [ ] Electron IPC：文件处理进度推送
- [ ] UI：处理进度条显示
- [ ] 简单结果展示（列表形式）

**交付物**：导入一个 mp3，能区分说话人并转写，存入数据库

### Phase 3：历史记录 & 搜索
**目标**：完整的历史管理功能

- [ ] 历史列表 UI（Zustand store）
- [ ] 全局全文搜索（SQLite FTS5）
- [ ] 按时间/说话人数量/标签筛选
- [ ] 收藏功能
- [ ] 批量选择与操作
- [ ] 会议标题编辑
- [ ] 标签系统

**交付物**：能搜索历史转写内容，精确找到某句话在哪个会议

### Phase 4：结果查看 & 编辑
**目标**：完整的转写结果查看和编辑功能

- [ ] 音频播放器（支持播放/暂停/进度拖拽/倍速）
- [ ] 时间线同步高亮（播放时文字跟随）
- [ ] 按人分组展示（可折叠）
- [ ] 转写文本在线编辑（点击编辑）
- [ ] 说话人重命名
- [ ] 说话人颜色管理
- [ ] 会议备注编辑
- [ ] 发言时长统计（饼图）

**交付物**：能播放录音并跟着文字走，修改转写内容

### Phase 5：实时字幕
**目标**：录音过程中实时显示字幕

- [ ] Silero-VAD 集成（Python 端）
- [ ] 音频流实时推送到 VAD → 转写 pipeline
- [ ] IPC 实时推送转写结果
- [ ] React 端实时字幕显示组件
- [ ] 字幕开关（实时字幕 on/off）
- [ ] 字幕刷新间隔配置

**交付物**：录音时说中文，2-3 秒后在屏幕上看到字幕

### Phase 6：导出系统
**目标**：多种格式导出

- [ ] TXT 导出（含说话人标签）
- [ ] JSON 导出（完整结构化）
- [ ] Markdown 导出（按人分组，可读性好）
- [ ] SRT 字幕导出（带时间轴）
- [ ] 批量导出（ZIP 打包）
- [ ] 导出时选择是否包含音频

**交付物**：转写结果可以各种格式导出，格式正确

### Phase 7：设置 & 系统集成
**目标**：完整的设置面板和系统集成

- [ ] 麦克风设备选择
- [ ] 语言设置
- [ ] 实时字幕配置
- [ ] 导出格式默认设置
- [ ] 系统托盘（最小化到托盘）
- [ ] 开机启动
- [ ] 模型管理
- [ ] 数据管理（导入/导出数据库）

**交付物**：接近成品的设置体验

### Phase 8：打包 & 发布
**目标**：产出可分发的安装包

- [ ] macOS：.dmg 安装包，签名（可选）
- [ ] Windows：NSIS installer (.exe)
- [ ] 首次启动引导（麦克风权限）
- [ ] 自动下载缺失模型
- [ ] 应用图标和命名

---

## 六、技术难点 & 解决方案

### 6.1 Electron + Python IPC 稳定性
- **问题**：Python 子进程崩溃会影响 Electron
- **方案**：使用 `--隔离模式` 的 Node child_process.spawn，设置重启机制，Python 端做好异常捕获，每条 RPC 返回都有错误码

### 6.2 大音频文件处理（>1小时）
- **问题**：整段音频处理占用内存大
- **方案**：
  - pyannote 支持分块处理（chunksize 参数）
  - SenseVoice 也支持分块
  - 录音文件分段处理（每 10 分钟一切）

### 6.3 说话人数量未知
- **方案**：
  - pyannote 的 `min_speakers` / `max_speakers` 参数
  - 会议场景默认 `min=2, max=10`
  - 用户可在结果页手动调整

### 6.4 实时字幕延迟与准确率平衡
- **问题**：片段太短（1-2秒）转写不准，太长延迟高
- **方案**：
  - VAD 检测到语音结束后再等 0.5 秒（截取完整句子）
  - 刷新间隔可配置（1s/2s/3s）
  - 实时字幕仅供参考，最终以完整转写为准

### 6.5 中文标点问题
- **方案**：SenseVoice 自带标点，比 Whisper 好很多
- 如仍需优化：可接入标点恢复模型（zhwiki-punctuation）

### 6.6 macOS 麦克风权限
- **方案**：electron-builder 配置 `NSMicrophoneUsageDescription`
- 首次请求权限被拒：弹出系统设置引导

### 6.7 低配电脑性能
- **方案**：
  - SenseVoice Small 已经很快（0.27B 参数）
  - Mac M 系列：GPU/CPU 共享内存，16GB 够用
  - Windows 集显：可以用 CPU 推理（慢但能跑）
  - 可在设置里加"性能模式"（牺牲速度换兼容性）

---

## 七、文件结构

```
meeting-recorder/
├── electron/
│   ├── main.ts                     # Electron 主进程
│   ├── preload.ts                  # 预加载脚本（contextBridge IPC）
│   ├── ipc/                        # IPC 处理器
│   │   ├── recorder.ts
│   │   └── files.ts
│   └── python/                     # Python 子进程管理
│       ├── subprocess.ts
│       └── rpc-client.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── RecorderView/
│   │   │   ├── RecorderView.tsx
│   │   │   ├── Waveform.tsx
│   │   │   ├── RealtimeCaptions.tsx
│   │   │   └── RecordingControls.tsx
│   │   ├── HistoryView/
│   │   │   ├── HistoryView.tsx
│   │   │   ├── MeetingCard.tsx
│   │   │   └── SearchBar.tsx
│   │   ├── DetailView/
│   │   │   ├── DetailView.tsx
│   │   │   ├── AudioPlayer.tsx
│   │   │   ├── TranscriptEditor.tsx
│   │   │   ├── SpeakerList.tsx
│   │   │   └── ExportPanel.tsx
│   │   ├── ImportView/
│   │   │   └── ImportView.tsx
│   │   └── SettingsView/
│   │       └── SettingsView.tsx
│   ├── hooks/
│   │   ├── useRecorder.ts
│   │   ├── useMeeting.ts
│   │   └── useSettings.ts
│   ├── stores/
│   │   ├── recorderStore.ts
│   │   ├── meetingStore.ts
│   │   └── settingsStore.ts
│   ├── lib/
│   │   ├── db.ts                   # SQLite 操作封装
│   │   ├── audio.ts                # 音频处理工具
│   │   └── export.ts               # 导出格式生成
│   └── styles/
│       └── globals.css
├── python/
│   ├── rpc_server.py               # JSON-RPC 主入口
│   ├── audio_capture.py            # 音频录制
│   ├── vad.py                      # Silero-VAD
│   ├── diarizer.py                 # pyannote 说话人分割
│   ├── transcriber.py              # SenseVoice 转写
│   ├── merger.py                   # 结果合并
│   └── requirements.txt
├── resources/
│   ├── ffmpeg/                     # FFmpeg 静态二进制
│   │   ├── ffmpeg-mac（macOS）
│   │   └── ffmpeg.exe（Windows）
│   └── icon.png
├── package.json
├── electron-builder.yml
├── vite.config.ts
└── tsconfig.json
```

---

## 八、依赖版本（参考）

```
# Python
funasr==2.0.0              # SenseVoice / FunAudioLLM
pyannote.audio==3.3.1     # Speaker Diarization
pyannote.database==5.1.0
sounddevice==0.5.2         # 跨平台音频录制
silero-vad==1.1.0          # VAD
numpy==1.26.0
torch==2.2.0               # PyTorch（FunAudioLLM 依赖）
better-sqlite3==11.0.0     # SQLite

# Node
electron==33.0.0
electron-builder==25.1.0
react==18.3.1
react-dom==18.3.1
typescript==5.6.0
vite==5.4.0
@electron/rebuild
zustand==4.5.0
i18next==23.11.0
react-i18next==14.1.0
better-sqlite3==11.3.0
tailwindcss==3.4.0
lucide-react==0.400.0      # 图标库
```

---

## 九、验收标准

| 模块 | 验收标准 |
|------|----------|
| 录音 | 录 10 分钟，播放正常；文件可被其他播放器打开 |
| 说话人分割 | 两人对话 10 分钟，能区分两个说话人，正确率 > 80% |
| 转写 | 中文普通话 10 分钟，WER < 15%（肉眼可读）|
| 实时字幕 | 录音时说中文，3 秒内显示字幕 |
| 历史搜索 | 搜索"北京"能精确找到含该词的会议 |
| 导出 | 导出 MD 格式，用 Markdown 编辑器打开格式正确 |
| 打包 | macOS .dmg 安装后，Windows .exe 安装后，均可正常运行 |
| 低配电脑 | Mac M1 16GB / Windows 集显，能完成 30 分钟会议转写（允许慢） |

---

## 十、开放问题（待确认）

~~1. **会议导入**：支持导入 mp3/m4a 等格式，是否需要？**→ 确认：需要**~~
~~2. **导出格式**：TXT / JSON / Markdown / SRT 是否都需要？**→ 确认：都需要**~~
~~3. **历史记录**：需要回放和搜索功能，是否确认？**→ 确认**~~
~~4. **语言**：主要中文，是否需要英文会议支持？**→ 确认：不需要英文支持**~~
~~5. **多人会议上限**：最多支持几个人同时开会？**→ 确认：8 人**~~

---

## 十一、已确认规格

| 项目 | 确认值 |
|------|--------|
| 目标用户 | 个人，本地离线 |
| 平台 | Windows + macOS |
| 语音转写 | SenseVoice Small（中文优先，不需要英文）|
| 说话人上限 | 8 人 |
| 导入格式 | MP3, M4A, WAV, FLAC, OGG, OPUS, AAC, WMA |
| 导出格式 | TXT, JSON, Markdown, SRT |
| 历史功能 | 回放 + 全文搜索 + 标签 + 收藏 |

---

*Plan v2 — 更新了 SenseVoice 替代 Whisper，新增丰富功能模块 | 2026-04-15*
