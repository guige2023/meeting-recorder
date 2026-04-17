#!/bin/bash
# 下载 ffmpeg 静态二进制到 resources/ffmpeg/
set -e

RESOURCES_DIR="$(cd "$(dirname "$0")/../resources" && pwd)"
FFMPEG_DIR="$RESOURCES_DIR/ffmpeg"
mkdir -p "$FFMPEG_DIR"

if [[ "$(uname)" == "Darwin" ]]; then
    ARCH=$(uname -m)
    if [[ "$ARCH" == "arm64" ]]; then
        echo "Downloading ffmpeg for macOS arm64..."
        URL="https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
        curl -L "$URL" -o "/tmp/ffmpeg.zip"
        unzip -o "/tmp/ffmpeg.zip" -d "$FFMPEG_DIR"
        chmod +x "$FFMPEG_DIR/ffmpeg"
        rm -f /tmp/ffmpeg.zip
        echo "Done: $FFMPEG_DIR/$(ls '$FFMPEG_DIR')"
    else
        echo "Downloading ffmpeg for macOS x86_64..."
        URL="https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
        curl -L "$URL" -o "/tmp/ffmpeg.zip"
        unzip -o "/tmp/ffmpeg.zip" -d "$FFMPEG_DIR"
        chmod +x "$FFMPEG_DIR/ffmpeg"
        rm -f /tmp/ffmpeg.zip
        echo "Done: $FFMPEG_DIR/$(ls '$FFMPEG_DIR')"
    fi
else
    echo "Windows/Linux ffmpeg download not implemented yet"
    exit 1
fi
