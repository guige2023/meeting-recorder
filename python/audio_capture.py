"""
音频录制模块
使用 sounddevice 进行跨平台音频录制
支持实时音频流（用于实时字幕 VAD 检测）
"""

import json
import queue
import sounddevice as sd
import numpy as np
import threading
import time
import wave
import os
import uuid
import sys
from collections import deque
from datetime import datetime

class AudioCapture:
    def __init__(self, data_dir: str = None):
        self.recordings = {}  # recording_id -> RecordingState
        self.stream = None
        self.lock = threading.Lock()
        self._data_dir = data_dir or os.path.join(os.path.dirname(__file__), '..', 'data')

    def start_capture(self, sample_rate=16000, channels=1, enable_realtime=False):
        """
        开始录音

        Args:
            sample_rate: 采样率（默认 16000）
            channels: 声道数（默认 1 单声道）
            enable_realtime: 是否启用实时音频缓冲（用于实时字幕）

        Returns:
            {'recordingId': ..., 'startTime': ..., 'wavPath': ...}
        """
        recording_id = str(uuid.uuid4())
        now = time.time()

        # 实时缓冲：deque 自动丢弃旧数据，maxlen=300 ≈ 30 秒（每 0.1s 一 chunk）
        live_buffer = deque(maxlen=300)

        # 创建录制状态
        recording = {
            'id': recording_id,
            'sample_rate': sample_rate,
            'channels': channels,
            'start_time': now,
            'paused_time': 0,
            'total_paused': 0,
            'status': 'recording',
            'audio_queue': queue.Queue(),
            'frames': [],
            'wav_path': self._get_wav_path(recording_id),
            'live_buffer': live_buffer,        # 滚动 30s 实时音频缓冲
            'enable_realtime': enable_realtime,
        }

        self.recordings[recording_id] = recording

        # 启动录音线程
        threading.Thread(
            target=self._record_thread,
            args=(recording_id,),
            daemon=True
        ).start()

        # 启动状态推送线程
        threading.Thread(
            target=self._status_thread,
            args=(recording_id,),
            daemon=True
        ).start()

        return {
            'recordingId': recording_id,
            'startTime': now,
            'wavPath': recording['wav_path']
        }

    def _record_thread(self, recording_id):
        """录音线程"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return

        try:
            # 创建 WAV 文件
            wf = wave.open(recording['wav_path'], 'wb')
            wf.setsampwidth(2)  # 16-bit
            wf.setnchannels(recording['channels'])
            wf.setframerate(recording['sample_rate'])

            def audio_callback(indata, frames, time_info, status):
                if status:
                    print(f'Audio callback status: {status}', file=sys.stderr)

                if recording['status'] == 'recording':
                    # int16 → float32 归一化
                    float_data = indata.astype(np.float32) / 32768.0
                    # 多声道 → 单声道均值
                    if recording['channels'] > 1:
                        float_data = float_data.mean(axis=1)
                    else:
                        float_data = float_data.squeeze()

                    # 写入 WAV
                    audio_data = indata.tobytes()
                    wf.writeframes(audio_data)
                    recording['frames'].append(audio_data)

                    # 写入实时缓冲（用于 VAD）
                    if recording['enable_realtime']:
                        recording['live_buffer'].append(float_data)

                    # 计算音频电平
                    rms = np.sqrt(np.mean(float_data ** 2))
                    recording['audio_level'] = min(rms * 10, 1.0)

            # 打开流
            with sd.InputStream(
                samplerate=recording['sample_rate'],
                channels=recording['channels'],
                dtype='int16',
                callback=audio_callback
            ):
                # 等待直到停止
                while recording['status'] != 'stopped':
                    time.sleep(0.1)

            wf.close()

        except Exception as e:
            print(f'Recording error: {e}', file=sys.stderr)
            import traceback
            traceback.print_exc()

    def _status_thread(self, recording_id):
        """状态推送线程"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return

        while recording['status'] != 'stopped':
            if recording['status'] == 'recording':
                duration = float(time.time() - recording['start_time'] - recording['total_paused'])
                audio_level = float(recording.get('audio_level', 0))
                status_msg = {
                    'jsonrpc': '2.0',
                    'method': 'capture_status',
                    'params': {
                        'recordingId': recording_id,
                        'status': 'recording',
                        'duration': duration,
                        'audioLevel': audio_level,
                        'speakersCount': 0
                    }
                }
                print(json.dumps(status_msg))
                sys.stdout.flush()

            time.sleep(0.5)

    def get_live_audio(self, recording_id: str) -> np.ndarray:
        """
        获取当前实时音频缓冲（最近约 30 秒）
        线程安全：deque 操作在 CPython 中受 GIL 保护

        Returns:
            numpy.ndarray (float32, 1D) 或空数组
        """
        recording = self.recordings.get(recording_id)
        if not recording:
            return np.array([], dtype=np.float32)

        buf = recording.get('live_buffer')
        if not buf:
            return np.array([], dtype=np.float32)

        # deque 合并为连续数组（已有 GIL 保护）
        return np.concatenate(list(buf)) if buf else np.array([], dtype=np.float32)

    def pause_capture(self, recording_id):
        """暂停录音"""
        recording = self.recordings.get(recording_id)
        if recording and recording['status'] == 'recording':
            recording['status'] = 'paused'
            recording['paused_time'] = time.time()

    def resume_capture(self, recording_id):
        """恢复录音"""
        recording = self.recordings.get(recording_id)
        if recording and recording['status'] == 'paused':
            recording['total_paused'] += time.time() - recording['paused_time']
            recording['status'] = 'recording'

    def stop_capture(self, recording_id):
        """停止录音"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return {'error': 'Recording not found'}

        recording['status'] = 'stopped'

        duration = time.time() - recording['start_time'] - recording['total_paused']

        return {
            'recordingId': recording_id,
            'wavPath': recording['wav_path'],
            'duration': duration,
            'sampleRate': recording['sample_rate']
        }

    def get_status(self, recording_id):
        """获取录音状态"""
        recording = self.recordings.get(recording_id)
        if not recording:
            return {'error': 'Recording not found'}

        duration = time.time() - recording['start_time'] - recording['total_paused']

        return {
            'recordingId': recording_id,
            'status': recording['status'],
            'duration': duration,
            'audioLevel': recording.get('audio_level', 0),
            'speakersCount': 0
        }

    def _get_wav_path(self, recording_id):
        """获取 WAV 文件路径，按月份归档到 data/YYYY-MM/"""
        month_dir = datetime.now().strftime('%Y-%m')
        save_dir = os.path.join(self._data_dir, month_dir)
        os.makedirs(save_dir, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        return os.path.join(save_dir, f'meeting_{timestamp}_{recording_id[:8]}.wav')
