# 录音导入功能 v1.0.7 实施计划

## 目标
在 HistoryView 添加「导入录音」按钮，支持拖拽或选择 .wav/.mp3/.m4a 文件，调用 ASR 转写后存入 DB。

## 步骤
- [ ] 1. frontend: HistoryView — 添加导入按钮 + 拖拽区
- [ ] 2. preload: 添加 import_audio_file IPC
- [ ] 3. main.ts: 添加 import_audio_file handler（文件复制到 data/）
- [ ] 4. rpc_server.py: 添加 import_audio_file handler
- [ ] 5. meetingStore: 添加 importMeeting action
- [ ] 6. 版本升到 1.0.7，commit
- [ ] 7. 构建 DMG
