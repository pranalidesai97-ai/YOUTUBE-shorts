#!/usr/bin/env bash
# Assemble rendered frames + final mix into the delivery MP4 and run QA checks.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-output/how-a-microwave-heats-food.mp4}
mkdir -p "$(dirname "$OUT")"

n=$(ls build/frames/f_*.jpg | wc -l)
[ "$n" -eq 1200 ] || { echo "expected 1200 frames, found $n"; exit 1; }

ffmpeg -y -hide_banner -loglevel error \
  -framerate 30 -start_number 0 -i build/frames/f_%04d.jpg \
  -i build/mix.wav \
  -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 20 -profile:v high -level 4.2 -pix_fmt yuv420p \
  -x264-params "keyint=60:min-keyint=30" -r 30 -fps_mode cfr \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 256k -ar 48000 -ac 2 \
  -frames:v 1200 -t 40 -movflags +faststart \
  "$OUT"

echo "== stream info"
ffprobe -v error -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels,duration -show_entries format=duration,size,bit_rate -of default=nw=1 "$OUT"
echo "== decoded frame count"
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT"
echo "== black frames (none expected)"
ffmpeg -hide_banner -nostats -i "$OUT" -vf "blackdetect=d=0.03:pix_th=0.06" -an -f null - 2>&1 | grep -i blackdetect || echo "none"
echo "== frozen stretches >= 0.5 s (none expected)"
ffmpeg -hide_banner -nostats -i "$OUT" -vf "freezedetect=n=0.0005:d=0.5" -an -f null - 2>&1 | grep -i "freeze_" || echo "none"
echo "== audio loudness / peak"
ffmpeg -hide_banner -nostats -i "$OUT" -af "ebur128=peak=true" -vn -f null - 2>&1 | sed -n '/Summary/,$p'
echo "== audio clipping check (astats)"
ffmpeg -hide_banner -nostats -i "$OUT" -af "astats=metadata=0:reset=0" -vn -f null - 2>&1 | grep -E "Peak level dB|Number of clipped|Overall" | head -8 || true
