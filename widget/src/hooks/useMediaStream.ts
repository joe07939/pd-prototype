import { useEffect, useRef, useState } from "react";

export type MediaState = {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  deviceId: string | null;
  videoWidth: number;
  videoHeight: number;
  ready: boolean;
};

export function useMediaStream(): MediaState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        stream = s;

        const track = s.getVideoTracks()[0];
        const settings = track.getSettings ? track.getSettings() : {};
        setDeviceId((settings.deviceId as string) || "default");

        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          v.setAttribute("playsinline", "");
          v.muted = true;

          const onMeta = () => {
            const w = v.videoWidth || 0;
            const h = v.videoHeight || 0;
            setVideoWidth(w);
            setVideoHeight(h);
            setReady(w > 0 && h > 0);
          };

          try { await v.play(); } catch { /* autoplay may be blocked */ }

          if (v.readyState >= 2) onMeta();
          v.onloadedmetadata = onMeta;
        }
      } catch (e) {
        console.error("getUserMedia error", e);
      }
    })();

    return () => {
      stopped = true;
      const v = videoRef.current;
      if (v) v.onloadedmetadata = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, deviceId, videoWidth, videoHeight, ready };
}
