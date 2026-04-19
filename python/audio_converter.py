"""
音频格式转换模块
将各种音频格式转换为 16kHz 单声道 WAV（适合转写）
支持通过 FFMPEG_PATH 环境变量指定 ffmpeg 路径
"""

import os
import tempfile
import subprocess
import numpy as np
from typing import Optional

# 全局 ffmpeg 路径（由 rpc_server 设置）
_ffmpeg_path: Optional[str] = None

def set_ffmpeg_path(path: str):
    """设置 ffmpeg 路径（用于打包版本）"""
    global _ffmpeg_path
    _ffmpeg_path = path

def _get_ffmpeg_path() -> Optional[str]:
    """获取 ffmpeg 路径"""
    if _ffmpeg_path and os.path.isfile(_ffmpeg_path):
        return _ffmpeg_path
    # 尝试从环境变量
    env_path = os.environ.get('FFMPEG_PATH')
    if env_path and os.path.isfile(env_path):
        return env_path
    # 尝试系统 PATH
    import shutil
    system_ffmpeg = shutil.which('ffmpeg')
    if system_ffmpeg:
        return system_ffmpeg
    return None


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
        # 先尝试用 soundfile 直接读取（无需 ffmpeg）
        import soundfile as sf
        try:
            audio_data, sample_rate = sf.read(input_path, dtype='float32')
            
            # 如果是多声道，转为单声道
            if len(audio_data.shape) > 1 and audio_data.shape[1] > 1:
                audio_data = audio_data.mean(axis=1)
            
            # 重采样（如果需要）
            if sample_rate != target_sample_rate:
                audio_data = _resample(audio_data, sample_rate, target_sample_rate)
                sample_rate = target_sample_rate
            
            # 写入临时 WAV 文件
            output_fd, output_path = tempfile.mkstemp(suffix='.wav')
            os.close(output_fd)
            sf.write(output_path, audio_data, sample_rate, subtype='PCM_16')
            return output_path
            
        except Exception as e:
            print(f'soundfile failed: {e}, trying pydub...', file=__import__('sys').stderr)
        
        ffmpeg_path = _get_ffmpeg_path()
        if not ffmpeg_path:
            print('ffmpeg not found for audio conversion', file=__import__('sys').stderr)
            return None

        output_fd, output_path = tempfile.mkstemp(suffix='.wav')
        os.close(output_fd)

        cmd = [
            ffmpeg_path,
            '-y',
            '-i', input_path,
            '-ac', '1',
            '-ar', str(target_sample_rate),
            '-c:a', 'pcm_s16le',
            output_path,
        ]
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if proc.returncode != 0 or not os.path.isfile(output_path):
            print(f'ffmpeg conversion failed: {proc.stderr.decode("utf-8", errors="ignore")}', file=__import__('sys').stderr)
            try:
                os.remove(output_path)
            except OSError:
                pass
            return None
        return output_path

    except Exception as e:
        print(f'Audio conversion error: {e}', file=__import__('sys').stderr)
        import traceback
        traceback.print_exc()
        return None


def _resample(audio_data: np.ndarray, old_sr: int, new_sr: int) -> np.ndarray:
    """使用 scipy 进行重采样"""
    from scipy import signal
    if len(audio_data) == 0:
        return audio_data
    resampled = signal.resample_poly(audio_data, new_sr, old_sr)
    return resampled


def get_audio_info(path: str) -> dict:
    """获取音频文件信息"""
    try:
        import soundfile as sf
        info = sf.info(path)
        return {
            'duration': info.duration,
            'sampleRate': info.samplerate,
            'channels': info.channels,
            'format': info.format.upper()
        }
    except Exception as e:
        try:
            ffmpeg_path = _get_ffmpeg_path()
            if not ffmpeg_path:
                return {'error': str(e)}

            output = subprocess.run(
                [
                    ffmpeg_path,
                    '-i', path,
                    '-f', 'null',
                    '-'
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            stderr = output.stderr.decode('utf-8', errors='ignore')
            duration = 0.0
            sample_rate = 0
            channels = 0
            for line in stderr.splitlines():
                if 'Duration:' in line:
                    duration_part = line.split('Duration:')[-1].split(',')[0].strip()
                    h, m, s = duration_part.split(':')
                    duration = int(h) * 3600 + int(m) * 60 + float(s)
                if 'Audio:' in line and sample_rate == 0:
                    parts = [part.strip() for part in line.split(',')]
                    for part in parts:
                        if part.endswith('Hz'):
                            try:
                                sample_rate = int(part.replace('Hz', '').strip())
                            except ValueError:
                                pass
                        elif 'mono' in part:
                            channels = 1
                        elif 'stereo' in part:
                            channels = 2
            return {
                'duration': duration,
                'sampleRate': sample_rate,
                'channels': channels,
                'format': os.path.splitext(path)[1].lstrip('.').upper()
            }
        except Exception:
            return {'error': str(e)}
