import React, { useEffect, useMemo, useState } from "react";
import CameraPane from "./components/CameraPane";
import TuningPanel from "./components/TuningPanel";
import ResultsPanel from "./components/ResultsPanel";
import DebugPanel from "./components/DebugPanel";

import { useMediaStream } from "./hooks/useMediaStream";
import { useFaceLandmarker } from "./hooks/useFaceLandmarker";
import { useAutoCalibration } from "./hooks/useAutoCalibration";
import { useFaceGating } from "./hooks/useFaceGating";
import { useBurstCapture } from "./hooks/useBurstCapture";

/// <reference types="vite/client" />

const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

type LMPoint = { x: number; y: number; z?: number };
type DetectResult = {
  faceLandmarks?: Array<Array<LMPoint>>;
  facialTransformationMatrixes?: Array<{ data: Float32Array }>;
} | null | undefined;

type DetectFn = (v: HTMLVideoElement, ts: number) => DetectResult;

type MeasureResponse = {
  ok: boolean;
  distance_pd_mm: number | null;
  near_pd_mm: number | null;
  score: number;
  frames_used: number;
  diagnostics: { blur: number[]; clip_pct: number[] };
  message: string;
};

const DEFAULTS = {
  faceSizeMin: 0.16,
  faceSizeMax: 0.20, // desktop sensible defaults
  yaw: 18,
  pitch: 18,
  roll: 15,
  earMin: 0.08,
  motionMax: 38,
  dwellMs: 700,
  greenMin: 800,
  burstFrames: 5,
  burstSpacing: 120,
  cooldownMs: 1500,
  minIntervalMs: 2200,
  mirror: true,
  workingCm: 40,
};

function computeCaptureWidth(rightCol = 360): number {
  const margin = 32;
  const max = 900;
  const w = Math.max(320, Math.min(max, window.innerWidth - margin - rightCol - margin));
  return Math.round(w);
}

