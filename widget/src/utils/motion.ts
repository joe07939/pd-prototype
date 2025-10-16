// Motion normalization + EMA

export function normalizeMotionPx(px: number, videoHeight: number, ref = 720) {
    if (!videoHeight) return px;
    return px * (ref / videoHeight);
  }
  
  export function ema(prev: number, now: number, alpha = 0.6) {
    if (!Number.isFinite(prev)) return now;
    return alpha * now + (1 - alpha) * prev;
  }
  