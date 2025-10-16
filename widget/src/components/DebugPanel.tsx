import React from "react";

type Props = {
  hasFace: boolean;
  faceFrac: number | null;
  distanceStatus: "far"|"ok"|"close"|"na";
  pose: {yaw:number;pitch:number;roll:number} | null;
  ear: number | null;
  motion: number | null;
  calibHint: string;
};

const DebugPanel: React.FC<Props> = ({ hasFace, faceFrac, distanceStatus, pose, ear, motion, calibHint }) => {
  const pct = (x:number)=>`${(x*100).toFixed(0)}%`;
  return (
    <div style={{ padding:12, border:"1px solid #ddd", borderRadius:10, background:"#fff" }}>
      <div style={{ marginBottom:6, fontWeight:600 }}>Debug</div>
      <div style={{ fontSize:13, color:"#444" }}>
        <div>Face: {hasFace ? "detected" : "—"}{faceFrac!=null && <> · Face {pct(faceFrac)}</>}</div>
        <div>Distance: {distanceStatus.toUpperCase()}</div>
        <div>{pose && <>Yaw {pose.yaw.toFixed(1)}° · Pitch {pose.pitch.toFixed(1)}° · Roll {pose.roll.toFixed(1)}°</>}</div>
        <div>Eye open: {ear!=null ? ear.toFixed(2) : "—"} · Motion(EMA@720p): {motion!=null ? motion.toFixed(1) : "—"}</div>
        <div style={{ opacity:0.8, marginTop:6 }}><em>{calibHint}</em></div>
      </div>
    </div>
  );
};

export default DebugPanel;
