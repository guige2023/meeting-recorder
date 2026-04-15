"""
说话人分割模块
使用 pyannote.audio 进行说话人识别
"""

import torch
from typing import List, Dict, Optional

class SpeakerDiarizer:
    def __init__(self, device: str = 'cpu'):
        """
        初始化说话人分割模型

        Args:
            device: 'cuda' or 'cpu'
        """
        self.device = device if torch.cuda.is_available() else 'cpu'
        self.pipeline = None
        self.models_loaded = False

    def load_models(self):
        """加载 pyannote 模型"""
        if self.models_loaded:
            return

        try:
            from pyannote.audio import Pipeline

            # 加载说话人分割 pipeline
            # 需要先在 HuggingFace 接受协议: https://huggingface.co/pyannote/speaker-diarization
            self.pipeline = Pipeline.from_pretrained(
                'pyannote/speaker-diarization@2.1',
                use_auth_token=None  # 用户需要自行配置 token
            )
            self.pipeline.to(torch.device(self.device))
            self.models_loaded = True
            print('pyannote models loaded successfully', file=__import__('sys').stderr)
        except Exception as e:
            print(f'Failed to load pyannote models: {e}', file=__import__('sys').stderr)
            import traceback
            traceback.print_exc()

    def diarize(
        self,
        audio_path: str,
        min_speakers: int = 2,
        max_speakers: int = 8
    ) -> List[Dict]:
        """
        对音频文件进行说话人分割

        Args:
            audio_path: 音频文件路径
            min_speakers: 最少说话人数
            max_speakers: 最多说话人数

        Returns:
            List of dicts with keys: start, end, speaker
        """
        if not self.models_loaded:
            self.load_models()

        if self.pipeline is None:
            return []

        try:
            # 执行说话人分割
            diarization = self.pipeline(
                audio_path,
                min_speakers=min_speakers,
                max_speakers=max_speakers
            )

            # 转换为列表格式
            segments = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                segments.append({
                    'start': turn.start,
                    'end': turn.end,
                    'speaker': speaker
                })

            return segments

        except Exception as e:
            print(f'Diarization error: {e}', file=__import__('sys').stderr)
            import traceback
            traceback.print_exc()
            return []

    def get_unique_speakers(self, segments: List[Dict]) -> List[str]:
        """获取所有唯一的说话人标签"""
        speakers = set()
        for seg in segments:
            if 'speaker' in seg:
                speakers.add(seg['speaker'])
        return sorted(list(speakers))
