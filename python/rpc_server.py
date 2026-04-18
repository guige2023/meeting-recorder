#!/usr/bin/env python3
"""
Meeting Recorder Python RPC Server
stdin/stdout JSON-RPC communication with Electron
"""

import json
import sys
import os
import uuid
import threading
import traceback
import subprocess
import zipfile
import tempfile
import datetime as dt

# 解析命令行参数
_DATA_DIR = None
for arg in sys.argv[1:]:
    if arg.startswith('--data-dir='):
        _DATA_DIR = arg.split('=', 1)[1]

def _fmt_ss(seconds):
    m = int(seconds // 60); s = int(seconds % 60)
    return f'{m}:{s:02d}'

def _fmt_srt(seconds):
    h = int(seconds // 3600); m = int((seconds % 3600) // 60)
    s = int(seconds % 60); ms = int((seconds % 1) * 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

# 检查依赖
def check_dependencies():
    """检查 Python 依赖是否已安装"""
    missing = []
    required = {
        'sounddevice': 'sounddevice>=0.4.4',
        'numpy': 'numpy>=1.24.0',
        'funasr': 'funasr>=1.0.0',
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

def get_model_info():
    """获取捆绑模型的信息"""
    # 获取模型目录路径（从环境变量或默认值）
    models_dir = os.environ.get('MODELSCOPE_CACHE')
    if not models_dir or not os.path.exists(models_dir):
        # 尝试开发环境默认路径
        dev_path = '/Users/guige/my_project/meeting-recorder/models'
        if os.path.exists(dev_path):
            models_dir = dev_path
        else:
            return {'models': [], 'totalSize': 0, 'status': 'not_found'}

    models_info = []
    total_size = 0
    total_files = 0

    # 定义要检测的模型及其路径模式
    model_patterns = {
        'SenseVoiceSmall': ['hub', 'models', 'iic', 'SenseVoiceSmall'],
        'Silero-VAD': ['torch', 'hub', 'snakers4_silero-vad_master', 'src', 'silero_vad', 'data'],
    }

    try:
        for root, dirs, files in os.walk(models_dir):
            # 计算当前目录的大小
            dir_size = 0
            dir_files = 0
            for f in files:
                try:
                    dir_size += os.path.getsize(os.path.join(root, f))
                    dir_files += 1
                except:
                    pass

            if dir_size > 0:
                # 判断是哪个模型
                rel_path = os.path.relpath(root, models_dir)
                path_parts = rel_path.split(os.sep)

                model_name = None
                for name, pattern in model_patterns.items():
                    if any(p in path_parts for p in pattern):
                        model_name = name
                        break

                if model_name:
                    models_info.append({
                        'name': model_name,
                        'path': root,
                        'sizeBytes': dir_size,
                        'fileCount': dir_files,
                    })
                    total_size += dir_size
                    total_files += dir_files

    except Exception as e:
        return {'models': [], 'totalSize': 0, 'status': 'error', 'error': str(e)}

    return {
        'models': models_info,
        'totalSize': total_size,
        'totalFiles': total_files,
        'status': 'ok' if models_info else 'empty',
    }

def redownload_models():
    """重新下载模型（仅开发环境有效， packaged app 中模型为只读）"""
    # 检查是否为打包后的应用
    import sys
    if hasattr(sys, '_MEIPASS'):
        # 打包后的应用，模型在 app.asar 中，无法重新下载
        return {'status': 'readonly', 'message': '打包应用中模型为只读，无法重新下载'}

    # 开发环境：从 ModelScope 重新下载
    models_dir = os.environ.get('MODELSCOPE_CACHE')
    if not models_dir:
        return {'status': 'error', 'message': '未找到 MODELSCOPE_CACHE 环境变量'}

    try:
        # 删除现有模型目录
        import shutil
        if os.path.exists(models_dir):
            shutil.rmtree(models_dir)

        # 触发模型下载（通过导入 funasr 会自动下载）
        send_notification('model_download', {'message': '正在从 ModelScope 下载模型...', 'progress': 0})

        # 使用 modelscope 下载模型
        from modelscope.hub import ModelScope
        # 触发 SenseVoiceSmall 下载
        from funasr import AutoModel
        model = AutoModel(model='iic/SenseVoiceSmall', hub='ms')

        send_notification('model_download', {'message': '模型下载完成', 'progress': 100})

        return {'status': 'ok', 'message': '模型重新下载完成'}
    except ImportError:
        return {'status': 'error', 'message': 'modelscope 库不可用，请手动下载模型'}
    except Exception as e:
        return {'status': 'error', 'message': f'下载失败: {str(e)}'}

def send_notification(method, params):
    """发送通知到 Electron"""
    print(json.dumps({'jsonrpc': '2.0', 'method': method, 'params': params}), flush=True)

# 懒加载模块，避免在依赖缺失时直接崩溃
# 在 main() 中初始化前先发送 initialized 通知，让 Electron 知道进程已启动
_audio_capture_cls = None
_transcription_service_cls = None
_audio_converter = None
_realtime_pool_cls = None
_import_error = None

def _lazy_imports():
    global _audio_capture_cls, _transcription_service_cls, _audio_converter, _realtime_pool_cls, _import_error
    if _import_error is not None:
        return
    try:
        from audio_capture import AudioCapture as _ac
        from transcriber import TranscriptionService as _ts
        from audio_converter import convert_to_wav as _cw, get_audio_info as _gi
        from realtime_transcriber import RealtimeTranscriberPool as _rt
        _audio_capture_cls = _ac
        _transcription_service_cls = _ts
        _audio_converter = (_cw, _gi)
        _realtime_pool_cls = _rt
    except ImportError as e:
        _import_error = str(e)

# 全局单例（延迟初始化）
audio_capture = None
transcription_service = None
realtime_pool = None  # RealtimeTranscriberPool

def handle_request(method, params, rpc_id):
    """处理 RPC 请求"""
    try:
        # 确保模块已加载
        _lazy_imports()

        if _import_error and method not in ('check_env', 'initialize', 'get_app_path', 'get_dark_mode'):
            return {'error': f'Python 依赖缺失: {_import_error}。请先安装依赖。'}

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
            enable_realtime = params.get('realtime', False)
            result = audio_capture.start_capture(
                sample_rate=params.get('sampleRate', 16000),
                channels=params.get('channels', 1),
                enable_realtime=enable_realtime
            )
            recording_id = result['recordingId']

            # 启用实时字幕时同时启动 RealtimeTranscriberPool
            if enable_realtime and realtime_pool is not None:
                realtime_pool.start(
                    recording_id=recording_id,
                    audio_capture=audio_capture,
                    language=params.get('language', 'zh')
                )

            return result
        elif method == 'capture_pause':
            audio_capture.pause_capture(params.get('recordingId'))
            return {'status': 'paused'}
        elif method == 'capture_resume':
            audio_capture.resume_capture(params.get('recordingId'))
            return {'status': 'recording'}
        elif method == 'capture_stop':
            recording_id = params.get('recordingId')
            # 停止实时转写
            if realtime_pool is not None:
                realtime_pool.stop(recording_id)
            result = audio_capture.stop_capture(recording_id)
            return result
        elif method == 'capture_status':
            return audio_capture.get_status(params.get('recordingId'))
        elif method == 'process_file':
            file_path = params['filePath']

            # 音频格式转换（如果是非 WAV 格式）
            ext = os.path.splitext(file_path)[1].lower()
            if ext not in ('.wav',):
                converted = _audio_converter[0](file_path)
                if converted:
                    file_path = converted
                    send_notification('env_notice', {
                        'type': 'info',
                        'message': f'已将音频转换为 16kHz WAV 格式'
                    })
                else:
                    return {'error': f'不支持的音频格式: {ext}'}

            # 生成 meetingId（如果未提供）
            meeting_id = params.get('meetingId')
            if not meeting_id:
                meeting_id = str(uuid.uuid4())

            # 后台处理
            def _process():
                try:
                    transcription_service.process_file(
                        file_path=file_path,
                        meeting_id=meeting_id,
                        language=params.get('language', 'zh')
                    )
                except Exception as e:
                    traceback.print_exc()
                    send_notification('processing_error', {
                        'meetingId': meeting_id,
                        'error': str(e)
                    })
            threading.Thread(target=_process, daemon=True).start()
            return {'status': 'processing', 'meetingId': meeting_id}
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
            return _audio_converter[1](params['filePath'])
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
        elif method == 'get_old_recordings':
            days = params.get('days', 30)
            return transcription_service.get_old_meetings(days=days)
        elif method == 'cleanup_old_recordings':
            days = params.get('days', 30)
            return transcription_service.cleanup_old_recordings(days=days)
        elif method == 'batch_export_meetings':
            ids = params.get('ids', [])
            formats = set(params.get('formats', ['json']))
            include_audio = params.get('include_audio', False)

            tmp = tempfile.gettempdir()
            ts = dt.datetime.now().strftime('%Y%m%d_%H%M%S')
            zip_path = os.path.join(tmp, f'meeting_export_{ts}.zip')

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for mid in ids:
                    detail = transcription_service.get_meeting_detail(mid)
                    if not detail:
                        continue

                    title = detail.get('meeting', {}).get('title', mid)
                    safe = ''.join(c if c.isalnum() or c in ' -_' else '_' for c in title)
                    base = safe

                    sp_map = {sid: sp.get('name', f'Speaker {sid}')
                              for sid, sp in detail.get('speakers', {}).items()}
                    segments = detail.get('segments', [])

                    if 'txt' in formats:
                        lines = [title, '=' * 40, '']
                        for seg in segments:
                            sp = sp_map.get(seg.get('speakerId', ''), '未知')
                            start = _fmt_ss(seg.get('startTime', 0))
                            lines.append(f'[{start}] {sp}: {seg.get("text", "")}')
                        zf.writestr(f'{base}/{base}.txt', '\n'.join(lines))

                    if 'md' in formats:
                        lines = [f'# {title}', '']
                        cur = None
                        for seg in segments:
                            sp = sp_map.get(seg.get('speakerId', ''), '未知')
                            if sp != cur:
                                lines.extend(['', f'## {sp}', '']); cur = sp
                            start = _fmt_ss(seg.get('startTime', 0))
                            lines.append(f'> [{start}] {seg.get("text", "")}')
                        zf.writestr(f'{base}/{base}.md', '\n'.join(lines))

                    if 'json' in formats:
                        export_data = {
                            'version': '1.0',
                            'meeting': detail.get('meeting', {}),
                            'speakers': detail.get('speakers', {}),
                            'segments': segments,
                            'notes': detail.get('notes', []),
                            'stats': detail.get('stats', {}),
                            'exportedAt': dt.datetime.now().isoformat(),
                        }
                        zf.writestr(f'{base}/{base}.json',
                                    json.dumps(export_data, ensure_ascii=False, indent=2))

                    if 'srt' in formats:
                        srt_lines = []
                        for i, seg in enumerate(segments, 1):
                            s = seg.get('startTime', 0)
                            e = seg.get('endTime', s + 1)
                            sp = sp_map.get(seg.get('speakerId', ''), '未知')
                            srt_lines.append(
                                f'{i}\n{_fmt_srt(s)} --> {_fmt_srt(e)}\n[{sp}] {seg.get("text","")}\n')
                        zf.writestr(f'{base}/{base}.srt', '\n'.join(srt_lines))

                    if include_audio:
                        audio_path = (detail.get('meeting', {}).get('audioPath')
                                      or detail.get('audioPath'))
                        if audio_path and os.path.exists(audio_path):
                            with open(audio_path, 'rb') as f:
                                zf.writestr(f'{base}/{base}.wav', f.read())

            return {'zipPath': zip_path}
        elif method == 'get_model_info':
            return get_model_info()
        elif method == 'redownload_models':
            return redownload_models()
        else:
            return {'error': f'Unknown method: {method}'}
    except Exception as e:
        traceback.print_exc()
        return {'error': str(e)}

def main():
    global audio_capture, transcription_service, realtime_pool

    # 先发送 initialized，让 Electron 知道 Python 进程已启动
    print(json.dumps({'jsonrpc': '2.0', 'method': 'initialized', 'params': {}}), flush=True)

    # 懒加载模块（如果缺少依赖，进程继续运行，可响应 check_env）
    _lazy_imports()
    if _import_error:
        # 依赖缺失但进程活着，可以响应 check_env
        pass
    else:
        # 依赖正常，初始化服务（捕获所有异常，防止单模块崩溃导致进程退出）
        try:
            audio_capture = _audio_capture_cls(data_dir=_DATA_DIR)
            transcription_service = _transcription_service_cls(data_dir=_DATA_DIR)
            realtime_pool = _realtime_pool_cls()
        except Exception as e:
            import sys as _sys
            print(f'[rpc_server] Service init error (non-fatal): {e}', file=_sys.stderr)
            import traceback as _tb
            _tb.print_exc(file=_sys.stderr)

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
