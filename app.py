"""
app.py — 切り替わり点を提示して、使う区間をユーザーが選んで切り出すUI

起動:
  streamlit run app.py -- --out out

前提:
  - analyze.py を実行済みで out/scenes.json と out/thumbs/ がある
  - ffmpeg がPATHにある
"""

import argparse
import json
import os
import subprocess

import streamlit as st


def get_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    args, _ = ap.parse_known_args()
    return args


args = get_args()
SCENES_PATH = os.path.join(args.out, "scenes.json")
CLIP_DIR = os.path.join(args.out, "clips")
os.makedirs(CLIP_DIR, exist_ok=True)

st.set_page_config(page_title="Vlog Scene Cutter", layout="wide")


def render_clickable_timeline(scenes, duration, current_sc, in_point, out_point, key_prefix="tl"):
    """
    タイムラインバー（HTML） + 直下に比例幅のシーン選択ボタンを並べる。
    ボタンをクリックするとそのシーンが選択される。
    """
    blocks = []
    for sc in scenes:
        left = sc["start"] / duration * 100
        width = max((sc["end"] - sc["start"]) / duration * 100, 0.3)
        is_current = current_sc is not None and sc["id"] == current_sc["id"]
        color = "#4A90D9" if is_current else "#475569"
        ms, ss = divmod(int(sc["start"]), 60)
        me, se = divmod(int(sc["end"]), 60)
        blocks.append(
            f'<div title="シーン{sc["id"]}  {ms:02d}:{ss:02d}–{me:02d}:{se:02d}" '
            f'style="position:absolute;left:{left:.3f}%;width:{width:.3f}%;height:100%;'
            f'background:{color};border:1px solid rgba(255,255,255,0.15);'
            f'box-sizing:border-box;border-radius:2px;"></div>'
        )

    # 切り出し範囲オーバーレイ
    range_overlay = ""
    if current_sc is not None and in_point is not None and out_point is not None:
        clip_left = in_point / duration * 100
        clip_width = max((out_point - in_point) / duration * 100, 0.2)
        mc, sc2 = divmod(int(in_point), 60)
        me2, se2 = divmod(int(out_point), 60)
        range_overlay = (
            f'<div title="切り出し  {mc:02d}:{sc2:02d}–{me2:02d}:{se2:02d}" '
            f'style="position:absolute;left:{clip_left:.3f}%;width:{clip_width:.3f}%;height:100%;'
            f'background:rgba(255,100,0,0.55);border:2px solid #FF6400;'
            f'box-sizing:border-box;border-radius:2px;z-index:10;"></div>'
        )

    # シーン境界の赤線
    boundaries = ""
    for sc in scenes[1:]:
        left = sc["start"] / duration * 100
        mb, sb = divmod(int(sc["start"]), 60)
        boundaries += (
            f'<div title="{mb:02d}:{sb:02d}" '
            f'style="position:absolute;left:{left:.3f}%;width:2px;height:130%;top:-15%;'
            f'background:#EF4444;z-index:20;"></div>'
        )

    dm, ds = divmod(int(duration), 60)
    bar_html = f"""
    <div style="position:relative;height:32px;background:#0F172A;border-radius:6px;
                margin:4px 0 0;overflow:visible;">
      {''.join(blocks)}{range_overlay}{boundaries}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;
                color:#64748B;margin:2px 0 4px;">
      <span>0:00</span>
      <span>
        <span style="color:#4A90D9;">■ 選択中シーン</span>&nbsp;
        <span style="color:#FF6400;">■ 切り出し範囲</span>&nbsp;
        <span style="color:#EF4444;">| 境界</span>
      </span>
      <span>{dm}:{ds:02d}</span>
    </div>
    """
    st.markdown(bar_html, unsafe_allow_html=True)

    # タイムラインに比例した幅のボタン行
    widths = [max((sc["end"] - sc["start"]) / duration, 0.02) for sc in scenes]
    cols = st.columns(widths, gap="small")
    for col, sc in zip(cols, scenes):
        is_current = current_sc is not None and sc["id"] == current_sc["id"]
        if col.button(
            str(sc["id"]),
            key=f"{key_prefix}_btn_{sc['id']}",
            use_container_width=True,
            type="primary" if is_current else "secondary",
            help=f"シーン{sc['id']}を選択",
        ):
            st.session_state.selected = sc["id"]
            st.rerun()


if not os.path.exists(SCENES_PATH):
    st.error(f"{SCENES_PATH} がありません。先に analyze.py を実行してください。")
    st.stop()

with open(SCENES_PATH, encoding="utf-8") as f:
    data = json.load(f)

video_path = data["video"]
scenes = data["scenes"]
duration = data["duration"]

if not os.path.exists(video_path):
    st.error(f"動画が見つかりません: {video_path}")
    st.stop()


# ── サイドバー ─────────────────────────────────────────
st.sidebar.title("Vlog Scene Cutter")
video_h = st.sidebar.slider(
    "プレビュー動画の高さ (vh)", min_value=20, max_value=80, value=40, step=5)
st.markdown(
    f"<style>video{{max-height:{video_h}vh;width:100%!important;object-fit:contain;}}</style>",
    unsafe_allow_html=True,
)
default_clip_len = st.sidebar.number_input(
    "デフォルト切り出し長 (秒)", min_value=1.0, max_value=120.0, value=8.0, step=0.5,
    help="シーン選択時の初期レンジ幅。選択後にスライダーで自由変更できます")
reencode = st.sidebar.checkbox(
    "フレーム精度で切り出す (再エンコード)", value=True,
    help="オフにするとコピーで高速だが、開始点がキーフレーム単位にずれる")
