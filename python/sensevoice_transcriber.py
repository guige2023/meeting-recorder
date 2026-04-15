"""
语音转写模块
使用 FunASR / SenseVoice 进行语音转写
"""

import numpy as np
from typing import List, Dict, Optional

class Transcriber:
    def __init__(self, device: str = 'cpu'):
        """
        初始化转写模型

        Args:
            device: 'cuda' or 'cpu'
        """
        self.device = device
        self.model = None
        self.models_loaded = False

    def load_models(self):
        """加载 SenseVoice 模型"""
        if self.models_loaded:
            return

        try:
            import os

            # 确保使用 CPU，避免 CUDA 初始化挂起
            os.environ['CUDA_VISIBLE_DEVICES'] = ''

            # 如果设置了 MODELSCOPE_CACHE（由 Electron main.ts 传入），使用本地模型
            model_cache = os.environ.get('MODELSCOPE_CACHE', '')
            if model_cache:
                # 模型在 MODELSCOPE_CACHE/models/iic/SenseVoiceSmall
                local_model = os.path.join(model_cache, 'models', 'iic', 'SenseVoiceSmall')
                if os.path.isdir(local_model):
                    model_path = local_model
                    print(f'Using local model: {model_path}', file=__import__('sys').stderr)
                else:
                    model_path = 'iic/SenseVoiceSmall'
            else:
                model_path = 'iic/SenseVoiceSmall'

            from funasr import AutoModel
            from funasr.utils.postprocess_utils import rich_transcription_postprocess

            # 加载 SenseVoice Small
            self.model = AutoModel(
                model=model_path,
                device=self.device,
                disable_update=True
            )
            self.postprocess = rich_transcription_postprocess
            self.models_loaded = True
            print('SenseVoice model loaded', file=__import__('sys').stderr)

        except Exception as e:
            print(f'Failed to load SenseVoice: {e}', file=__import__('sys').stderr)
            import traceback
            traceback.print_exc()

    def transcribe_file(
        self,
        audio_path: str,
        language: str = 'zh'
    ) -> List[Dict]:
        """
        转写完整音频文件

        Args:
            audio_path: 音频文件路径
            language: 语言 ('zh', 'en', 'yue', 'ja', 'ko', 'auto')

        Returns:
            List of dicts with keys: start, end, text
        """
        if not self.models_loaded:
            self.load_models()

        if self.model is None:
            return []

        try:
            # 执行转写
            result = self.model.generate(
                input=audio_path,
                language=language if language != 'auto' else 'auto',
                use_itn=True,  # 启用逆文本正则化（标点等）
                batch_size_s=60
            )

            # 解析结果
            segments = []
            if result and len(result) > 0:
                res = result[0]
                text = res.get('text', '')
                timestamp = res.get('timestamp', [])

                if timestamp:
                    # 带时间戳的结果
                    for item in timestamp:
                        segments.append({
                            'start': item[0] / 1000.0,  # 毫秒转秒
                            'end': item[1] / 1000.0,
                            'text': item[2]
                        })
                else:
                    # 无时间戳，整体转写
                    segments.append({
                        'start': 0,
                        'end': 0,
                        'text': text
                    })

            return segments

        except Exception as e:
            print(f'Transcription error: {e}', file=__import__('sys').stderr)
            import traceback
            traceback.print_exc()
            return []

    def transcribe_segments(
        self,
        audio_chunks: List[np.ndarray],
        language: str = 'zh'
    ) -> List[Dict]:
        """
        转写多个音频片段（用于实时字幕）

        Args:
            audio_chunks: List of audio numpy arrays
            language: 语言

        Returns:
            List of transcriptions
        """
        if not self.models_loaded:
            self.load_models()

        if self.model is None:
            return []

        results = []
        for i, chunk in enumerate(audio_chunks):
            try:
                result = self.model.generate(
                    input=chunk,
                    language=language if language != 'auto' else 'auto',
                    use_itn=True
                )
                if result:
                    text = result[0].get('text', '')
                    if text.strip():
                        results.append({
                            'index': i,
                            'text': text,
                            'duration': len(chunk) / 16000
                        })
            except Exception as e:
                print(f'Transcribe segment error: {e}', file=__import__('sys').stderr)

        return results
