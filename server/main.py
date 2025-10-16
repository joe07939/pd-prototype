from datetime import datetime
import io
import uuid
from typing import List, Optional, Dict

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

# quality gates & helpers (blur/lighting + quick ready-check)
from quality_gates import (
    evaluate_basic_gates,       # returns ready, failing_gates, guidance, diagnostics
    calc_blur_laplacian_var,    # per-frame sharpness metric
    calc_hist_clip_pct,         # per-frame lighting clipping %
)

app = FastAPI(title="PD Prototype API (local)")

# Allow Vite dev server origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- Health --------------------

@app.get("/healthz")
def health():
    return {"ok": True, "server_time": datetime.utcnow().isoformat() + "Z"}

# -------------------- Ready-check (still useful for debugging) --------------------

class ReadyCheckResponse(BaseModel):
    ready: bool
    failing_gates: List[str]
    guidance: str
    action: Optional[str]
    server_token: str
    diagnostics: Dict[str, float]  # {"blur_laplacian_var": float, "lighting_clip_pct": float}

@app.post("/v1/measurements/ready-check", response_model=ReadyCheckResponse)
async def ready_check(frame: UploadFile = File(...), meta: Optional[str] = Form(None)):
    """
    Fast single-frame gates (sharpness + lighting). Returns a server_token that
    you *can* send to /measure, but in Hybrid mode the client may skip this
    and call /measure directly.
    """
    raw = await frame.read()
    pil = Image.open(io.BytesIO(raw)).convert("RGB")

    # Optional downscale for speed
    max_w = 960
    if pil.width > max_w:
        h = int(pil.height * (max_w / pil.width))
        pil = pil.resize((max_w, h))

    rgb = np.array(pil)
    bgr = rgb[:, :, ::-1].copy()

    ready, failing, guidance, metrics = evaluate_basic_gates(bgr)
    action = None
    token = str(uuid.uuid4())

    print(f"[ready-check] blur={metrics['blur_laplacian_var']:.1f} "
          f"clip={metrics['lighting_clip_pct']:.1f}% ready={ready} gates={failing}")

    return ReadyCheckResponse(
        ready=ready,
        failing_gates=failing,
        guidance=guidance,
        action=action,
        server_token=token,
        diagnostics=metrics,
    )

# -------------------- Measure (Hybrid-friendly) --------------------

USAGE_COUNTER = {"measure_calls": 0}
RECENT_TOKENS: Dict[str, float] = {}   # token -> last_used_timestamp (epoch seconds)
TOKEN_COOLDOWN_SEC = 2.5               # avoid rapid duplicate bursts per token

class MeasureResponse(BaseModel):
    ok: bool
    distance_pd_mm: Optional[float]   # placeholder; real value in next step
    near_pd_mm: Optional[float]       # placeholder; real value in next step
    score: float                      # 0..1 prototype quality score
    frames_used: int
    diagnostics: Dict[str, List[float]]  # {"blur": [...], "clip_pct": [...]}
    message: str

@app.post("/v1/measurements/measure", response_model=MeasureResponse)
async def measure(
    server_token: Optional[str] = Form(None),        # <-- optional in Hybrid
    working_distance_cm: Optional[float] = Form(40.0),
    frames: List[UploadFile] = File(...),
):
    """
    Hybrid flow: accept a short burst (e.g., 5 frames), compute a prototype
    quality score using per-frame sharpness (Laplacian variance) and lighting
    clipping. Distance/Near PD will be added next when we wire landmarks.
    """
    from time import time
    now = time()
    USAGE_COUNTER["measure_calls"] += 1

    # If client supplies the token from ready-check, enforce a small cooldown
    if server_token:
        last = RECENT_TOKENS.get(server_token, 0.0)
        if now - last < TOKEN_COOLDOWN_SEC:
            return MeasureResponse(
                ok=False,
                distance_pd_mm=None,
                near_pd_mm=None,
                score=0.0,
                frames_used=0,
                diagnostics={"blur": [], "clip_pct": []},
                message="Too-rapid repeat; please hold still briefly.",
            )
        RECENT_TOKENS[server_token] = now

    blur_vals: List[float] = []
    clip_vals: List[float] = []

    for f in frames:
        raw = await f.read()
        pil = Image.open(io.BytesIO(raw)).convert("RGB")

        # Keep processing snappy
        max_w = 960
        if pil.width > max_w:
            h = int(pil.height * (max_w / pil.width))
            pil = pil.resize((max_w, h))

        rgb = np.array(pil)
        bgr = rgb[:, :, ::-1].copy()

        b = calc_blur_laplacian_var(bgr)
        c = calc_hist_clip_pct(bgr)

        # Drop obviously broken frames (camera hiccups, exposure spikes)
        if b < 5.0 or c > 50.0:
            continue

        blur_vals.append(b)
        clip_vals.append(c)

    frames_used = len(blur_vals)
    if frames_used < 3:
        return MeasureResponse(
            ok=False,
            distance_pd_mm=None,
            near_pd_mm=None,
            score=0.0,
            frames_used=frames_used,
            diagnostics={"blur": blur_vals, "clip_pct": clip_vals},
            message="Low-quality burst — retake",
        )

    # ----- Prototype quality score (0..1) -----
    # Median for robustness against outliers in a burst
    import statistics as stats
    med_blur = stats.median(blur_vals)
    med_clip = stats.median(clip_vals)

    # Blur component: 0 at 40 → 1 at 160 (adjust for your cameras later)
    def score_component_blur(b: float) -> float:
        if b >= 160.0: return 1.0
        if b <= 40.0:  return 0.0
        return (b - 40.0) / (160.0 - 40.0)

    # Clip component: 1 at 4% → 0 at 16%
    def score_component_clip(c: float) -> float:
        if c <= 4.0:  return 1.0
        if c >= 16.0: return 0.0
        return 1.0 - (c - 4.0) / (16.0 - 4.0)

    s_blur = score_component_blur(med_blur)
    s_clip = score_component_clip(med_clip)
    score = round(0.7 * s_blur + 0.3 * s_clip, 3)

    # Score → message banding
    message = (
        "OK" if score >= 0.75
        else "Borderline — consider retaking" if score >= 0.55
        else "Low quality — retake"
    )

    print(f"[measure] frames={frames_used} med_blur={med_blur:.1f} "
          f"med_clip={med_clip:.1f}% score={score:.2f} token={server_token or '-'}")

    # Distance/Near PD will be computed next (landmarks-based)
    return MeasureResponse(
        ok=True,
        distance_pd_mm=None,
        near_pd_mm=None,
        score=score,
        frames_used=frames_used,
        diagnostics={"blur": blur_vals, "clip_pct": clip_vals},
        message=message,
    )

# -------------------- Admin: usage counter --------------------

@app.get("/admin/usage")
def usage():
    return {"measure_calls": USAGE_COUNTER["measure_calls"]}
