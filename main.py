import argparse
import json
from google.cloud import videointelligence


def sec(duration):
    return (
        getattr(duration, "seconds", 0)
        + getattr(duration, "microseconds", 0) / 1e6
        + getattr(duration, "nanos", 0) / 1e9
    )


def overlap(a_start, a_end, b_start, b_end):
    return max(0, min(a_end, b_end) - max(a_start, b_start))


def analyze(path, output_path):
    client = videointelligence.VideoIntelligenceServiceClient()

    features = [
        videointelligence.Feature.LABEL_DETECTION,
        videointelligence.Feature.SHOT_CHANGE_DETECTION,
    ]

    operation = client.annotate_video(
        request={
            "features": features,
            "input_uri": path,
        }
    )

    print("Processing...")
    result = operation.result(timeout=600)
    print("Done.")

    annotation = result.annotation_results[0]

    shots = []
    for i, shot in enumerate(annotation.shot_annotations):
        shots.append({
            "id": i,
            "start": sec(shot.start_time_offset),
            "end": sec(shot.end_time_offset),
            "labels": [],
        })

    # ショットが取れなかった場合の保険
    if not shots:
        shots = [{
            "id": 0,
            "start": 0.0,
            "end": None,
            "labels": [],
        }]

    for label in annotation.shot_label_annotations:
        name = label.entity.description

        for segment in label.segments:
            start = sec(segment.segment.start_time_offset)
            end = sec(segment.segment.end_time_offset)
            confidence = segment.confidence

            best_shot = None
            best_overlap = 0

            for shot in shots:
                if shot["end"] is None:
                    best_shot = shot
                    break

                ov = overlap(start, end, shot["start"], shot["end"])
                if ov > best_overlap:
                    best_overlap = ov
                    best_shot = shot

            if best_shot is not None:
                best_shot["labels"].append({
                    "name": name,
                    "confidence": round(confidence, 3),
                })

    # ラベルを信頼度順に整理
    for shot in shots:
        shot["labels"] = sorted(
            shot["labels"],
            key=lambda x: x["confidence"],
            reverse=True
        )[:10]

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(shots, f, ensure_ascii=False, indent=2)

    print(f"saved: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("video_path")
    parser.add_argument("--out", default="scenes.json")
    args = parser.parse_args()

    analyze(args.video_path, args.out)
