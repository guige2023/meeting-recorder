"""
实时字幕模块
在录音过程中实时进行语音识别并推送字幕
"""

import numpy as np
import threading
import queue
import json
import sys
import time

class RealtimeTranscriber:
    def __init__(self):
        self.model = None
        self.models_loaded = False
        self.chunk_duration = 3.0  # 每3秒处理一次
        self.sample_rate = 16000

    def load_models(self):
        """加载模型"""
        if self.models_loaded:
            return

        try:
            from funasr import AutoModel
            import torch

            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            self.model = AutoModel(
                model='iic/SenseVoiceSmall',
                device=device,
                disable_update=True
            )
            self.models_loaded = True
            print('Realtime transcriber model loaded', file=sys.stderr)
        except Exception as e:
            print(f'RealtimeTranscriber load error: {e}', file=sys.stderr)
            import traceback
            traceback.print_exc()

    def transcribe_chunk(self, audio_chunk: np.ndarray, language: str = 'zh') -> str:
        """
        转写单个音频片段

        Args:
            audio_chunk: numpy array, 16kHz, float32
            language: 语言

        Returns:
            转写文本
        """
        if not self.models_loaded:
            self.load_models()

        if self.model is None:
            return ''

        try:
            result = self.model.generate(
                input=audio_chunk,
                language='auto' if language == 'auto' else language,
                use_itn=True
            )
            if result:
                return result[0].get('text', '')
        except Exception as e:
            print(f'Transcribe chunk error: {e}', file=sys.stderr)

        return ''

    def send_realtime_caption(self, recording_id: str, text: str, start_time: float):
        """发送实时字幕到 stdout（Electron 捕获）"""
        if not text.strip():
            return
        msg = {
            'jsonrpc': '2.0',
            'method': 'realtime_caption',
            'params': {
                'recordingId': recording_id,
                'text': text,
                'startTime': start_time
            }
        }
        print(json.dumps(msg), flush=True)


class RealtimeTranscriberPool:
    """
    实时转写器池
    每个录音维护一个转写器实例
    """

    def __init__(self):
        self.transcribers = {}  # recording_id -> RealtimeTranscriber
        self.threads = {}       # recording_id -> Thread
        self.stop_events = {}   # recording_id -> threading.Event
        self.audio_queues = {}  # recording_id -> Queue

    def start(self, recording_id: str, get_audio_chunk_fn, language: str = 'zh'):
        """启动实时转写"""
        if recording_id in self.transcribers:
            return

        transcriber = RealtimeTranscriber()
        self.transcribers[recording_id] = transcriber
        self.audio_queues[recording_id] = queue.Queue()
        stop_event = threading.Event()
        self.stop_events[recording_id] = stop_event

        thread = threading.Thread(
            target=self._transcribe_loop,
            args=(recording_id, transcriber, get_audio_chunk_fn, language, stop_event),
            daemon=True
        )
        self.threads[recording_id] = thread
        thread.start()

    def stop(self, recording_id: str):
        """停止实时转写"""
        if recording_id in self.stop_events:
            self.stop_events[recording_id].set()
        if recording_id in self.threads:
            self.threads[recording_id].join(timeout=2)
        self.transcribers.pop(recording_id, None)
        self.threads.pop(recording_id, None)
        self.stop_events.pop(recording_id, None)
        self.audio_queues.pop(recording_id, None)

    def _transcribe_loop(
        self,
        recording_id: str,
        transcriber: RealtimeTranscriber,
        get_audio_chunk_fn,
        language: str,
        stop_event: threading.Event
    ):
        """转写循环"""
        transcriber.load_models()

        chunk_size = int(transcriber.chunk_duration * transcriber.sample_rate)
        buffer = np.array([], dtype=np.float32)
        last_send_time = time.time()

        while not stop_event.is_set():
            try:
                # 从 get_audio_chunk_fn 获取最新音频数据
                new_audio = get_audio_chunk_fn(recording_id)
                if new_audio is not None and len(new_audio) > 0:
                    buffer = np.concatenate([buffer, new_audio])

                # 每隔一定时间转写一次
                if time.time() - last_send_time >= transcriber.chunk_duration:
                    if len(buffer) >= chunk_size:
                        # 取最后 chunk_size 样本
                        chunk = buffer[-chunk_size:]
                        text = transcriber.transcribe_chunk(chunk, language)
                        if text.strip():
                            transcriber.send_realtime_caption(
                                recording_id,
                                text,
                                time.time() - transcriber.chunk_duration
                            )
                        last_send_time = time.time()

                time.sleep(0.5)

            except Exception as e:
                print(f'Realtime transcribe loop error: {e}', file=sys.stderr)
                time.sleep(1)
