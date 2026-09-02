from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, FastAPI
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from reel_generator import generate_reel
from supabase_client import supabase

app = FastAPI(title="Anees API")

ASSETS_DIR = Path(__file__).parent / "assets"


@app.get("/health")
def health_check():
    """Basic liveness check — doesn't touch Supabase, just confirms the app is up."""
    return {"status": "ok"}


@app.get("/health/supabase")
def supabase_health_check():
    """Confirms SUPABASE_URL/SUPABASE_ANON_KEY actually authenticate against a live project.

    Queries a table that (almost certainly) doesn't exist — a clean "table not found" response
    from PostgREST still proves the request reached Supabase and was authenticated; only a
    connection-level failure (bad URL, bad key, network) should actually raise here.
    """
    try:
        supabase.table("__anees_connectivity_probe__").select("*").limit(1).execute()
    except APIError as e:
        if e.code != "PGRST205":  # anything other than "table not found" is a real problem
            raise
    return {"status": "ok", "supabase_url": str(supabase.supabase_url)}


class ReelGenerationRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    difficulty_level: Literal["easy", "medium", "hard"]


@app.post("/reels/generate", status_code=202)
def request_reel_generation(payload: ReelGenerationRequest, background_tasks: BackgroundTasks):
    """Kicks off reel generation in the background and returns immediately.

    The actual MoviePy render + Supabase publish (render, upload to the 'videos' bucket,
    insert into 'reels', delete the local file) runs after the response is sent — FastAPI runs
    a synchronous background task in a threadpool, so it doesn't block the event loop either.
    The client gets 202 Accepted right away; ASSETS_DIR is just scratch space during the
    render and ends up empty again once each task finishes.
    """
    background_tasks.add_task(generate_reel, payload.topic, payload.difficulty_level, ASSETS_DIR)
    return {"status": "accepted", "message": "Reel generation started."}