st.sidebar.caption(
    f"動画: {os.path.basename(video_path)} / {duration:.0f}秒 / "
    f"シーン候補 {len(scenes)} 個")


# ── session_state 初期化 ───────────────────────────────
if "selected" not in st.session_state:
    st.session_state.selected = None


# ── タイムライン（ページ最上部） ───────────────────────
st.subheader("タイムライン")
st.caption("番号ボタンをクリックしてシーンを選択")

selected_sc = (
    next((s for s in scenes if s["id"] == st.session_state.selected), None)
)
render_clickable_timeline(scenes, duration, selected_sc, None, None, key_prefix="top")


# ── 切り替わり曲線 ─────────────────────────────────────
with st.expander("切り替わりスコアの全体像", expanded=False):
    curve = data.get("boundary_curve")
    if curve:
        st.line_chart(curve, height=160)
        st.caption("山が高いところほど『場面が変わった』可能性が高い時刻 (横軸=秒)")


# ── シーン一覧 ─────────────────────────────────────────
st.subheader("切り替わり候補")

for sc in scenes:
    is_current = st.session_state.selected == sc["id"]
    with st.container(border=True):
        cols = st.columns([2, 3, 1])
        with cols[0]:
            thumbs = sc.get("thumbs", [])
            if thumbs:
                tcols = st.columns(len(thumbs))
                for tc, tp in zip(tcols, thumbs):
                    p = os.path.join(args.out, tp)
                    if os.path.exists(p):
                        tc.image(p)
        with cols[1]:
            mins, secs = divmod(int(sc["start"]), 60)
            mine, sece = divmod(int(sc["end"]), 60)
            prefix = "**▶ シーン**" if is_current else "**シーン**"
            st.markdown(
                f"{prefix} **{sc['id']}**  "
                f"{mins:02d}:{secs:02d} – {mine:02d}:{sece:02d} "
                f"({sc['end'] - sc['start']:.0f}秒)")
            st.write(" / ".join(
                f"{l['name']} ({l['score']:.2f})" for l in sc["labels"]))
            if sc["boundary_score"] is not None:
                st.caption(f"切り替わりスコア: {sc['boundary_score']:.2f}")
        with cols[2]:
            if st.button(
                "選択中" if is_current else "選択",
                key=f"sel_{sc['id']}",
                use_container_width=True,
                type="primary" if is_current else "secondary",
            ):
                st.session_state.selected = sc["id"]
                st.rerun()


# ── 選択シーン内の区間指定と切り出し ───────────────────
if st.session_state.selected is not None:
    sc = next(s for s in scenes if s["id"] == st.session_state.selected)
    st.divider()
    st.header(f"シーン {sc['id']} — 区間を選んで切り出す")

    scene_lo = float(sc["start"])
    scene_hi = float(sc["end"])
    default_out = min(scene_lo + float(default_clip_len), scene_hi)

    if scene_hi - scene_lo < 0.5:
        in_point = scene_lo
        out_point = scene_hi
        st.info("シーンが短いため全区間を選択します。")
    else:
        in_point, out_point = st.slider(
            "切り出し区間 (秒) — 両端をドラッグして自由に設定",
            min_value=scene_lo,
            max_value=scene_hi,
            value=(scene_lo, default_out),
            step=0.5,
            help="左ハンドル=開始点、右ハンドル=終了点",
        )

    clip_duration = out_point - in_point

    # タイムライン（切り出し範囲を反映）
    render_clickable_timeline(scenes, duration, sc, in_point, out_point, key_prefix="det")

    ip_m, ip_s = divmod(int(in_point), 60)
    op_m, op_s = divmod(int(out_point), 60)
    st.caption(
        f"切り出し範囲: {ip_m:02d}:{ip_s:02d} 〜 {op_m:02d}:{op_s:02d} "
        f"({clip_duration:.1f}秒)"
    )

    st.video(video_path, start_time=int(in_point))

    if clip_duration < 0.5:
        st.warning("区間が短すぎます。終了点を開始点より右にドラッグしてください。")
    elif st.button("この区間を切り出す", type="primary"):
        out_name = (
            f"scene{sc['id']:03d}_{ip_m:02d}{ip_s:02d}"
            f"-{op_m:02d}{op_s:02d}_{clip_duration:.0f}s.mp4"
        )
        out_path = os.path.join(CLIP_DIR, out_name)
        if reencode:
            cmd = ["ffmpeg", "-y", "-ss", f"{in_point:.3f}",
                   "-i", video_path, "-t", f"{clip_duration:.3f}",
                   "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                   "-c:a", "aac", "-movflags", "+faststart", out_path]
        else:
            cmd = ["ffmpeg", "-y", "-ss", f"{in_point:.3f}",
                   "-i", video_path, "-t", f"{clip_duration:.3f}",
                   "-c", "copy", out_path]
        with st.spinner("切り出し中..."):
            proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            st.error("ffmpegが失敗しました")
            st.code(proc.stderr[-2000:])
        else:
            st.success(f"保存しました: {out_path}")
            st.video(out_path)
            with open(out_path, "rb") as f:
                st.download_button("ダウンロード", f, file_name=out_name,
                                   mime="video/mp4")


# ── 切り出し済みクリップ一覧 ───────────────────────────
existing = sorted(os.listdir(CLIP_DIR)) if os.path.isdir(CLIP_DIR) else []
if existing:
    st.divider()
    st.header("切り出し済みクリップ")
    for name in existing:
        st.write(f"- {name}")
