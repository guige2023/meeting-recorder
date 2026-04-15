"""
音频格式转换模块
将各种音频格式转换为 16kHz 单声道 WAV（适合转写）
"""

import os
import tempfile
import numpy as np
import soundfile as sf
from typing import Optional

def convert_to_wav(input_path: str, target_sample_rate: int = 16000) -> Optional[str]:
    """
    将音频文件转换为 16kHz 单声道 WAV

    Args:
        input_path: 输入文件路径
        target_sample_rate: 目标采样率，默认 16000

    Returns:
        转换后的 WAV 文件路径，失败返回 None
    """
    try:
        # 读取音频
        audio, sr = sf.read(input_path, dtype='float32')

        # 如果是多声道，转为单声道
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        # 重采样（如果需要）
        if sr != target_sample_rate:
            audio = resample(audio, sr, target_sample_rate)
            sr = target_sample_rate

        # 确保范围在 [-1, 1]
        audio = np.clip(audio, -1.0, 1.0)

        # 写入临时 WAV 文件
        output_fd, output_path = tempfile.mkstemp(suffix='.wav')
        os.close(output_fd)

        sf.write(output_path, audio, sr, subtype='PCM_16')
        return output_path

    except Exception as e:
        print(f'Audio conversion error: {e}', file=__import__('sys').stderr)
        import traceback
        traceback.print_exc()
        return None


def resample(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    """
    简单重采样（使用线性插值）
    对于语音来说效果足够
    """
    if orig_sr == target_sr:
        return audio

    duration = len(audio) / orig_sr
    target_length = int(duration * target_sr)
    indices = np.linspace(0, len(audio) - 1, target_length)
    return np.interp(indices, np.arange(len(audio)), audio).astype(audio.dtype)


def get_audio_info(path: str) -> dict:
    """获取音频文件信息"""
    try:
        info = sf.info(path)
        return {
            'duration': info.duration,
            'sampleRate': info.samplerate,
            'channels': info.channels,
            'format': info.format,
            'subtype': info.subtype
        }
    except Exception as e:
        return {'error': str(e)}
