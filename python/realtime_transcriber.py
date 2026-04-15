"""
实时字幕模块 V2
使用 Silero-VAD 语音活动检测 + SenseVoice 实时转写
VAD 驱动模式：检测到语音结束后触发转写，而非固定间隔
"""

import numpy as np
import threading
import queue
import json
import sys
import time

# 复用已有的 VAD
from vad import VAD


class RealtimeTranscriber:
    """单个录音的实时转写器"""

    # VAD 参数
    VAD_THRESHOLD = 0.5          # 语音概率阈值
    VAD_CHUNK_MS = 512            # 每 chunk 样本数（32ms @ 16kHz）
    MIN_SPEECH_SAMPLES = 16000    # 最少 1 秒语音才触发转写
    MAX_SILENCE_CHUNKS = 20       # 连续 20 chunks（约 1.28s）静音 → 触发转写
    MAX_SPEECH_SECONDS = 30       # 超过 30 秒未触发静音也强制转写
    SAMPLE_RATE = 16000

    def __init__(self):
        self.vad = VAD()
        self.vad.load_models()
        self.model = None
        self.models_loaded = False

    def load_asr_model(self):
        """懒加载 SenseVoice 模型"""
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
            print('Realtime ASR model loaded', file=sys.stderr)
        except Exception as e:
            print(f'Realtime ASR load error: {e}', file=sys.stderr)
            import traceback
            traceback.print_exc()

    def transcribe(self, audio: np.ndarray, language: str = 'zh') -> str:
        """
        转写音频片段

        Args:
            audio: numpy array, 16kHz, float32
            language: 语言代码

        Returns:
            转写文本
        """
        if not self.models_loaded:
            self.load_asr_model()

        if self.model is None:
            return ''

        if len(audio) < self.MIN_SPEECH_SAMPLES:
            return ''

        try:
            result = self.model.generate(
                input=audio,
                language='auto' if language == 'auto' else language,
                use_itn=True
            )
            if result:
                return result[0].get('text', '')
        except Exception as e:
            print(f'Transcribe error: {e}', file=sys.stderr)

        return ''

    def detect_speech(self, audio_chunk: np.ndarray) -> float:
        """
        检测音频 chunk 是否包含语音，返回语音概率

        Returns:
            0.0 ~ 1.0 的语音概率
        """
        if not self.vad.models_loaded:
            self.vad.load_models()

        if self.vad.model is None:
            return 0.0

        try:
            if audio_chunk.dtype != np.float32:
                audio_chunk = audio_chunk.astype(np.float32)
            prob = self.vad.model(audio_chunk, self.SAMPLE_RATE).item()
            return prob
        except Exception as e:
            print(f'VAD detect error: {e}', file=sys.stderr)
            return 0.0

    def send_caption(self, recording_id: str, text: str, start_time: float, is_final: bool = True):
        """发送实时字幕通知"""
        if not text.strip():
            return
        msg = {
            'jsonrpc': '2.0',
            'method': 'realtime_caption',
            'params': {
                'recordingId': recording_id,
                'text': text.strip(),
                'startTime': start_time,
                'isFinal': is_final,
            }
        }
        print(json.dumps(msg), flush=True)


