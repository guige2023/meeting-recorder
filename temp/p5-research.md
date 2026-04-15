# Phase 5 调研报告：实时字幕技术路径

## 调研时间
2026-04-15

## 关键技术问题

### Q1: Silero-VAD 支持汉语吗？

**结论：✅ 支持，且与语言无关。**

- Silero-VAD 是**语音活动检测**模型（Speech vs Non-Speech），不识别语言内容
- 它输出的是"这段音频是语音还是静音/噪音"的概率值
- 适用于任何语言，包括中文普通话、粤语等
- GitHub 上"no Chinese"的讨论是针对 Silero 的 STT 模型，**不是 VAD**

### Q2: 实时转写如何接入现有录音管线？

**现有管线问题：**
- `AudioCapture`: 写 WAV 文件到磁盘，音频不经过内存队列
- `RealtimeTranscriberPool`: 存在但未连接，是死代码
- `RealtimeCaptions.tsx`: 前端已存在，接收 `onRealtimeCaption` 事件

**解决方案：**

```
AudioCapture.audio_callback
    │
    ├── write to WAV file (existing)
    │
    └── recording['live_buffer'] (np.array, rolling 30s)
            │
            └── RealtimeTranscriberPool._vad_loop()
                    │
                    ├── Silero-VAD detect_speech() per 512 samples
                    ├── Track speech onset/offset
                    └── On silence-after-speech → transcribe(buffer) → send_notification('realtime_caption')
                            │
                            └── Electron: onRealtimeCaption() → recorderStore.addCaption() → RealtimeCaptions.tsx
```

### Q3: 语音识别 + VAD 流式处理模式

参考 sherpa-onnx `vad-with-non-streaming-asr.py` 和 Silero-VAD pyaudio-streaming 示例：

**推荐模式（VAD 触发式）：**
1. 音频 512 samples (32ms) / chunk 送入 VAD
2. 维护滚动缓冲区（最近 30s）
3. 跟踪状态：`was_speech` + `silence_count`
4. 检测到 `was_speech=True` → `silence_count >= 20`（约 640ms 静音）→ 触发转写
5. 转写完成后清空已处理音频，保留未处理部分

**SenseVoice 语言支持：**
- `funasr.AutoModel(model='iic/SenseVoiceSmall')` 原生支持：`zh, en, ja, ko, yue`
- `language='auto'` 自动检测，zh 优先

## 实现计划

### Step 2: AudioCapture 改造
- `start_capture()` 新增 `live_buffer: np.ndarray`（滚动 30s）
- `audio_callback` 同步更新 `live_buffer`
- 新增 `get_live_audio(recording_id) -> np.ndarray` 方法

### Step 3: RealtimeTranscriberPool 重构
- 接入 `AudioCapture.get_live_audio()`
- 重写 `_transcribe_loop()` 为 VAD 驱动模式
- 使用现有 `send_notification('realtime_caption', {...})` 推送结果
- `capture_start` RPC 支持 `realtime: bool` 参数控制是否启动

### Step 4: 前端 RealtimeCaptions 增强
- 滚动到底部（最新字幕）
- VAD 状态可视化（"正在检测语音..."）
- 实时字幕与最终转写结果合并展示