const App: React.FC = () => {
  // Stable capture size for the widget
  const [capWidth, setCapWidth] = useState<number>(() => computeCaptureWidth());
  const capHeight = Math.round((capWidth * 9) / 16);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCapWidth(computeCaptureWidth()));
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Media (camera)
  const media = useMediaStream();

  // Face landmarker
  const lm = useFaceLandmarker();

  // Typed detect wrapper
  const typedDetect: DetectFn | null = useMemo(() => {
    if (lm.ready && lm.landmarker) {
      const inst: any = lm.landmarker;
      return (video: HTMLVideoElement, ts: number): DetectResult =>
        inst.detectForVideo(video, ts) as DetectResult;
    }
    return null;
  }, [lm.ready, lm.landmarker]);

  // Auto-calibration (desktop bias ~18%, mobile ~21%) with final clamps
  const auto = useAutoCalibration({
    getVideo: () => media.videoRef.current,
    detect: typedDetect,
    deviceId: media.deviceId,
    videoHeight: media.videoHeight,
    sampleMs: 2000,
    minSamples: 26,
    poseTolDeg: 20,
    earMin: 0.06,
    motionMaxPx720: 30,
  });

  // Start auto-cal once everything is ready
  useEffect(() => {
    if (media.ready && lm.ready && auto.state === "idle") {
      auto.start();
    }
  }, [media.ready, lm.ready, auto]);

  // Tunables (distance window will be overridden by auto when ready)
  const [yawMaxDeg, setYawMaxDeg] = useState(DEFAULTS.yaw);
  const [pitchMaxDeg, setPitchMaxDeg] = useState(DEFAULTS.pitch);
  const [rollMaxDeg, setRollMaxDeg] = useState(DEFAULTS.roll);
  const [faceSizeMin, setFaceSizeMin] = useState(DEFAULTS.faceSizeMin);
  const [faceSizeMax, setFaceSizeMax] = useState(DEFAULTS.faceSizeMax);
  const [earMin, setEarMin] = useState(DEFAULTS.earMin);
  const [motionMaxPx, setMotionMaxPx] = useState(DEFAULTS.motionMax);
  const [dwellMs, setDwellMs] = useState(DEFAULTS.dwellMs);
  const [readyGreenMs, setReadyGreenMs] = useState(DEFAULTS.greenMin);
  const [burstFrames, setBurstFrames] = useState(DEFAULTS.burstFrames);
  const [burstSpacingMs, setBurstSpacingMs] = useState(DEFAULTS.burstSpacing);
  const [cooldownMs, setCooldownMs] = useState(DEFAULTS.cooldownMs);
  const [minBurstIntervalMs, setMinBurstIntervalMs] = useState(DEFAULTS.minIntervalMs);
  const [mirror, setMirror] = useState(DEFAULTS.mirror);
  const [workingDistanceCm, setWorkingDistanceCm] = useState(DEFAULTS.workingCm);

  // Use auto window if available; otherwise fall back to sliders
  const distanceWindow = useMemo(() => {
    if (auto.window) return { min: auto.window.min, max: auto.window.max };
    return { min: faceSizeMin, max: faceSizeMax };
  }, [auto.window, faceSizeMin, faceSizeMax]);

  // Face gating loop
  const gates = useFaceGating({
    getVideo: () => media.videoRef.current,
    getDetect: () => typedDetect,
    distanceWindow,
    yawMax: yawMaxDeg,
    pitchMax: pitchMaxDeg,
    rollMax: rollMaxDeg,
    earMin,
    motionMaxPx720: motionMaxPx,
    dwellMs,
    readyGreenMs,
  });

  // Server capture + auto enable switch (PREVENT re-capture after success)
  const { captureBurst } = useBurstCapture(API_BASE, mirror, workingDistanceCm);
  const [capturing, setCapturing] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(true); // NEW: gate auto capture
  const [lastBurstAt, setLastBurstAt] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [measureResult, setMeasureResult] = useState<MeasureResponse | null>(null);

  // Auto capture when allowed AND autoEnabled === true
  useEffect(() => {
    if (!autoEnabled || !gates.canCapture || capturing) return;
    const now = Date.now();
    if (now < cooldownUntil) return;
    if (now - lastBurstAt < minBurstIntervalMs) return;

    (async () => {
      const v = media.videoRef.current;
      if (!v) return;
      setCapturing(true);
      setMeasureResult(null);
      try {
        const res = await captureBurst(v, burstFrames, burstSpacingMs);
        setMeasureResult(res);
        // IMPORTANT: stop auto after one success
        setAutoEnabled(false);
      } catch (e) {
        console.warn("measure error", e);
      } finally {
        setCapturing(false);
        const t = Date.now();
        setLastBurstAt(t);
        setCooldownUntil(t + cooldownMs);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gates.canCapture, autoEnabled]);

  // Ping
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [serverTime, setServerTime] = useState("");
  const onPing = async () => {
    try {
      const r = await fetch(`${API_BASE}/healthz`);
      const j = await r.json();
      setStatus(j.ok ? "ok" : "err");
      setServerTime(j.server_time ?? "");
    } catch {
      setStatus("err");
      setServerTime("");
    }
  };

  // Retake/manual
  const onRetake = () => {
    setMeasureResult(null);
    setLastBurstAt(0);
    setCooldownUntil(0);
    setAutoEnabled(true); // re-arm auto capture
  };

  const onTestCapture = async () => {
    if (capturing) return;
    const v = media.videoRef.current;
    if (!v) return;
    setCapturing(true);
    try {
      const res = await captureBurst(v, burstFrames, burstSpacingMs);
      setMeasureResult(res);
      // Do NOT flip autoEnabled here; this button is manual testing.
    } finally {
      setCapturing(false);
      const t = Date.now();
      setLastBurstAt(t);
      setCooldownUntil(t + cooldownMs);
    }
  };

  // Distance chip text
  const ring = gates.ringColor === "green" ? "green" : "white";
  const chip = `Distance: ${
    gates.distanceStatus === "ok"
      ? "OK"
      : gates.distanceStatus === "far"
      ? "Too far"
      : gates.distanceStatus === "close"
      ? "Too close"
      : "—"
  }${gates.faceFrac != null ? ` · ${(gates.faceFrac * 100).toFixed(0)}%` : ""}`;

  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui", padding: 16 }}>
      {/* PAGE GRID: left (widget + results/debug), right (tuning) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN = widget, then results/debug UNDER it in same column */}
        <div>
          {/* Widget (centered in left column) */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CameraPane
              videoRef={media.videoRef as unknown as React.RefObject<HTMLVideoElement>}
              width={capWidth}
              height={capHeight}
              ring={ring}
              guidance={
                auto.state !== "ready"
                  ? (auto.hint || "Preparing…")
                  : (measureResult
                      ? "Result ready. Click Retake to measure again."
                      : gates.guidance)
              }
              distanceChip={chip}
              mirror={DEFAULTS.mirror}
              guidanceStyle={{ fontSize: 16 }}
              chipStyle={{ fontSize: 13, padding: "5px 10px" }}
            />
          </div>

          {/* UNDER WIDGET: two columns (Results | Debug) — SAME LEFT COLUMN */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginTop: 16,
              maxWidth: capWidth,
              marginInline: "auto",
            }}
          >
            <ResultsPanel result={measureResult} />
            <DebugPanel
              hasFace={gates.hasFace}
              faceFrac={gates.faceFrac}
              distanceStatus={gates.distanceStatus}
              pose={gates.pose}
              ear={gates.ear}
              motion={gates.motion}
              calibHint={auto.hint}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: tuning */}
        <TuningPanel
          apiBase={API_BASE}
          status={status}
          serverTime={serverTime}
          onPing={onPing}
          onRetake={onRetake}
          onTestCapture={onTestCapture}
          yawMaxDeg={yawMaxDeg}
          setYawMaxDeg={setYawMaxDeg}
          pitchMaxDeg={pitchMaxDeg}
          setPitchMaxDeg={setPitchMaxDeg}
          rollMaxDeg={rollMaxDeg}
          setRollMaxDeg={setRollMaxDeg}
          faceSizeMin={faceSizeMin}
          setFaceSizeMin={setFaceSizeMin}
          faceSizeMax={faceSizeMax}
          setFaceSizeMax={setFaceSizeMax}
          earMin={earMin}
          setEarMin={setEarMin}
          motionMaxPx={motionMaxPx}
          setMotionMaxPx={setMotionMaxPx}
          dwellMs={dwellMs}
          setDwellMs={setDwellMs}
          readyGreenMs={readyGreenMs}
          setReadyGreenMs={setReadyGreenMs}
          burstFrames={burstFrames}
          setBurstFrames={setBurstFrames}
          burstSpacingMs={burstSpacingMs}
          setBurstSpacingMs={setBurstSpacingMs}
          cooldownMs={cooldownMs}
          setCooldownMs={setCooldownMs}
          minIntervalMs={minBurstIntervalMs}
          setMinIntervalMs={setMinBurstIntervalMs}
          mirror={mirror}
          setMirror={setMirror}
          workingDistanceCm={workingDistanceCm}
          setWorkingDistanceCm={setWorkingDistanceCm}
          onResetDefaults={() => {
            setYawMaxDeg(DEFAULTS.yaw);
            setPitchMaxDeg(DEFAULTS.pitch);
            setRollMaxDeg(DEFAULTS.roll);
            setFaceSizeMin(DEFAULTS.faceSizeMin);
            setFaceSizeMax(DEFAULTS.faceSizeMax);
            setEarMin(DEFAULTS.earMin);
            setMotionMaxPx(DEFAULTS.motionMax);
            setDwellMs(DEFAULTS.dwellMs);
            setReadyGreenMs(DEFAULTS.greenMin);
            setBurstFrames(DEFAULTS.burstFrames);
            setBurstSpacingMs(DEFAULTS.burstSpacing);
            setCooldownMs(DEFAULTS.cooldownMs);
            setMinBurstIntervalMs(DEFAULTS.minIntervalMs);
            setMirror(DEFAULTS.mirror);
            setWorkingDistanceCm(DEFAULTS.workingCm);
          }}
        />
      </div>
    </div>
  );
};

export default App;
