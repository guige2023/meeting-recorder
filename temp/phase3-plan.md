# Phase 3: 历史记录 & 搜索 — 执行计划
创建时间: 2026-04-15 22:00

## 目标
会议列表页添加搜索栏（FTS5 后端搜索）、筛选器（日期范围 + 收藏 + 说话人数量）、收藏功能。

## 当前状态
- `search_meetings(query)` 后端已有 FTS5，但只接受 query 字符串
- 前端搜索框只过滤 `meeting.title`，没用 FTS5
- 收藏/说话人数量过滤完全缺失

## 步骤
- [ ] 步骤1: 后端 transcriber.py — search_meetings 扩展为多维过滤
- [ ] 步骤2: 前端 meetingStore.ts — searchMeetings 接受 SearchFilters 参数
- [ ] 步骤3: 前端 HistoryView.tsx — 接入后端 FTS5 + 新增筛选器 UI
- [ ] 步骤4: 验证 npm run build

## 数据结构
```python
# 后端接收格式
{
  "query": "关键词",          # FTS5 搜索，可为空
  "dateRange": "all|today|week|month|custom",
  "customStart": 1700000000,  # dateRange=custom 时使用
  "customEnd": 1710000000,
  "favorites": null|true|false,
  "speakerCount": null|1|2|3|4|5,  # null=不限，数字=最少该数量
}
```

## 当前进度
正在执行: 步骤1
