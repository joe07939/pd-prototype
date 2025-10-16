import React from "react";

type MeasureResponse = {
  ok: boolean;
  distance_pd_mm: number | null;
  near_pd_mm: number | null;
  score: number;
  frames_used: number;
  diagnostics: { blur: number[]; clip_pct: number[] };
  message: string;
};

const ResultsPanel: React.FC<{ result: MeasureResponse | null }> = ({ result }) => {
  return (
    <div style={{ padding:12, border:"1px solid #ddd", borderRadius:10, background:"#fafafa" }}>
      {result ? (
        <>
          <div><strong>Result:</strong> {result.message}</div>
          <div>Score: <strong>{result.score.toFixed(2)}</strong> (frames: {result.frames_used})</div>
          <div>Distance PD: {result.distance_pd_mm ?? "—"} mm · Near PD: {result.near_pd_mm ?? "—"} mm</div>
        </>
      ) : (
        <div>Run a capture to see results here.</div>
      )}
    </div>
  );
};

export default ResultsPanel;
