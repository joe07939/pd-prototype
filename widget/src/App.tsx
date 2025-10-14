import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [serverTime, setServerTime] = useState<string>("");

  // start webcam
  useEffect(() => {
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // draw a simple oval outline
        const draw = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(0,0,0,0.6)";
          // centered oval taking ~60% width, 70% height
          const cx = canvas.width / 2;
          const cy = canvas.height / 2;
          const rx = canvas.width * 0.30;
          const ry = canvas.height * 0.35;
          ctx.beginPath();
          // draw an ellipse if supported
          if (typeof (ctx as any).ellipse === "function") {
            (ctx as any).ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          } else {
            // fallback: circle
            ctx.arc(cx, cy, Math.min(rx, ry), 0, Math.PI * 2);
          }
          ctx.stroke();
          requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
      } catch (err) {
        console.error("getUserMedia error:", err);
        alert("Camera access failed. Check browser permissions (try Chrome).");
      }
    })();

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const pingServer = async () => {
    try {
      const res = await fetch(`${API_BASE}/healthz`);
      const json = await res.json();
      setStatus(json.ok ? "ok" : "err");
      setServerTime(json.server_time || "");
    } catch (e) {
      setStatus("err");
      setServerTime("");
    }
  };

  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>PD Prototype (Local)</h1>

      <div style={{ position: "relative", width: "100%", maxWidth: 800, aspectRatio: "16/9", background: "#111", borderRadius: 12, overflow: "hidden", border: "1px solid #333" }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted />
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
        <button onClick={pingServer} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", background: "#f8f8f8", cursor: "pointer" }}>
          Ping server
        </button>
        <span>API: <code>{API_BASE}</code></span>
        <span>Status: <strong style={{ color: status === "ok" ? "green" : status === "err" ? "crimson" : "gray" }}>
          {status.toUpperCase()}
        </strong></span>
        {serverTime && <span>Server time: {serverTime}</span>}
      </div>

      <p style={{ marginTop: 10, color: "#666" }}>
        Grant camera permission when prompted. Use Chrome for easiest testing.
      </p>
    </div>
  );
}
