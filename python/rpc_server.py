#!/usr/bin/env python3
"""
Meeting Recorder Python RPC Server
stdin/stdout JSON-RPC communication with Electron
"""

import json
import sys
import os
import threading
import traceback
import subprocess

# 检查依赖
def check_dependencies():
    """检查 Python 依赖是否已安装"""
    missing = []
    required = {
        'sounddevice': 'sounddevice>=0.4.4',
        'numpy': 'numpy>=1.24.0',
        'funasr': 'funasr>=2.0.0',
        'soundfile': 'soundfile>=0.12.0',
        'scipy': 'scipy>=1.10.0',
    }
    for module, package in required.items():
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    return missing

def check_python_version():
    """检查 Python 版本"""
    v = sys.version_info
    if v.major < 3 or (v.major == 3 and v.minor < 8):
        return f"Python 3.8+ required, got {v.major}.{v.minor}"
    return None

def get_model_cache_size():
    """估算模型缓存大小"""
    home = os.path.expanduser('~')
    cache_dirs = [
        os.path.join(home, '.cache', 'torch'),
        os.path.join(home, '.cache', 'huggingface'),
        os.path.join(home, '.funasr'),
    ]
    total = 0
    for d in cache_dirs:
        if os.path.exists(d):
            try:
                for root, dirs, files in os.walk(d):
                    for f in files:
                        total += os.path.getsize(os.path.join(root, f))
            except:
                pass
    if total > 1024 * 1024 * 1024:
        return f"{total / (1024**3):.1f} GB"
    elif total > 1024 * 1024:
        return f"{total / (1024**2):.0f} MB"
    return f"{total / 1024:.0f} KB"

def send_notification(method, params):
    """发送通知到 Electron"""
    print(json.dumps({'jsonrpc': '2.0', 'method': method, 'params': params}), flush=True)

from audio_capture import AudioCapture
from transcriber import TranscriptionService
from audio_converter import convert_to_wav, get_audio_info

# 全局单例
audio_capture = None
transcription_service = None

def handle_request(method, params, rpc_id):
    """处理 RPC 请求"""
    try:
        if method == 'initialize':
            return {'status': 'ok'}
        elif method == 'check_env':
            # 环境检测
            py_err = check_python_version()
            missing = check_dependencies()
            return {
                'pythonVersion': f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
                'pythonError': py_err,
                'missingDeps': missing,
                'modelCacheSize': get_model_cache_size(),
            }
        elif method == 'capture_start':
            result = audio_capture.start_capture(
                sample_rate=params.get('sampleRate', 16000),
                channels=params.get('channels', 1)
            )
            return result
        elif method == 'capture_pause':
            audio_capture.pause_capture(params.get('recordingId'))
            return {'status': 'paused'}
        elif method == 'capture_resume':
            audio_capture.resume_capture(params.get('recordingId'))
            return {'status': 'recording'}
        elif method == 'capture_stop':
            result = audio_capture.stop_capture(params.get('recordingId'))
            return result
        elif method == 'capture_status':
            return audio_capture.get_status(params.get('recordingId'))
        elif method == 'process_file':
            file_path = params['filePath']

            # 音频格式转换（如果是非 WAV 格式）
            ext = os.path.splitext(file_path)[1].lower()
            if ext not in ('.wav',):
                converted = convert_to_wav(file_path)
                if converted:
                    file_path = converted
                    send_notification('env_notice', {
                        'type': 'info',
                        'message': f'已将音频转换为 16kHz WAV 格式'
                    })
                else:
                    return {'error': f'不支持的音频格式: {ext}'}

            # 后台处理
            def _process():
                try:
                    transcription_service.process_file(
                        file_path=file_path,
                        meeting_id=params.get('meetingId'),
                        language=params.get('language', 'zh')
                    )
                except Exception as e:
                    traceback.print_exc()
                    send_notification('processing_error', {
                        'meetingId': params.get('meetingId'),
                        'error': str(e)
                    })
            threading.Thread(target=_process, daemon=True).start()
            return {'status': 'processing', 'meetingId': params.get('meetingId')}
        elif method == 'get_meetings':
            return transcription_service.get_meetings()
        elif method == 'get_meeting_detail':
            return transcription_service.get_meeting_detail(params['id'])
        elif method == 'delete_meeting':
            transcription_service.delete_meeting(params['id'])
            return {'status': 'deleted'}
        elif method == 'toggle_favorite':
            transcription_service.toggle_favorite(params['id'])
            return {'status': 'ok'}
        elif method == 'update_meeting':
            transcription_service.update_meeting(params['id'], params.get('updates', {}))
            return {'status': 'updated'}
        elif method == 'search_meetings':
            return transcription_service.search_meetings(params)
        elif method == 'get_audio_info':
            return get_audio_info(params['filePath'])
        elif method == 'clear_cache':
            # 清除模型缓存
            home = os.path.expanduser('~')
            cache_dirs = [
                os.path.join(home, '.cache', 'torch'),
                os.path.join(home, '.cache', 'huggingface'),
                os.path.join(home, '.funasr'),
            ]
            cleared = 0
            for d in cache_dirs:
                if os.path.exists(d):
                    try:
                        import shutil
                        size = sum(os.path.getsize(os.path.join(r, f))
                                    for r, _, fs in os.walk(d) for f in fs)
                        shutil.rmtree(d)
                        cleared += size
                    except:
                        pass
            return {'cleared': cleared}
        elif method == 'clear_data':
            transcription_service.clear_all_data()
            return {'status': 'cleared'}
        else:
            return {'error': f'Unknown method: {method}'}
    except Exception as e:
        traceback.print_exc()
        return {'error': str(e)}

def main():
    global audio_capture, transcription_service

    # 初始化服务
    audio_capture = AudioCapture()
    transcription_service = TranscriptionService()

    # 发送初始化消息
    print(json.dumps({'jsonrpc': '2.0', 'method': 'initialized', 'params': {}}), flush=True)

    # 主循环：读取 stdin 处理 RPC
    buffer = ''
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            buffer += line

            # 尝试解析完整的 JSON
            try:
                msg = json.loads(buffer)
                buffer = ''
            except json.JSONDecodeError:
                continue

            # 处理请求
            rpc_id = msg.get('id')
            method = msg.get('method')
            params = msg.get('params', {})

            result = handle_request(method, params, rpc_id)

            # 发送响应
            response = {
                'jsonrpc': '2.0',
                'id': rpc_id,
                'result': result
            }
            print(json.dumps(response), flush=True)
            sys.stdout.flush()
        except Exception as e:
            traceback.print_exc()
            break

if __name__ == '__main__':
    main()