class RealtimeTranscriberPool:
    """
    实时转写器池
    每个录音维护一个转写器实例，VAD 驱动转写
    """

    def __init__(self):
        self.transcribers = {}    # recording_id -> RealtimeTranscriber
        self.threads = {}        # recording_id -> Thread
        self.stop_events = {}    # recording_id -> threading.Event
        self.audio_capture = None  # AudioCapture 实例注入

    def start(self, recording_id: str, audio_capture, language: str = 'zh'):
        """启动实时转写"""
        if recording_id in self.transcribers:
            return

        transcriber = RealtimeTranscriber()
        self.transcribers[recording_id] = transcriber
        self.audio_capture = audio_capture
        stop_event = threading.Event()
        self.stop_events[recording_id] = stop_event

        thread = threading.Thread(
            target=self._vad_loop,
            args=(recording_id, transcriber, language, stop_event),
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

    def _vad_loop(
        self,
        recording_id: str,
        transcriber: RealtimeTranscriber,
        language: str,
        stop_event: threading.Event
    ):
        """
        VAD 驱动的转写循环

        状态机:
          idle → 检测到语音 → speech_active → 静音累积 → silence_count >= 20 → transcribe → idle
        """
        print(f'RealtimeTranscriberPool: started for {recording_id}', file=sys.stderr)

        # VAD 状态
        state = 'idle'  # 'idle' | 'speech_active'
        silence_chunks = 0
        speech_start_time = None
        last_transcribe_time = time.time()
        last_buffer_len = 0

        # 每次循环：取最新音频，计算 VAD 概率，推进状态机
        while not stop_event.is_set():
            try:
                if self.audio_capture is None:
                    time.sleep(0.5)
                    continue

                # 取实时音频缓冲
                audio = self.audio_capture.get_live_audio(recording_id)
                audio_len = len(audio)

                # 需要至少 3 秒音频才做 VAD 检测
                min_samples = 3 * transcriber.SAMPLE_RATE
                if audio_len < min_samples:
                    time.sleep(0.3)
                    continue

                # 取最后 3 秒做检测（避免用太旧的音频）
                detect_audio = audio[-min_samples:] if audio_len > min_samples else audio

                # VAD 概率
                prob = transcriber.detect_speech(detect_audio)
                is_speech = prob > transcriber.VAD_THRESHOLD

                now = time.time()
                elapsed_since_transcribe = now - last_transcribe_time

                if is_speech:
                    # 语音中
                    if state == 'idle':
                        # 刚检测到语音开始
                        state = 'speech_active'
                        speech_start_time = now - (audio_len / transcriber.SAMPLE_RATE)
                        silence_chunks = 0
                        print(f'VAD: speech detected at {speech_start_time:.1f}s', file=sys.stderr)
                else:
                    # 非语音（静音）
                    if state == 'speech_active':
                        silence_chunks += 1
                        # 连续 MAX_SILENCE_CHUNKS 静音 → 触发转写
                        if silence_chunks >= transcriber.MAX_SILENCE_CHUNKS:
                            print(f'VAD: silence after speech ({silence_chunks} chunks), transcribing...', file=sys.stderr)
                            # 取从 speech_start 到现在所有音频
                            speech_audio = audio[-min_samples:]  # 用最后 3s
                            text = transcriber.transcribe(speech_audio, language)
                            if text.strip():
                                transcriber.send_caption(recording_id, text, speech_start_time, is_final=True)
                            last_transcribe_time = time.time()
                            state = 'idle'
                            silence_chunks = 0
                            speech_start_time = None

                # 兜底：超过 MAX_SPEECH_SECONDS 没触发静音也强制转写
                if state == 'speech_active' and elapsed_since_transcribe >= transcriber.MAX_SPEECH_SECONDS:
                    print(f'VAD: max speech duration reached ({elapsed_since_transcribe:.0f}s), forcing transcribe', file=sys.stderr)
                    speech_audio = audio[-min_samples:]
                    text = transcriber.transcribe(speech_audio, language)
                    if text.strip():
                        transcriber.send_caption(recording_id, text, speech_start_time, is_final=True)
                    last_transcribe_time = time.time()
                    state = 'idle'
                    silence_chunks = 0
                    speech_start_time = None

                last_buffer_len = audio_len
                time.sleep(0.2)  # 约 5 次/秒检测频率

            except Exception as e:
                print(f'VAD loop error: {e}', file=sys.stderr)
                import traceback
                traceback.print_exc()
                time.sleep(1)

        print(f'RealtimeTranscriberPool: stopped for {recording_id}', file=sys.stderr)
