#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/python"
DST_DIR="$ROOT_DIR/bundled-python"

FILES=(
  "audio_capture.py"
  "audio_converter.py"
  "diarizer.py"
  "model_paths.py"
  "realtime_transcriber.py"
  "requirements.txt"
  "rpc_server.py"
  "sensevoice_transcriber.py"
  "transcriber.py"
  "vad.py"
)

for file in "${FILES[@]}"; do
  cp "$SRC_DIR/$file" "$DST_DIR/$file"
done
