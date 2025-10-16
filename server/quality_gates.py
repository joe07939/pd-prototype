from typing import Tuple, List, Dict
import numpy as np
import cv2

def calc_blur_laplacian_var(bgr: np.ndarray) -> float:
    """
    Sharpness metric: variance of Laplacian on grayscale image.
    Laptop/phone webcams can be *very* smooth; values of 60–250 are common.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())

def calc_hist_clip_pct(bgr: np.ndarray) -> float:
    """
    Lighting check: % of pixels at 0 or 255 (pure black/white).
    Lower is better; high values mean crushed shadows/highlights or backlight.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    total = hist.sum() if hist.sum() > 0 else 1.0
    extreme = hist[0] + hist[-1]
    return float((extreme / total) * 100.0)

def evaluate_basic_gates(bgr: np.ndarray) -> Tuple[bool, List[str], str, Dict[str, float]]:
    """
    Minimal, fast gates for Step 6 with diagnostics.
      - sharpness via Laplacian variance (>= 80 for now)
      - lighting via histogram clipping (< 8% for now)
    Returns: (ready, failing_gates, guidance, metrics)
    """
    failing: List[str] = []
    guidance = "Hold still… capturing soon"

    blur = calc_blur_laplacian_var(bgr)
    clip = calc_hist_clip_pct(bgr)

    # Relaxed thresholds to validate pipeline; we’ll tighten later.
    if blur < 80.0:
        failing.append("sharpness")
        guidance = "Hold still—image is a bit blurry"

    if clip >= 8.0:
        failing.append("lighting")
        guidance = "Face a light source (avoid a bright window behind you)"

    ready = len(failing) == 0
    if ready:
        guidance = "Hold still… capturing"

    metrics = {"blur_laplacian_var": float(blur), "lighting_clip_pct": float(clip)}
    return ready, failing, guidance, metrics
