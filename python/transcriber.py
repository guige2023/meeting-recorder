"""
转写服务模块
整合：说话人分割（pyannote）+ 语音转写（SenseVoice）+ 结果合并
"""

import json
import sqlite3
import os
import uuid
import threading
import wave
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'meetings.db')

class TranscriptionService:
    def __init__(self):
        self.diarizer = None
        self.transcriber = None
        self.models_loaded = False
        self._init_db()

    def _init_db(self):
        """初始化数据库"""
        db_dir = os.path.dirname(DB_PATH)
        if db_dir and not os.exists(db_dir):
            os.makedirs(db_dir)

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        c.execute('''
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                duration REAL,
                audio_path TEXT,
                status TEXT DEFAULT 'pending',
                favorite INTEGER DEFAULT 0,
                tags TEXT,
                notes TEXT,
                speaker_count INTEGER,
                file_size INTEGER
            )
        ''')

        c.execute('''
            CREATE TABLE IF NOT EXISTS speakers (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                label TEXT NOT NULL,
                name TEXT,
                color TEXT,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            )
        ''')

        c.execute('''
            CREATE TABLE IF NOT EXISTS segments (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                speaker_id TEXT,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                text TEXT NOT NULL,
                confidence REAL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
                FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE CASCADE
            )
        ''')

        # 创建 FTS 表用于全文搜索
        c.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
                text,
                segment_id UNINDEXED,
                meeting_id UNINDEXED
            )
        ''')

        conn.commit()
        conn.close()

    def _load_models(self):
        """加载模型"""
        if self.models_loaded:
            return

        import sys

        try:
            # 加载 pyannote（说话人分割）
            try:
                import torch
                from pyannote.audio import Pipeline

                device = 'cuda' if torch.cuda.is_available() else 'cpu'
                self.diarization_pipeline = Pipeline.from_pretrained(
                    'pyannote/speaker-diarization@2.1'
                )
                self.diarization_pipeline.to(torch.device(device))
                print('pyannote loaded', file=sys.stderr)
            except Exception as e:
                print(f'pyannote load error: {e}', file=sys.stderr)

            # 加载 SenseVoice
            try:
                from funasr import AutoModel
                self.transcription_model = AutoModel(
                    model='iic/SenseVoiceSmall',
                    device='cpu'  # TODO: 检测 CUDA
                )
                print('SenseVoice loaded', file=sys.stderr)
            except Exception as e:
                print(f'SenseVoice load error: {e}', file=sys.stderr)

            self.models_loaded = True

        except Exception as e:
            print(f'Model loading error: {e}', file=sys.stderr)
            import traceback
            traceback.print_exc()

    def _send_progress(self, meeting_id: str, progress: float, message: str):
        """发送进度更新（打印到 stdout，供 Electron 捕获）"""
        msg = {
            'jsonrpc': '2.0',
            'method': 'processing_progress',
            'params': {
                'meetingId': meeting_id,
                'progress': progress,
                'message': message
            }
        }
        print(json.dumps(msg), flush=True)

    def process_file(self, file_path: str, meeting_id: str = None, language: str = 'zh'):
        """
        处理音频文件：说话人分割 -> 转写 -> 合并结果

        Args:
            file_path: 音频文件路径
            meeting_id: 会议 ID（可选）
            language: 语言
        """
        import sys

        if not self.models_loaded:
            self._load_models()

        if not meeting_id:
            meeting_id = str(uuid.uuid4())

        now = datetime.now()
        timestamp = now.timestamp()

        # 获取音频时长
        try:
            import soundfile as sf
            audio_info = sf.info(file_path)
            duration = audio_info.duration
        except:
            duration = 0

        # 创建会议记录
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO meetings (id, title, created_at, audio_path, status, duration)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (meeting_id, f'会议 {now.strftime("%Y-%m-%d %H:%M")}', timestamp, file_path, 'processing', duration))
        conn.commit()
        conn.close()

        self._send_progress(meeting_id, 0.05, '正在加载模型...')

        # 步骤1: 说话人分割
        self._send_progress(meeting_id, 0.1, '正在识别说话人...')
        diarization_result = []
        if self.diarization_pipeline:
            try:
                diarization_result = self._run_diarization(file_path)
            except Exception as e:
                print(f'Diarization error: {e}', file=sys.stderr)

        # 步骤2: 语音转写
        self._send_progress(meeting_id, 0.3, '正在转写...')
        transcription_result = []
        if self.transcription_model:
            try:
                transcription_result = self._run_transcription(file_path, language)
            except Exception as e:
                print(f'Transcription error: {e}', file=sys.stderr)

        # 步骤3: 结果合并
        self._send_progress(meeting_id, 0.7, '正在合并结果...')
        merged_result = self._merge_results(diarization_result, transcription_result)

        # 步骤4: 保存到数据库
        self._send_progress(meeting_id, 0.85, '正在保存...')
        self._save_to_db(meeting_id, merged_result, diarization_result)

        # 更新状态
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            'UPDATE meetings SET status = ? WHERE id = ?',
            ('completed', meeting_id)
        )
        conn.commit()
        conn.close()

        self._send_progress(meeting_id, 1.0, '处理完成')

    def _run_diarization(self, audio_path: str) -> List[Dict]:
        """运行说话人分割"""
        import torch

        diarization = self.diarization_pipeline(audio_path, min_speakers=2, max_speakers=8)

        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                'start': turn.start,
                'end': turn.end,
                'speaker': speaker
            })
        return segments

    def _run_transcription(self, audio_path: str, language: str) -> List[Dict]:
        """运行语音转写"""
        result = self.transcription_model.generate(
            input=audio_path,
            language='auto' if language == 'auto' else language,
            use_itn=True,
            batch_size_s=60
        )

        segments = []
        if result and len(result) > 0:
            res = result[0]
            text = res.get('text', '')
            timestamp = res.get('timestamp', [])

            if timestamp:
                for item in timestamp:
                    segments.append({
                        'start': item[0] / 1000.0,
                        'end': item[1] / 1000.0,
                        'text': item[2]
                    })
            else:
                segments.append({
                    'start': 0,
                    'end': 0,
                    'text': text
                })

        return segments

    def _merge_results(
        self,
        diarization: List[Dict],
        transcription: List[Dict]
    ) -> List[Dict]:
        """
        合并说话人分割和转写结果
        策略：对于每个转写片段，找到其时间段内主要的说话人
        """
        if not diarization:
            # 没有说话人分割结果，所有片段归为 "Speaker 1"
            return [
                {**seg, 'speaker': 'SPEAKER_00', 'speaker_label': 'Speaker 1'}
                for seg in transcription
            ]

        if not transcription:
            return []

        merged = []
        for tseg in transcription:
            t_start = tseg['start']
            t_end = tseg['end']
            t_text = tseg['text']

            # 找到与当前转写片段重叠的说话人片段
            overlap_speakers = {}
            for dseg in diarization:
                d_start = dseg['start']
                d_end = dseg['end']

                # 计算重叠
                overlap_start = max(t_start, d_start)
                overlap_end = min(t_end, d_end)
                overlap = max(0, overlap_end - overlap_start)

                if overlap > 0:
                    speaker = dseg['speaker']
                    if speaker not in overlap_speakers:
                        overlap_speakers[speaker] = 0
                    overlap_speakers[speaker] += overlap

            # 选择重叠最多的说话人
            if overlap_speakers:
                main_speaker = max(overlap_speakers.keys(), key=lambda s: overlap_speakers[s])
            else:
                # 没有重叠，使用上一个说话人
                main_speaker = merged[-1]['speaker'] if merged else 'SPEAKER_00'

            merged.append({
                'start': t_start,
                'end': t_end,
                'text': t_text,
                'speaker': main_speaker,
                'speaker_label': main_speaker.replace('SPEAKER_', 'Speaker ')
            })

        return merged

    def _save_to_db(self, meeting_id: str, merged: List[Dict], diarization: List[Dict]):
        """保存结果到数据库"""
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        # 获取唯一的说话人
        speakers = list(set(m['speaker'] for m in merged))
        speaker_colors = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
        speaker_map = {}

        for i, sp in enumerate(sorted(speakers)):
            sp_id = str(uuid.uuid4())
            speaker_map[sp] = sp_id
            c.execute('''
                INSERT INTO speakers (id, meeting_id, label, name, color)
                VALUES (?, ?, ?, ?, ?)
            ''', (sp_id, meeting_id, sp, sp.replace('SPEAKER_', 'Speaker '), speaker_colors[i % len(speaker_colors)]))

        # 保存转写片段
        for seg in merged:
            seg_id = str(uuid.uuid4())
            speaker_id = speaker_map.get(seg['speaker'])
            c.execute('''
                INSERT INTO segments (id, meeting_id, speaker_id, start_time, end_time, text)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (seg_id, meeting_id, speaker_id, seg['start'], seg['end'], seg['text']))

            # 添加到 FTS 索引
            c.execute('''
                INSERT INTO segments_fts (text, segment_id, meeting_id)
                VALUES (?, ?, ?)
            ''', (seg['text'], seg_id, meeting_id))

        # 更新说话人数量
        c.execute('''
            UPDATE meetings SET speaker_count = ? WHERE id = ?
        ''', (len(speakers), meeting_id))

        conn.commit()
        conn.close()

    def get_meetings(self) -> Dict:
        """获取所有会议"""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute('''
            SELECT * FROM meetings ORDER BY created_at DESC
        ''')

        meetings = []
        for row in c.fetchall():
            meetings.append({
                'id': row['id'],
                'title': row['title'],
                'createdAt': row['created_at'],
                'duration': row['duration'] or 0,
                'audioPath': row['audio_path'],
                'status': row['status'],
                'favorite': bool(row['favorite']),
                'tags': json.loads(row['tags'] or '[]'),
                'speakerCount': row['speaker_count'] or 0,
                'notes': row['notes'] or ''
            })

        conn.close()
        return {'meetings': meetings}

    def get_meeting_detail(self, meeting_id: str) -> Optional[Dict]:
        """获取会议详情（含转写内容）"""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # 获取会议信息
        c.execute('SELECT * FROM meetings WHERE id = ?', (meeting_id,))
        meeting = c.fetchone()
        if not meeting:
            conn.close()
            return None

        # 获取说话人
        c.execute('SELECT * FROM speakers WHERE meeting_id = ?', (meeting_id,))
        speakers = {row['id']: dict(row) for row in c.fetchall()}

        # 获取转写片段
        c.execute('''
            SELECT s.*, sp.label as speaker_label, sp.name as speaker_name, sp.color as speaker_color
            FROM segments s
            LEFT JOIN speakers sp ON s.speaker_id = sp.id
            WHERE s.meeting_id = ?
            ORDER BY s.start_time
        ''', (meeting_id,))
        segments = [dict(row) for row in c.fetchall()]

        conn.close()

        return {
            'meeting': dict(meeting),
            'speakers': speakers,
            'segments': segments
        }

    def delete_meeting(self, meeting_id: str):
        """删除会议"""
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        # 删除 FTS 索引
        c.execute('SELECT id FROM segments WHERE meeting_id = ?', (meeting_id,))
        segment_ids = [row[0] for row in c.fetchall()]
        for sid in segment_ids:
            c.execute('DELETE FROM segments_fts WHERE segment_id = ?', (sid,))

        c.execute('DELETE FROM segments WHERE meeting_id = ?', (meeting_id,))
        c.execute('DELETE FROM speakers WHERE meeting_id = ?', (meeting_id,))
        c.execute('DELETE FROM meetings WHERE id = ?', (meeting_id,))
        conn.commit()
        conn.close()

    def toggle_favorite(self, meeting_id: str):
        """切换收藏状态"""
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('UPDATE meetings SET favorite = NOT favorite WHERE id = ?', (meeting_id,))
        conn.commit()
        conn.close()

    def update_meeting(self, meeting_id: str, updates: Dict):
        """更新会议信息"""
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        allowed_fields = ['title', 'notes', 'tags']
        set_clause = []
        values = []

        for key, value in updates.items():
            if key in allowed_fields:
                if key == 'tags':
                    value = json.dumps(value)
                set_clause.append(f'{key} = ?')
                values.append(value)

        if set_clause:
            values.append(meeting_id)
            c.execute(f'UPDATE meetings SET {", ".join(set_clause)} WHERE id = ?', values)
            conn.commit()

        conn.close()

    def search_meetings(self, query: str) -> List[Dict]:
        """搜索会议内容"""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute('''
            SELECT DISTINCT m.*
            FROM meetings m
            JOIN segments_fts fts ON m.id = fts.meeting_id
            WHERE segments_fts MATCH ?
            ORDER BY m.created_at DESC
        ''', (query,))

        meetings = []
        for row in c.fetchall():
            meetings.append({
                'id': row['id'],
                'title': row['title'],
                'createdAt': row['created_at'],
                'duration': row['duration'] or 0,
                'audioPath': row['audio_path'],
                'status': row['status'],
                'favorite': bool(row['favorite']),
                'tags': json.loads(row['tags'] or '[]'),
                'speakerCount': row['speaker_count'] or 0,
                'notes': row['notes'] or ''
            })

        conn.close()
        return meetings
