import { useEffect, useRef, useState } from "react";

type LMPoint = { x: number; y: number; z?: number };
type DetectResult = {
  faceLandmarks?: Array<Array<LMPoint>>;
  facialTransformationMatrixes?: Array<{ data: Float32Array }>;
} | null | undefined;

type DetectFn = (v: HTMLVideoElement, ts: number) => DetectResult;

type Options = {
  getVideo: () => HTMLVideoElement | null;
  getDetect: () => DetectFn | null;
  distanceWindow: { min: number; max: number };
  yawMax: number;
  pitchMax: number;
  rollMax: number;
  earMin: number;
  motionMaxPx720: number;
  dwellMs: number;
  readyGreenMs: number;
};

type Pose = { yaw: number; pitch: number; roll: number };

export function useFaceGating(opts: Options) {
  const {
    getVideo, getDetect, distanceWindow,
    yawMax, pitchMax, rollMax, earMin,
    motionMaxPx720, dwellMs, readyGreenMs,
  } = opts;

  const [guidance, setGuidance] = useState<string>("Preparing camera…");
  const [ringColor, setRingColor] = useState<"white" | "green">("white");
  const [distanceStatus, setDistanceStatus] = useState<"ok" | "close" | "far" | "na">("na");
  const [faceFrac, setFaceFrac] = useState<number | null>(null);
  const [hasFace, setHasFace] = useState<boolean>(false);
  const [pose, setPose] = useState<Pose | null>(null);
  const [ear, setEar] = useState<number | null>(null);
  const [motion, setMotion] = useState<number | null>(null);
  const [canCapture, setCanCapture] = useState<boolean>(false);

  // dwell timers
  const okSinceRef = useRef<number | null>(null);
  const greenSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const tick = () => {
      const ts = performance.now();
      if (ts - lastTs < 66) { raf = requestAnimationFrame(tick); return; }
      lastTs = ts;

      const video = getVideo();
      const detect = getDetect();
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        setGuidance("Preparing camera…");
        setRingColor("white");
        setHasFace(false);
        setCanCapture(false);
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!detect) {
        setGuidance("Loading face tracker…");
        setRingColor("white");
        setHasFace(false);
        setCanCapture(false);
        raf = requestAnimationFrame(tick);
        return;
      }

      const res = detect(video, ts);
      const face = res?.faceLandmarks?.[0];
      const mat = res?.facialTransformationMatrixes?.[0]?.data;
      if (!face) {
        setHasFace(false);
        setFaceFrac(null);
        setGuidance("Center your face in the circle");
        setRingColor("white");
        setCanCapture(false);
        okSinceRef.current = null;
        greenSinceRef.current = null;
        raf = requestAnimationFrame(tick);
        return;
      }
      setHasFace(true);

      // face fraction
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (const p of face) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const frac = (maxX - minX);
      setFaceFrac(frac);

      // distance gating first (so we don’t “capture” when too close/far)
      let distOk = true;
      if (frac < distanceWindow.min) {
        setGuidance("Move forward slightly");  // too far → forward
        setDistanceStatus("far");
        distOk = false;
      } else if (frac > distanceWindow.max) {
        setGuidance("Move back slightly");     // too close → back
        setDistanceStatus("close");
        distOk = false;
      } else {
        setDistanceStatus("ok");
      }

      // pose
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
      setPose({ yaw, pitch, roll });

      // eyes
      let earVal = 1;
      try {
        const li = (i: number) => face[i];
        const eyeTop = li(159), eyeBot = li(145), eyeL = li(33), eyeR = li(133);
        const eyeW = Math.hypot((eyeR.x - eyeL.x) * video.videoWidth, (eyeR.y - eyeL.y) * video.videoHeight);
        const eyeH = Math.hypot((eyeTop.x - eyeBot.x) * video.videoWidth, (eyeTop.y - eyeBot.y) * video.videoHeight);
        earVal = eyeW > 0 ? eyeH / eyeW : 0;
      } catch { /* ignore */ }
      setEar(earVal);

      // “motion” proxy: average movement of a few points across frames (simple, EMA’d upstream)
      // We depend on upstream EMA in auto-cal; in gating we just keep it simple:
      const motionPx = 0; // placeholder (you can wire your own EMA if needed)
      setMotion(motionPx);

      let poseOk = Math.abs(yaw) <= yawMax && Math.abs(pitch) <= pitchMax && Math.abs(roll) <= rollMax;
      let eyesOk = earVal >= earMin;
      let motionOk = true; // if you wire motion here, compare to motionMaxPx720

      const allOk = distOk && poseOk && eyesOk && motionOk;

      // dwell logic for “ready” → “green”
      const now = performance.now();
      if (allOk) {
        if (okSinceRef.current == null) okSinceRef.current = now;
        const okElapsed = now - okSinceRef.current;
        if (okElapsed >= dwellMs) {
          // switch to green, then require a little extra green time before capture can occur
          if (greenSinceRef.current == null) greenSinceRef.current = now;
          const greenElapsed = now - greenSinceRef.current;
          setRingColor("green");
          setGuidance("Hold still… capturing");
          setCanCapture(greenElapsed >= readyGreenMs);
        } else {
          setRingColor("white");
          setGuidance("Hold still…");
          setCanCapture(false);
        }
      } else {
        okSinceRef.current = null;
        greenSinceRef.current = null;
        setRingColor("white");
        // Guidance already set for distance; for pose/eyes override with a clearer hint
        if (distOk === false) {
          // keep the distance message already set
        } else if (!poseOk) {
          setGuidance("Face camera, keep head straight");
        } else if (!eyesOk) {
          setGuidance("Please open your eyes");
        } else {
          setGuidance("Hold still…");
        }
        setCanCapture(false);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [
    getVideo, getDetect, distanceWindow.min, distanceWindow.max,
    yawMax, pitchMax, rollMax, earMin, motionMaxPx720,
    dwellMs, readyGreenMs
  ]);

  return {
    guidance,
    ringColor,
    distanceStatus,
    faceFrac,
    hasFace,
    pose,
    ear,
    motion,
    canCapture,
  };
}
