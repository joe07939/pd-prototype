import { useEffect, useRef, useState } from "react";
import { loadWithTTL, saveWithTTL } from "../utils/storage";
import { calibStorageKey, uaHash } from "../utils/device";
import { normalizeMotionPx, ema } from "../utils/motion";

type LMPoint = { x: number; y: number; z?: number };
type DetectResult = {
  faceLandmarks?: Array<Array<LMPoint>>;
  facialTransformationMatrixes?: Array<{ data: Float32Array }>;
} | null | undefined;

type DetectFn = (v: HTMLVideoElement, ts: number) => DetectResult;

export type CalibWindow = { min: number; max: number; median: number };

type Options = {
  getVideo: () => HTMLVideoElement | null;
  detect: DetectFn | null;
  deviceId: string | null;
  videoHeight: number;
  ttlDays?: number;
  sampleMs?: number;
  minSamples?: number;
  poseTolDeg?: number;
  earMin?: number;
  motionMaxPx720?: number;
  /** Optional: force a “target” distance fraction we bias toward (e.g. 0.18 desktop, 0.21 mobile). */
  targetFrac?: number;
};

// Safe viewport width accessor
function vpWidth(): number {
  try {
    const w = (globalThis as any)?.innerWidth;
    return typeof w === "number" && w > 0 ? w : 1024;
  } catch {
    return 1024;
  }
}

