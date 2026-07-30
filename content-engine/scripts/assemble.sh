#!/usr/bin/env bash
# content-engine/scripts/assemble.sh
#
# Phase 2: 実写素材 + 字幕(テロップ) + BGM から、縦型ショート動画(1080x1920)を書き出す。
# ナレーションTTSはまだ繋いでいない(Phase1では字幕運用のため)。
#
# 依存: ffmpeg (要インストール。このリポジトリには同梱していない)
#
# 使い方:
#   ./assemble.sh <入力素材(動画 or 静止画)> <BGMファイル> <出力mp4> ["テロップ1" "テロップ2" ...]
#
# 例(動画素材 + テロップ2枚):
#   ./assemble.sh source.mp4 ../assets/bgm/calm.mp3 out.mp4 \
#     "この子、まだ飼い主さん募集中です" "詳しくはプロフィールのリンクから"
#
# 例(静止画素材、Ken Burnsでゆっくりズーム):
#   ./assemble.sh photo.jpg ../assets/bgm/calm.mp3 out.mp4 "みんなが選ぶ理由、わかる気がする"

set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg が見つかりません。先にインストールしてください。" >&2
  exit 1
fi

INPUT="${1:?入力素材(動画/画像)を指定してください}"
BGM="${2:?BGMファイルを指定してください}"
OUTPUT="${3:?出力先mp4パスを指定してください}"
shift 3
CAPTIONS=("$@")

WIDTH=1080
HEIGHT=1920
DURATION=15   # 静止画から動画を作る場合の尺(秒)。動画素材の場合は元の長さを使う。

EXT="${INPUT##*.}"
EXT_LC="$(echo "$EXT" | tr '[:upper:]' '[:lower:]')"

# 縦型トリミング + スケーリングの共通フィルタ
CROP_SCALE="scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}"

# drawtext フィルタをテロップ配列から組み立てる(等間隔で1つずつ表示)
build_drawtext_filter() {
  local n="${#CAPTIONS[@]}"
  if [ "$n" -eq 0 ]; then
    echo ""
    return
  fi
  local seg
  if [ "$EXT_LC" = "jpg" ] || [ "$EXT_LC" = "jpeg" ] || [ "$EXT_LC" = "png" ]; then
    seg=$(awk -v d="$DURATION" -v n="$n" 'BEGIN{printf "%.2f", d/n}')
  else
    # 動画の長さは実行時に ffprobe で取得する
    local vid_dur
    vid_dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT")
    seg=$(awk -v d="$vid_dur" -v n="$n" 'BEGIN{printf "%.2f", d/n}')
  fi

  local filters=""
  local i=0
  for cap in "${CAPTIONS[@]}"; do
    local start end
    start=$(awk -v s="$seg" -v i="$i" 'BEGIN{printf "%.2f", s*i}')
    end=$(awk -v s="$seg" -v i="$i" 'BEGIN{printf "%.2f", s*(i+1)}')
    local escaped
    escaped=$(printf '%s' "$cap" | sed "s/:/\\\\:/g; s/'/\\\\'/g")
    filters+="drawtext=text='${escaped}':fontcolor=white:fontsize=64:borderw=4:bordercolor=black@0.8:x=(w-text_w)/2:y=h-400:enable='between(t,${start},${end})',"
    i=$((i+1))
  done
  echo "${filters%,}"
}

DRAWTEXT="$(build_drawtext_filter)"

if [ -n "$DRAWTEXT" ]; then
  VF="${CROP_SCALE},${DRAWTEXT}"
else
  VF="${CROP_SCALE}"
fi

if [ "$EXT_LC" = "jpg" ] || [ "$EXT_LC" = "jpeg" ] || [ "$EXT_LC" = "png" ]; then
  # 静止画: ゆっくりズームイン(Ken Burns) + 指定尺のループ
  ffmpeg -y \
    -loop 1 -i "$INPUT" \
    -i "$BGM" \
    -filter_complex "[0:v]scale=${WIDTH}*2:${HEIGHT}*2,zoompan=z='min(zoom+0.0007,1.3)':d=$((DURATION*25)):s=${WIDTH}x${HEIGHT}:fps=25,${DRAWTEXT:+$DRAWTEXT}[v]" \
    -map "[v]" -map 1:a \
    -t "$DURATION" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
    "$OUTPUT"
else
  # 動画素材: 縦トリミング + テロップ焼き込み + BGMに差し替え
  ffmpeg -y \
    -i "$INPUT" \
    -i "$BGM" \
    -filter_complex "[0:v]${VF}[v]" \
    -map "[v]" -map 1:a \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
    "$OUTPUT"
fi

echo "書き出し完了: $OUTPUT"
