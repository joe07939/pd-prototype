// src/components/CameraPane.tsx
import React from "react";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement>;
  width: number;
  height: number;
  ring: "white" | "green";
  guidance: string;
  distanceChip: string;
  mirror?: boolean;
  guidanceStyle?: React.CSSProperties;
  chipStyle?: React.CSSProperties;
};

const CameraPane: React.FC<Props> = ({
  videoRef,
  width,
  height,
  ring,
  guidance,
  distanceChip,
  mirror = true,
  guidanceStyle,
  chipStyle,
}) => {
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "#111",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #333",
        // NOTE: no transform on the container — keeps overlays unflipped
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          // Mirror only the video pixels for a selfie-like preview
          transform: mirror ? "scaleX(-1)" : "none",
          transformOrigin: "center",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
        playsInline
        muted
      />

      {/* Overlay ring (symmetric, so mirroring not needed) */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <circle
          cx={width / 2}
          cy={height / 2}
          r={Math.min(width, height) * 0.3 - 2}
          fill="none"
          stroke={ring === "green" ? "rgba(0,170,0,0.95)" : "rgba(255,255,255,0.9)"}
          strokeWidth={3}
        />
      </svg>

      {/* Distance chip (top-right) — stays unflipped */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          padding: "4px 8px",
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          borderRadius: 999,
          fontSize: 12,
          lineHeight: 1,
          ...chipStyle,
        }}
      >
        {distanceChip}
      </div>

      {/* Guidance (top-center) — stays unflipped */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "6px 10px",
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          borderRadius: 8,
          fontSize: 14,
          ...guidanceStyle,
        }}
      >
        {guidance}
      </div>
    </div>
  );
};

export default CameraPane;