export function useAutoCalibration(opts: Options) {
  const {
    getVideo,
    detect,
    deviceId,
    videoHeight,
    ttlDays = 14,
    sampleMs = 2000,
    minSamples = 26,
    poseTolDeg = 20,
    earMin = 0.06,
    motionMaxPx720 = 30,
    targetFrac,
  } = opts;

  const [state, setState] = useState<"idle" | "sampling" | "ready">("idle");
  const [windowCalib, setWindowCalib] = useState<CalibWindow | null>(null);
  const [hint, setHint] = useState<string>("");

  const uaRef = useRef<string>("");
  const motionEmaRef = useRef(0);
  const samplesRef = useRef<number[]>([]);
  const startedRef = useRef<number>(0);

  // Device-class heuristics
  const isMobile = vpWidth() < 820;

  // “Sane” final clamps per device (**these solve your #2 “too close” problem**)
  // Desktop/laptop: 16–20% ; Mobile selfie: 18–24%
  const FINAL_MIN = isMobile ? 0.18 : 0.16;
  const FINAL_MAX = isMobile ? 0.24 : 0.20;

  // Sampling acceptance band (looser than final clamp)
  const ACCEPT_MIN = isMobile ? 0.16 : 0.14;
  const ACCEPT_MAX = isMobile ? 0.30 : 0.26;

  // Default target distance (if not provided)
  const TARGET_FRAC = typeof targetFrac === "number" ? targetFrac : (isMobile ? 0.21 : 0.18);

  // Try to load cached calibration
  useEffect(() => {
    let cancelled = false;
    (async () => {
      uaRef.current = await uaHash();
      if (!deviceId || !videoHeight) return;
      const key = calibStorageKey(deviceId, videoHeight, uaRef.current);
      const cached = loadWithTTL<CalibWindow & { videoHeight: number; deviceId: string; ua: string }>(key);
      if (!cancelled && cached) {
        // Clamp cached to new sane limits too (guards older runs)
        const min = clamp(cached.min, FINAL_MIN, FINAL_MAX);
        const max = clamp(cached.max, FINAL_MIN, FINAL_MAX);
        const median = clamp(cached.median, FINAL_MIN, FINAL_MAX);
        setWindowCalib({ min, max, median });
        setState("ready");
        setHint(`Loaded calibration (~${Math.round(median * 100)}%)`);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId, videoHeight]);

  const start = () => {
    setState("sampling");
    setHint("Preparing… keep face centered, look at the camera");
    samplesRef.current = [];
    startedRef.current = performance.now();
    motionEmaRef.current = 0;
  };

  // Sampling loop
  useEffect(() => {
    if (state !== "sampling") return;
    let raf = 0;
    let lastTs = 0;

    const tick = () => {
      const ts = performance.now();
      if (ts - lastTs < 66) { raf = requestAnimationFrame(tick); return; }
      lastTs = ts;

      const video = getVideo();
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) { raf = requestAnimationFrame(tick); return; }
      if (!detect) { raf = requestAnimationFrame(tick); return; }

      const res = detect(video, ts);
      const face = res?.faceLandmarks?.[0];
      const mat = res?.facialTransformationMatrixes?.[0]?.data;

      if (face) {
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const p of face) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const frac = (maxX - minX); // face width fraction of frame width

        // Pose guard
        let yaw = 0, pitch = 0, roll = 0;
        if (mat) {
          const r00 = mat[0];
          const r10 = mat[1], r11 = mat[5], r12 = mat[9];
          const r20 = mat[2], r21 = mat[6], r22 = mat[10];
          const pitchRad = Math.asin(-r20);
          const cp = Math.cos(pitchRad);
          let rollRad = 0, yawRad = 0;
          if (Math.abs(cp) > 1e-5) { rollRad = Math.atan2(r21, r22); yawRad = Math.atan2(r10, r00); }
          else { rollRad = Math.atan2(-r12, r11); yawRad = 0; }
          yaw = yawRad * 180/Math.PI; pitch = pitchRad * 180/Math.PI; roll = rollRad * 180/Math.PI;
        }

        // Eye openness (left)
        let ear = 1;
        try {
          const li = (i: number) => face[i];
          const eyeTop = li(159), eyeBot = li(145), eyeL = li(33), eyeR = li(133);
          const eyeW = Math.hypot((eyeR.x - eyeL.x) * video.videoWidth, (eyeR.y - eyeL.y) * video.videoHeight);
          const eyeH = Math.hypot((eyeTop.x - eyeBot.x) * video.videoWidth, (eyeTop.y - eyeBot.y) * video.videoHeight);
          ear = eyeW > 0 ? eyeH / eyeW : 0;
        } catch { /* ignore */ }

        // Motion (coarse EMA)
        const motionNorm = normalizeMotionPx(0, video.videoHeight, 720);
        motionEmaRef.current = ema(motionEmaRef.current, motionNorm, 0.5);

        const poseOk = Math.abs(yaw) <= poseTolDeg && Math.abs(pitch) <= poseTolDeg && Math.abs(roll) <= poseTolDeg;
        const eyesOk = ear >= earMin;
        const motionOk = motionEmaRef.current <= motionMaxPx720;
        const fracOk = frac >= ACCEPT_MIN && frac <= ACCEPT_MAX;

        if (poseOk && eyesOk && motionOk && fracOk) {
          samplesRef.current.push(frac);
          setHint("Calibrating… hold still");
        } else if (!fracOk) {
          setHint("Calibrating… adjust distance to be mid-frame, then hold still");
        } else {
          setHint("Calibrating… hold still");
        }
      }

      // Finish or retry
      const elapsed = ts - startedRef.current;
      const gotTime = elapsed >= sampleMs;
      const gotSamples = samplesRef.current.length >= minSamples;

      if (gotTime || gotSamples) {
        const usable = samplesRef.current.length >= Math.max(6, Math.floor(minSamples * 0.6));
        if (usable) {
          const arr = samplesRef.current.slice().sort((a, b) => a - b);
          const n = arr.length;
          const drop = Math.floor(n * 0.2);
          const kept = n - drop > drop ? arr.slice(drop, n - drop) : arr;
          const median = kept.length ? medianOf(kept) : medianOf(arr);
          // Bias toward target distance (helps avoid “too close” medians)
          const biased = 0.6 * median + 0.4 * TARGET_FRAC;

          // Final window around biased median
          const margin = isMobile ? 0.03 : 0.02;
          const lo = clamp(biased - margin, FINAL_MIN, FINAL_MAX);
          const hi = clamp(biased + margin, FINAL_MIN, FINAL_MAX);

          const win = { min: lo, max: hi, median: clamp(biased, FINAL_MIN, FINAL_MAX) };
          setWindowCalib(win);
          setState("ready");
          setHint(`Calibrated · ${(win.median * 100).toFixed(0)}%`);

          // Persist (clamped)
          (async () => {
            if (!deviceId) return;
            const key = calibStorageKey(deviceId, videoHeight, uaRef.current);
            saveWithTTL(key, { ...win, videoHeight, deviceId, ua: uaRef.current }, ttlDays);
          })();
          return;
        } else {
          samplesRef.current = [];
          startedRef.current = performance.now();
          setHint("Calibrating… keep steady and centered");
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [state, getVideo, detect, deviceId, videoHeight, sampleMs, minSamples, poseTolDeg, earMin, motionMaxPx720, ttlDays]);

  const reset = () => { setWindowCalib(null); setState("idle"); setHint(""); };

  return { state, window: windowCalib, hint, start, reset };
}

// helpers
function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
function medianOf(a: number[]): number {
  if (a.length === 0) return 0.18;
  const b = a.slice().sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
