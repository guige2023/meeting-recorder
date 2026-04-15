"""
转写服务模块
使用 SenseVoice 进行语音转写，pyannote 进行说话人分割
"""

import json
import sqlite3
import os
import uuid
import threading
from datetime import datetime
from pathlib import Path

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'meetings.db')

class TranscriptionService:
    def __init__(self):
        self._init_db()
        self._init_models()

    def _init_db(self):
        """初始化数据库"""
        db_dir = os.path.dirname(DB_PATH)
        if db_dir and not os.path.exists(db_dir):
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

    def _init_models(self):
        """初始化模型（延迟加载）"""
        self.models_loaded = False

    def _load_models(self):
        """加载模型"""
        if self.models_loaded:
            return

        try:
            # 延迟导入，避免启动慢
            from funasr import AutoModel

            # 加载 SenseVoice
            self.model = AutoModel(
                model='iic/SenseVoiceSmall',
                device='cpu'  # TODO: 检测 CUDA
            )

            # 加载 pyannote
            # from pyannote.audio import Pipeline
            # self.diarization_pipeline = Pipeline.from_pretrained(
            #     'pyannote/speaker-diarization@2.1'
            # )

            self.models_loaded = True
            print(json.dumps({
                'jsonrpc': '2.0',
                'method': 'model_loaded',
                'params': {}
            }))
            sys.stdout.flush()

        except Exception as e:
            print(f'Failed to load models: {e}', file=sys.stderr)
            import traceback
            traceback.print_exc()

    def process_file(self, file_path, recording_id=None):
        """处理音频文件"""
        if not self.models_loaded:
            self._load_models()

        if not recording_id:
            recording_id = str(uuid.uuid4())

        # 创建会议记录
        now = datetime.now()
        title = f'会议 {now.strftime("%Y-%m-%d %H:%M")}'
        meeting_id = str(uuid.uuid4())

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO meetings (id, title, created_at, audio_path, status)
            VALUES (?, ?, ?, ?, ?)
        ''', (meeting_id, title, now.timestamp(), file_path, 'processing'))
        conn.commit()
        conn.close()

        # 发送进度更新
        self._send_progress(meeting_id, 0.1, '正在识别说话人...')

        # TODO: 说话人分割
        # TODO: 语音转写
        # TODO: 结果合并

        # 发送完成
        self._send_progress(meeting_id, 1.0, '处理完成')

    def _send_progress(self, meeting_id, progress, message):
        """发送进度更新"""
        msg = {
            'jsonrpc': '2.0',
            'method': 'processing_progress',
            'params': {
                'meetingId': meeting_id,
                'progress': progress,
                'message': message
            }
        }
        print(json.dumps(msg))
        sys.stdout.flush()

    def get_meetings(self):
        """获取所有会议"""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute('''
            SELECT * FROM meetings
            ORDER BY created_at DESC
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

    def delete_meeting(self, meeting_id):
        """删除会议"""
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('DELETE FROM segments WHERE meeting_id = ?', (meeting_id,))
        c.execute('DELETE FROM speakers WHERE meeting_id = ?', (meeting_id,))
        c.execute('DELETE FROM meetings WHERE id = ?', (meeting_id,))
        conn.commit()
        conn.close()

    def toggle_favorite(self, meeting_id):
        """切换收藏状态"""
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('UPDATE meetings SET favorite = NOT favorite WHERE id = ?', (meeting_id,))
        conn.commit()
        conn.close()

    def update_meeting(self, meeting_id, updates):
        """更新会议信息"""
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        allowed_fields = ['title', 'notes', 'tags', 'speaker_count']
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

import sys
