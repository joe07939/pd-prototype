type MeasureResponse = {
    ok: boolean;
    distance_pd_mm: number | null;
    near_pd_mm: number | null;
    score: number;
    frames_used: number;
    diagnostics: { blur: number[]; clip_pct: number[] };
    message: string;
  };
  
  export function useBurstCapture(apiBase: string, mirror: boolean, workingDistanceCm: number) {
    const captureBlob = async (video: HTMLVideoElement): Promise<Blob | null> => {
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
      const off = document.createElement("canvas");
      off.width = video.videoWidth;
      off.height = video.videoHeight;
      const ctx = off.getContext("2d");
      if (!ctx) return null;
      if (mirror) { ctx.translate(off.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, off.width, off.height);
      return await new Promise<Blob | null>((resolve) =>
        off.toBlob((b) => resolve(b), "image/jpeg", 0.9)
      );
    };
  
    const captureBurst = async (video: HTMLVideoElement, n: number, spacingMs: number): Promise<MeasureResponse> => {
      const blobs: Blob[] = [];
      for (let i = 0; i < n; i++) {
        const b = await captureBlob(video);
        if (b) blobs.push(b);
        if (i < n - 1) await new Promise(r => setTimeout(r, spacingMs));
      }
  
      const form = new FormData();
      form.append("working_distance_cm", String(workingDistanceCm));
      blobs.forEach((b, i) => form.append("frames", b, `burst_${i}.jpg`));
  
      const res = await fetch(`${apiBase}/v1/measurements/measure`, { method: "POST", body: form });
      return await res.json();
    };
  
    return { captureBurst };
  }
  