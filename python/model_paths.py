import os
from typing import Dict, List, Optional


def _existing_dir(candidates: List[str]) -> Optional[str]:
    for path in candidates:
        if path and os.path.isdir(path):
            return path
    return None


def _existing_file(candidates: List[str]) -> Optional[str]:
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def get_app_models_dir() -> Optional[str]:
    app_models_dir = os.environ.get('APP_MODELS_DIR', '')
    if app_models_dir and os.path.isdir(app_models_dir):
        return app_models_dir
    return None


def get_sensevoice_model_dir() -> Optional[str]:
    app_models_dir = get_app_models_dir()
    modelscope_cache = os.environ.get('MODELSCOPE_CACHE', '')
    return _existing_dir([
        os.path.join(app_models_dir, 'SenseVoiceSmall') if app_models_dir else '',
        os.path.join(app_models_dir, 'hub', 'models', 'iic', 'SenseVoiceSmall') if app_models_dir else '',
        os.path.join(modelscope_cache, 'models', 'iic', 'SenseVoiceSmall') if modelscope_cache else '',
        os.path.join(modelscope_cache, 'iic', 'SenseVoiceSmall') if modelscope_cache else '',
    ])


def get_silero_repo_dir() -> Optional[str]:
    torch_hub_dir = os.environ.get('TORCH_HUB_DIR', '')
    app_models_dir = get_app_models_dir()
    return _existing_dir([
        os.path.join(torch_hub_dir, 'snakers4_silero-vad_master') if torch_hub_dir else '',
        os.path.join(app_models_dir, 'torch', 'hub', 'snakers4_silero-vad_master') if app_models_dir else '',
    ])


def get_silero_asset_dir() -> Optional[str]:
    app_models_dir = get_app_models_dir()
    torch_hub_dir = os.environ.get('TORCH_HUB_DIR', '')
    return _existing_dir([
        os.path.join(app_models_dir, 'silero_vad') if app_models_dir else '',
        os.path.join(torch_hub_dir, 'snakers4_silero-vad_master', 'src', 'silero_vad', 'data') if torch_hub_dir else '',
    ])


def get_model_inventory() -> Dict[str, Dict[str, object]]:
    sensevoice_dir = get_sensevoice_model_dir()
    silero_repo_dir = get_silero_repo_dir()
    silero_asset_dir = get_silero_asset_dir()

    inventory: Dict[str, Dict[str, object]] = {}

    if sensevoice_dir:
        inventory['SenseVoiceSmall'] = {
            'path': sensevoice_dir,
            'kind': 'dir',
        }

    silero_size_path = _existing_file([
        os.path.join(silero_asset_dir, 'silero_vad.onnx') if silero_asset_dir else '',
        os.path.join(silero_asset_dir, 'silero_vad.jit') if silero_asset_dir else '',
    ])
    if silero_repo_dir or silero_asset_dir:
        inventory['Silero-VAD'] = {
            'path': silero_size_path or silero_asset_dir or silero_repo_dir,
            'kind': 'file' if silero_size_path else 'dir',
            'repoDir': silero_repo_dir,
            'assetDir': silero_asset_dir,
        }

    return inventory
