from app.infra.video.intelligence import parse_annotation, _offset_to_ms

def test_offset_to_ms_string():
    assert _offset_to_ms("1.5s") == 1500

def test_offset_to_ms_dict():
    assert _offset_to_ms({"seconds": 2, "nanos": 500000000}) == 2500

def test_parse_annotation():
    fake = {"frameLabelAnnotations": [
        {"entity": {"description": "beach"},
         "frames": [{"timeOffset": "0s", "confidence": 0.9}]},
    ]}
    tracks = parse_annotation(fake)
    assert tracks[0].description == "beach"
    assert tracks[0].frames[0].time_ms == 0