"""Generates a short vertical "reel" video for a given topic + difficulty, then publishes it:
uploads the MP4 to the Supabase 'videos' storage bucket, records it in the 'reels' table, and
removes the local copy.

The video itself is a basic MoviePy pipeline: a solid-color title card (colored by difficulty,
using the same color-coding as the difficulty badges elsewhere in the app — see
frontend/src/styles/theme.css) with the topic as overlay text. Real content generation
(narration, multiple scenes, animation) is a follow-up; this gives the request/background-task
pipeline a real video to produce and publish end-to-end rather than a stub.

Runs synchronously and takes a few seconds — callers driving this from a web request should do
so via BackgroundTasks (see main.py) rather than awaiting it inline.
"""

import logging
from pathlib import Path
from uuid import uuid4

from moviepy import ColorClip, CompositeVideoClip, TextClip

from supabase_client import supabase_admin

logger = logging.getLogger(__name__)

REEL_SIZE = (720, 1280)  # portrait, matching the app's TikTok-style reel player
REEL_DURATION = 5  # seconds

STORAGE_BUCKET = "videos"

# Same color-coding as the difficulty badges elsewhere in the app (the "-ink" theme tokens,
# which are the solid/saturated form of each pastel — see frontend/src/styles/theme.css).
DIFFICULTY_COLORS: dict[str, tuple[int, int, int]] = {
    "easy": (47, 143, 91),  # --pastel-green-ink
    "medium": (169, 118, 27),  # --pastel-yellow-ink
    "hard": (192, 84, 107),  # --pastel-pink-ink
}
DEFAULT_COLOR = (27, 111, 99)  # --maroon, used for any difficulty outside the known set

# The 'reels' table's difficulty_level column is an integer, not text — this is the ordinal
# scale it uses (confirmed against the live schema, not guessed).
DIFFICULTY_LEVEL_TO_INT: dict[str, int] = {"easy": 1, "medium": 2, "hard": 3}


def generate_reel(topic: str, difficulty_level: str, output_dir: Path) -> str:
    """Renders a title-card video for `topic`, publishes it, and returns its public URL.

    End-to-end: render locally -> upload to the 'videos' storage bucket -> insert a row into
    the 'reels' table (topic, difficulty_level, video_url) -> delete the local file. The local
    file is only deleted after a successful upload + insert, so a failure partway through
    leaves the render on disk instead of silently losing it.
    """
    if supabase_admin is None:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is not set — required to upload to storage and insert "
            "into the reels table (see fastapi-backend/.env)."
        )

    logger.info("Generating reel: topic=%r difficulty=%r", topic, difficulty_level)
    output_dir.mkdir(parents=True, exist_ok=True)

    color = DIFFICULTY_COLORS.get(difficulty_level.lower(), DEFAULT_COLOR)
    label = difficulty_level.upper()

    background = ColorClip(size=REEL_SIZE, color=color, duration=REEL_DURATION)

    badge = (
        TextClip(text=label, font_size=36, color="white", method="label")
        .with_position(("center", 140))
        .with_duration(REEL_DURATION)
    )

    title = (
        TextClip(
            text=topic,
            font_size=64,
            color="white",
            size=(REEL_SIZE[0] - 120, None),
            method="caption",
            text_align="center",
        )
        .with_position(("center", "center"))
        .with_duration(REEL_DURATION)
    )

    video = CompositeVideoClip([background, badge, title], size=REEL_SIZE)

    filename = f"{_slugify(topic)}-{uuid4().hex[:8]}.mp4"
    output_path = output_dir / filename

    try:
        video.write_videofile(str(output_path), fps=24, codec="libx264", audio=False, logger=None)
    finally:
        video.close()
        background.close()
        title.close()
        badge.close()

    logger.info("Reel rendered locally to %s", output_path)

    public_url = _publish(output_path, filename, topic, difficulty_level)

    output_path.unlink()
    logger.info("Deleted local file %s (published to %s)", output_path, public_url)

    return public_url


def _publish(local_path: Path, storage_filename: str, topic: str, difficulty_level: str) -> str:
    """Uploads the rendered file to storage, records it in the 'reels' table, and returns its
    public URL. Raises on failure — the caller keeps the local file when this raises.
    """
    bucket = supabase_admin.storage.from_(STORAGE_BUCKET)
    bucket.upload(storage_filename, local_path, file_options={"content-type": "video/mp4"})
    logger.info("Uploaded %s to storage bucket %r", storage_filename, STORAGE_BUCKET)

    public_url = bucket.get_public_url(storage_filename)

    difficulty_int = DIFFICULTY_LEVEL_TO_INT[difficulty_level.lower()]
    supabase_admin.table("reels").insert(
        {"topic": topic, "difficulty_level": difficulty_int, "video_url": public_url}
    ).execute()
    logger.info("Inserted reels row for topic=%r", topic)

    return public_url


def _slugify(text: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in text).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug[:40] or "reel"
