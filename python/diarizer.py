"""
说话人分割模块 — 完全本地实现，不依赖任何外部 API

策略：
1. Silero VAD 检测语音段（非语音部分忽略）
2. 对每个语音段提取 MFCC 声学特征
3. 对特征向量做层次凝聚聚类（AHC），自动推断说话人数量
4. 也支持 pyannote.audio（可选，需要 HuggingFace token）
"""

import numpy as np
import sys
from model_paths import get_silero_repo_dir
from typing import List, Dict, Optional

# ─── 本地说话人分割实现 ───────────────────────────────────────

def extract_mfcc(audio: np.ndarray, sample_rate: int = 16000, n_mfcc: int = 40) -> np.ndarray:
    """
    提取 MFCC 特征（纯 numpy 实现，CPU 即可运行）

    Args:
        audio: 音频数据，float32，范围 [-1, 1]
        sample_rate: 采样率
        n_mfcc: MFCC 系数数量

    Returns:
        mfcc 特征，shape = (n_frames, n_mfcc)
    """
    from scipy.signal import get_window
    import scipy.fft

    # 帧参数
    frame_len = int(0.025 * sample_rate)      # 25ms 帧长
    frame_step = int(0.010 * sample_rate)     # 10ms 帧移
    n_fft = 512

    # 预加重
    alpha = 0.97
    audio = np.append(audio[0], audio[1:] - alpha * audio[:-1])

    # 分帧
    n_frames = 1 + (len(audio) - frame_len) // frame_step
    frames = np.zeros((n_frames, frame_len))
    window = get_window('hann', frame_len)
    for i in range(n_frames):
        start = i * frame_step
        frames[i] = audio[start:start + frame_len] * window

    # 快速傅里叶变换
    mag = np.abs(scipy.fft.rfft(frames, n=n_fft))

    # 梅尔滤波器组（三角滤波器，40 个）
    def hz_to_mel(hz):
        return 2595 * np.log10(1 + hz / 700)

    def mel_to_hz(mel):
        return 700 * (10 ** (mel / 2595) - 1)

    f_low = 0
    f_high = sample_rate / 2
    n_mels = 80
    mel_low = hz_to_mel(f_low)
    mel_high = hz_to_mel(f_high)
    mel_points = np.linspace(mel_low, mel_high, n_mels + 2)
    hz_points = np.array([mel_to_hz(m) for m in mel_points])

    bin_points = np.floor((n_fft + 1) * hz_points / sample_rate).astype(int)
    bin_points = np.clip(bin_points, 0, n_fft)

    filterbank = np.zeros((n_mels, n_fft // 2 + 1))
    for i in range(n_mels):
        left = bin_points[i]
        center = bin_points[i + 1]
        right = bin_points[i + 2]
        for j in range(left, center):
            filterbank[i, j] = (j - left) / (center - left)
        for j in range(center, right):
            filterbank[i, j] = (right - j) / (right - center)

    # 梅尔频谱
    mel_spec = np.dot(mag ** 2, filterbank.T)
    mel_spec = np.where(mel_spec > 1e-10, mel_spec, 1e-10)
    log_mel = np.log(mel_spec)

    # DCT 得到 MFCC（只用前 n_mfcc 个系数）
    mfcc = scipy.fft.dct(log_mel, type=2, axis=1, norm='ortho')[:, :n_mfcc]

    # 归一化
    mfcc -= np.mean(mfcc, axis=0, keepdims=True)
    std = np.std(mfcc, axis=0, keepdims=True)
    std[std < 1e-8] = 1
    mfcc /= std

    return mfcc


def compute_diarization_local(
    audio_path: str,
    min_speakers: int = 2,
    max_speakers: int = 8
) -> List[Dict]:
    """
    本地说话人分割（Silero VAD + MFCC 聚类）

    Args:
        audio_path: 音频文件路径
        min_speakers: 最少说话人数
        max_speakers: 最多说话人数

    Returns:
        List of dicts with keys: start, end, speaker
    """
    try:
        import soundfile as sf
    except ImportError:
        print('soundfile not installed, using wave', file=sys.stderr)
        import wave
        with wave.open(audio_path, 'rb') as wf:
            sample_rate = wf.getframerate()
            frames = wf.readframes(wf.getnframes())
            audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        return _cluster_segments(audio, sample_rate, min_speakers, max_speakers)

    try:
        audio, sample_rate = sf.read(audio_path, dtype='float32')
        if audio.ndim > 1:
            audio = audio.mean(axis=1)  # 转单声道
    except Exception as e:
        print(f'Failed to read audio: {e}', file=sys.stderr)
        return []

    return _cluster_segments(audio, sample_rate, min_speakers, max_speakers)


def _cluster_segments(
    audio: np.ndarray,
    sample_rate: int,
    min_speakers: int = 2,
    max_speakers: int = 8
) -> List[Dict]:
    """
    核心聚类算法：对音频提取 MFCC，然后用层次凝聚聚类（AHC）
    """
    # 1. 用 Silero VAD 找语音段
    speech_timestamps = _get_speech_timestamps(audio, sample_rate)
    if not speech_timestamps:
        print('No speech detected', file=sys.stderr)
        return []

    # 2. 对每个语音段提取 MFCC 特征
    segment_features = []
    segment_times = []

    for ts in speech_timestamps:
        start_sample = int(ts['start'] * sample_rate)
        end_sample = int(ts['end'] * sample_rate)
        segment_audio = audio[start_sample:end_sample]

        if len(segment_audio) < sample_rate * 0.1:  # 跳过太短的片段
            continue

        try:
            mfcc = extract_mfcc(segment_audio, sample_rate)
            # 聚合为单一特征向量（均值 + 标准差）
            feat = np.concatenate([mfcc.mean(axis=0), mfcc.std(axis=0)])
            segment_features.append(feat)
            segment_times.append((ts['start'], ts['end']))
        except Exception as e:
            print(f'MFCC extraction error: {e}', file=sys.stderr)
            continue

    if len(segment_features) < min_speakers:
        # 说话人太少，至少返回 min_speakers 个
        if segment_times:
            total_dur = segment_times[-1][1] - segment_times[0][0]
            # 均匀分配
            return _uniform_segments(segment_times, min_speakers)
        return []

    features = np.array(segment_features)

    # 3. 层次凝聚聚类（AHC）+ BIC 准则自动确定 k
    n_clusters = _estimate_n_clusters(features, min_speakers, max_speakers)
    cluster_labels = _ahc_cluster(features, n_clusters)

    # 4. 合并相邻同说话人的片段
    segments = []
    for (start, end), label in zip(segment_times, cluster_labels):
        segments.append({
            'start': float(start),
            'end': float(end),
            'speaker': f'SPEAKER_{label:02d}'
        })

    # 合并相邻片段
    merged = _merge_adjacent(segments)
    return merged


def _get_speech_timestamps(
    audio: np.ndarray,
    sample_rate: int,
    threshold: float = 0.5
) -> List[Dict]:
    """使用 Silero VAD 获取语音段"""
    try:
        import torch
        torch.set_num_threads(1)

        repo_or_dir = get_silero_repo_dir() or 'snakers4/silero-vad'
        load_kwargs = {
            'repo_or_dir': repo_or_dir,
            'model': 'silero_vad',
            'trust_repo': True,
        }
        if repo_or_dir != 'snakers4/silero-vad':
            load_kwargs['source'] = 'local'

        model, utils = torch.hub.load(**load_kwargs)
        get_speech_ts = utils[0]

        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)

        timestamps = get_speech_ts(
            audio,
            threshold=threshold,
            min_speech_duration_ms=200,
            min_silence_duration_ms=300,
            sampling_rate=sample_rate
        )

        return [
            {'start': ts['start'] / sample_rate, 'end': ts['end'] / sample_rate}
            for ts in timestamps
        ]
    except Exception as e:
        print(f'Silero VAD error: {e}', file=sys.stderr)
        # fallback：假设整段都有语音
        duration = len(audio) / sample_rate
        if duration > 0.5:
            return [{'start': 0.0, 'end': duration}]
        return []


def _estimate_n_clusters(features: np.ndarray, min_k: int, max_k: int) -> int:
    """
    用 BIC（贝叶斯信息准则）自动确定聚类数量
    """
    n_samples, n_features = features.shape
    best_k = min_k
    best_bic = np.inf

    for k in range(min_k, min(max_k + 1, n_samples)):
        if k >= n_samples:
            break
        labels, centers = _kmeans(features, k)
        if labels is None:
            continue

        # 计算 BIC
        sigma_sq = np.sum((features - centers[labels]) ** 2) / (n_samples * n_features) + 1e-10
        log_likelihood = -0.5 * n_samples * n_features * np.log(2 * np.pi * sigma_sq)
        log_likelihood -= 0.5 * n_samples * n_features * sigma_sq
        penalty = 0.5 * k * n_features * np.log(n_samples)
        bic = -2 * log_likelihood + penalty

        if bic < best_bic:
            best_bic = bic
            best_k = k

    return best_k


def _kmeans(features: np.ndarray, k: int, max_iter: int = 50):
    """
    K-Means 聚类（numpy 实现，CPU 运行）
    """
    n_samples = len(features)

    # 随机选 k 个样本作为初始中心
    np.random.seed(42)
    indices = np.random.permutation(n_samples)[:k]
    centers = features[indices].copy()

    labels = np.zeros(n_samples, dtype=int)

    for _ in range(max_iter):
        # 分配
        dists = np.linalg.norm(features[:, None] - centers[None], axis=2)
        new_labels = dists.argmin(axis=1)

        if np.array_equal(new_labels, labels):
            break
        labels = new_labels

        # 更新中心
        for j in range(k):
            mask = labels == j
            if mask.any():
                centers[j] = features[mask].mean(axis=0)

    return labels, centers


def _ahc_cluster(features: np.ndarray, n_clusters: int) -> np.ndarray:
    """
    层次凝聚聚类（AHC），返回每个样本的簇标签
    """
    n = len(features)
    if n <= n_clusters:
        return np.arange(n)

    # 初始化：每个点一个簇，距离矩阵
    dists = np.linalg.norm(features[:, None] - features[None], axis=2)

    # 将距离大于最大值的设为最大值（避免合并）
    max_dist = dists.max() + 1
    np.fill_diagonal(dists, 0)

    # 当前簇标签
    labels = np.arange(n)
    active = np.ones(n, dtype=bool)
    n_active = n

    while n_active > n_clusters:
        # 找最近的两个活跃簇
        min_val = max_dist
        merge_i = -1
        merge_j = -1

        for i in range(n):
            if not active[i]:
                continue
            for j in range(i + 1, n):
                if not active[j]:
                    continue
                if dists[i, j] < min_val:
                    min_val = dists[i, j]
                    merge_i = i
                    merge_j = j

        if merge_i == -1:
            break

        # 合并 j 到 i（取并集均值）
        labels[labels == merge_j] = merge_i
        active[merge_j] = False
        n_active -= 1

        # 更新 i 到其他活跃簇的距离
        for k in range(n):
            if active[k] and k != merge_i:
                # 平均距离
                mask_i = labels == merge_i
                mask_k = labels == k
                mean_i = features[mask_i].mean(axis=0)
                mean_k = features[mask_k].mean(axis=0)
                dists[merge_i, k] = dists[k, merge_i] = np.linalg.norm(mean_i - mean_k)

    # 重新标记：按出现顺序重新编号
    unique_labels = []
    seen = set()
    for i in range(n):
        if labels[i] not in seen:
            seen.add(labels[i])
            unique_labels.append(labels[i])

    label_map = {old: new for new, old in enumerate(unique_labels)}
    return np.array([label_map[l] for l in labels])


def _merge_adjacent(segments: List[Dict]) -> List[Dict]:
    """合并相邻且相同说话人的片段"""
    if not segments:
        return []

    merged = [segments[0].copy()]

    for seg in segments[1:]:
        last = merged[-1]
        # 如果与前一段相同说话人且间隔 < 0.5s，合并
        if seg['speaker'] == last['speaker'] and seg['start'] - last['end'] < 0.5:
            last['end'] = seg['end']
        else:
            merged.append(seg.copy())

    return merged


def _uniform_segments(segment_times: List, n_speakers: int) -> List[Dict]:
    """当语音段不足以区分说话人时，均匀分配"""
    if not segment_times:
        return []
    total_start = segment_times[0][0]
    total_end = segment_times[-1][1]
    duration = total_end - total_start
    chunk_dur = duration / n_speakers

    result = []
    for i in range(n_speakers):
        result.append({
            'start': total_start + i * chunk_dur,
            'end': total_start + (i + 1) * chunk_dur,
            'speaker': f'SPEAKER_{i:02d}'
        })
    return result


# ─── pyannote.audio 可选实现 ─────────────────────────────────

def load_pyannote_pipeline(token: str = None):
    """可选：加载 pyannote 说话人分割 pipeline（需要 HuggingFace token）"""
    try:
        import torch
        from pyannote.audio import Pipeline

        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        pipeline = Pipeline.from_pretrained(
            'pyannote/speaker-diarization@2.1',
            use_auth_token=token
        )
        pipeline.to(torch.device(device))
        return pipeline
    except ImportError:
        print('pyannote.audio not installed. Use local implementation.', file=sys.stderr)
        return None


def compute_diarization_pyannote(
    pipeline,
    audio_path: str,
    min_speakers: int = 2,
    max_speakers: int = 8
) -> List[Dict]:
    """使用 pyannote.audio 进行说话人分割"""
    diarization = pipeline(audio_path, min_speakers=min_speakers, max_speakers=max_speakers)
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            'start': turn.start,
            'end': turn.end,
            'speaker': speaker
        })
    return segments
