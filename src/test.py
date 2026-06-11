import io
import json
from collections import defaultdict
from google.cloud import videointelligence

path = r"C:\Users\yuta_academic\fmi\HMI\HMI2026\movies\1.mov"
output_path = "scenes.json"

TOP_N = 5
SIMILARITY_THRESHOLD = 0.5

# ── 1. ラベル取得 ──────────────────────────────────────
video_client = videointelligence.VideoIntelligenceServiceClient()
features = [videointelligence.Feature.LABEL_DETECTION]

with io.open(path, "rb") as movie:
    input_content = movie.read()

operation = video_client.annotate_video(
    request={
        "features": features,
        "input_content": input_content,
        "video_context": {
            "label_detection_config": {
                "label_detection_mode": "FRAME_MODE"
            }
        }
    }
)
print("Processing...")
result = operation.result(timeout=600)
print("Done.")

# ── 2. 時間ごとにラベルを収集（上位TOP_N件） ───────────
time_labels = defaultdict(list)
for frame_label in result.annotation_results[0].frame_label_annotations:
    label = frame_label.entity.description
    frames = frame_label.frames
    avg_conf = sum(f.confidence for f in frames) / len(frames)
    for frame in frames:
        t = frame.time_offset.seconds + frame.time_offset.microseconds / 1e6
        time_labels[t].append((label, avg_conf))

top_time_labels = {}
for t, labels in time_labels.items():
    sorted_labels = sorted(labels, key=lambda x: x[1], reverse=True)
    top_time_labels[t] = frozenset(l[0] for l in sorted_labels[:TOP_N])

# ── 3. Jaccard係数でシーンをまとめる ───────────────────
def similarity(a, b):
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)

sorted_times = sorted(top_time_labels.keys())
scenes = []
current_labels = None
current_start = None

for t in sorted_times:
    labels = top_time_labels[t]
    if current_labels is None:
        current_labels = labels
        current_start = t
    elif similarity(current_labels, labels) >= SIMILARITY_THRESHOLD:
        current_labels = current_labels | labels
        current_labels = frozenset(
            sorted(current_labels, key=lambda x: sum(
                1 for tl in top_time_labels.values() if x in tl
            ), reverse=True)[:TOP_N]
        )
    else:
        scenes.append({
            "start": current_start,
            "end": t - 1.0,
            "labels": sorted(list(current_labels))
        })
        current_labels = labels
        current_start = t

if current_labels is not None:
    scenes.append({
        "start": current_start,
        "end": sorted_times[-1],
        "labels": sorted(list(current_labels))
    })

# ── 4. 保存 ────────────────────────────────────────────
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(scenes, f, ensure_ascii=False, indent=2)

print("saved: {}".format(output_path))
for scene in scenes:
    print("{}s ~ {}s : {}".format(
        scene["start"],
        scene["end"],
        ", ".join(scene["labels"])
    ))