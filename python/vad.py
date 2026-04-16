"""
语音活动检测模块
使用 Silero-VAD 进行实时语音检测
"""

import numpy as np
import torch
import queue
import threading
import json
import sys

class VAD:
    def __init__(self):
        self.model = None
        self.models_loaded = False
        self.sample_rate = 16000

    def load_models(self):
        """加载 Silero-VAD 模型"""
        if self.models_loaded:
            return

        try:
            import torch
            torch.set_num_threads(1)

            # 加载 Silero VAD
            self.model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                trust_repo=True
            )
            self._get_st_func = utils[0]
            self.models_loaded = True
            print('Silero-VAD model loaded', file=sys.stderr)
        except ImportError as e:
            print(f'Failed to load Silero-VAD (missing module): {e}', file=sys.stderr)
        except Exception as e:
            # 网络错误（HTTP 429 等）或模型加载失败
            print(f'Failed to load Silero-VAD (non-fatal): {e}', file=sys.stderr)
            # 不再崩溃，VAD 将以 fallback 模式运行（音频全传给 ASR）

    def detect_speech(
        self,
        audio_chunk: np.ndarray,
        threshold: float = 0.5,
        min_speech_duration_ms: int = 250,
        min_silence_duration_ms: int = 500
    ) -> bool:
        """
        检测音频片段是否包含语音

        Args:
            audio_chunk: numpy array of audio samples (16kHz, float32)
            threshold: speech probability threshold
            min_speech_duration_ms: minimum speech duration
            min_silence_duration_ms: minimum silence duration

        Returns:
            True if speech detected
        """
        if not self.models_loaded:
            self.load_models()

        if self.model is None:
            return False

        try:
            # 确保音频是 float32 类型
            if audio_chunk.dtype != np.float32:
                audio_chunk = audio_chunk.astype(np.float32)

            # 调用 Silero VAD
            speech_prob = self.model(audio_chunk, self.sample_rate).item()
            return speech_prob > threshold

        except Exception as e:
            print(f'VAD error: {e}', file=sys.stderr)
            return False

    def get_speech_timestamps(
        self,
        audio: np.ndarray,
        threshold: float = 0.5,
        min_speech_duration_ms: int = 250,
        min_silence_duration_ms: int = 500
    ) -> list:
        """
        获取语音时间段

        Returns:
            List of dicts with start and end timestamps in seconds
        """
        if not self.models_loaded:
            self.load_models()

        if self.model is None:
            return []

        try:
            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            # 获取语音时间戳
            timestamps = self._get_st_func(
                self.model,
                audio,
                threshold=threshold,
                min_speech_duration_ms=min_speech_duration_ms,
                min_silence_duration_ms=min_silence_duration_ms,
                sampling_rate=self.sample_rate
            )

            # 转换为秒
            return [
                {
                    'start': ts['start'] / self.sample_rate,
                    'end': ts['end'] / self.sample_rate
                }
                for ts in timestamps
            ]

        except Exception as e:
            print(f'VAD timestamp error: {e}', file=sys.stderr)
            return []
