#!/usr/bin/env python3
"""
Meeting Recorder Python RPC Server
stdin/stdout JSON-RPC communication with Electron
"""

import json
import sys
import threading
import traceback
from audio_capture import AudioCapture
from transcriber import TranscriptionService

# 全局单例
audio_capture = None
transcription_service = None
active_recordings = {}

def handle_request(method, params, rpc_id):
    """处理 RPC 请求"""
    try:
        if method == 'initialize':
            return {'status': 'ok'}
        elif method == 'capture_start':
            result = audio_capture.start_capture(
                sample_rate=params.get('sampleRate', 16000),
                channels=params.get('channels', 1)
            )
            recording_id = result['recording_id']
            active_recordings[recording_id] = {
                'status': 'recording',
                'start_time': result.get('start_time'),
                'duration': 0
            }
            return result
        elif method == 'capture_pause':
            audio_capture.pause_capture(params.get('recordingId'))
            return {'status': 'paused'}
        elif method == 'capture_resume':
            audio_capture.resume_capture(params.get('recordingId'))
            return {'status': 'recording'}
        elif method == 'capture_stop':
            result = audio_capture.stop_capture(params.get('recordingId'))
            if params.get('recordingId') in active_recordings:
                del active_recordings[params.get('recordingId')]
            return result
        elif method == 'capture_status':
            return audio_capture.get_status(params.get('recordingId'))
        elif method == 'process_file':
            # 后台处理导入的音频文件（不阻塞主线程）
            def _process():
                transcription_service.process_file(
                    file_path=params['filePath'],
                    meeting_id=params.get('meetingId'),
                    language=params.get('language', 'zh')
                )
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
    print(json.dumps({'jsonrpc': '2.0', 'method': 'initialized', 'params': {}}))

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
            print(json.dumps(response))
            sys.stdout.flush()
        except Exception as e:
            traceback.print_exc()
            break

if __name__ == '__main__':
    main()
