import React from "react";

type Props = {
  apiBase: string;
  status: "idle" | "ok" | "err";
  serverTime: string;
  onPing: () => void;
  onRetake: () => void;
  onTestCapture: () => void;

  yawMaxDeg: number;
  setYawMaxDeg: (v: number) => void;

  pitchMaxDeg: number;
  setPitchMaxDeg: (v: number) => void;

  rollMaxDeg: number;
  setRollMaxDeg: (v: number) => void;

  faceSizeMin: number;
  setFaceSizeMin: (v: number) => void;

  faceSizeMax: number;
  setFaceSizeMax: (v: number) => void;

  earMin: number;
  setEarMin: (v: number) => void;

  motionMaxPx: number;
  setMotionMaxPx: (v: number) => void;

  dwellMs: number;
  setDwellMs: (v: number) => void;

  readyGreenMs: number;
  setReadyGreenMs: (v: number) => void;

  burstFrames: number;
  setBurstFrames: (v: number) => void;

  burstSpacingMs: number;
  setBurstSpacingMs: (v: number) => void;

  cooldownMs: number;
  setCooldownMs: (v: number) => void;

  minIntervalMs: number;
  setMinIntervalMs: (v: number) => void;

  mirror: boolean;
  setMirror: (v: boolean) => void;

  workingDistanceCm: number;
  setWorkingDistanceCm: (v: number) => void;

  onResetDefaults: () => void;
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 90px",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const label: React.CSSProperties = {
  fontSize: 13,
  color: "#333",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 13,
};

const TuningPanel: React.FC<Props> = (p) => {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 12,
        background: "#fafafa",
        width: 320,
        position: "sticky",
        top: 12,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Controls</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={p.onPing}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", background: "#fff" }}
          >
            Ping
          </button>
          <button
            onClick={p.onRetake}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", background: "#eef7ff" }}
          >
            Retake (auto)
          </button>
          <button
            onClick={p.onTestCapture}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", background: "#f0faf0" }}
          >
            Test capture
          </button>
          <button
            onClick={p.onResetDefaults}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", background: "#fff" }}
          >
            Reset
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          API: <code>{p.apiBase}</code> · Status:{" "}
          <strong style={{ color: p.status === "ok" ? "green" : p.status === "err" ? "crimson" : "gray" }}>
            {p.status.toUpperCase()}
          </strong>{" "}
          {p.serverTime && <>· {p.serverTime}</>}
        </div>
      </div>

      <div style={{ fontWeight: 600, margin: "10px 0 6px" }}>Pose & distance</div>
      <div style={row}>
        <span style={label}>Yaw max (°)</span>
        <input
          style={input}
          type="number"
          value={p.yawMaxDeg}
          onChange={(e) => p.setYawMaxDeg(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Pitch max (°)</span>
        <input
          style={input}
          type="number"
          value={p.pitchMaxDeg}
          onChange={(e) => p.setPitchMaxDeg(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Roll max (°)</span>
        <input
          style={input}
          type="number"
          value={p.rollMaxDeg}
          onChange={(e) => p.setRollMaxDeg(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Face min (frac)</span>
        <input
          style={input}
          type="number"
          step="0.01"
          value={p.faceSizeMin}
          onChange={(e) => p.setFaceSizeMin(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Face max (frac)</span>
        <input
          style={input}
          type="number"
          step="0.01"
          value={p.faceSizeMax}
          onChange={(e) => p.setFaceSizeMax(Number(e.target.value))}
        />
      </div>

      <div style={{ fontWeight: 600, margin: "10px 0 6px" }}>Eyes & motion</div>
      <div style={row}>
        <span style={label}>Eye open min (EAR)</span>
        <input
          style={input}
          type="number"
          step="0.01"
          value={p.earMin}
          onChange={(e) => p.setEarMin(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Motion max (px @720p)</span>
        <input
          style={input}
          type="number"
          value={p.motionMaxPx}
          onChange={(e) => p.setMotionMaxPx(Number(e.target.value))}
        />
      </div>

      <div style={{ fontWeight: 600, margin: "10px 0 6px" }}>Gating timings</div>
      <div style={row}>
        <span style={label}>Dwell ms</span>
        <input
          style={input}
          type="number"
          value={p.dwellMs}
          onChange={(e) => p.setDwellMs(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Green ms</span>
        <input
          style={input}
          type="number"
          value={p.readyGreenMs}
          onChange={(e) => p.setReadyGreenMs(Number(e.target.value))}
        />
      </div>

      <div style={{ fontWeight: 600, margin: "10px 0 6px" }}>Capture</div>
      <div style={row}>
        <span style={label}>Burst frames</span>
        <input
          style={input}
          type="number"
          value={p.burstFrames}
          onChange={(e) => p.setBurstFrames(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Burst spacing (ms)</span>
        <input
          style={input}
          type="number"
          value={p.burstSpacingMs}
          onChange={(e) => p.setBurstSpacingMs(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Cooldown (ms)</span>
        <input
          style={input}
          type="number"
          value={p.cooldownMs}
          onChange={(e) => p.setCooldownMs(Number(e.target.value))}
        />
      </div>
      <div style={row}>
        <span style={label}>Min interval (ms)</span>
        <input
          style={input}
          type="number"
          value={p.minIntervalMs}
          onChange={(e) => p.setMinIntervalMs(Number(e.target.value))}
        />
      </div>

      <div style={{ fontWeight: 600, margin: "10px 0 6px" }}>Other</div>
      <div style={row}>
        <span style={label}>Mirror</span>
        <input
          style={{ ...input, width: 20 }}
          type="checkbox"
          checked={p.mirror}
          onChange={(e) => p.setMirror(e.target.checked)}
        />
      </div>
      <div style={row}>
        <span style={label}>Working dist (cm)</span>
        <input
          style={input}
          type="number"
          value={p.workingDistanceCm}
          onChange={(e) => p.setWorkingDistanceCm(Number(e.target.value))}
        />
      </div>
    </div>
  );
};

export default TuningPanel;
