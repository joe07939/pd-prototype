// Simple userAgent hash + composite key for calibration

async function sha256(text: string): Promise<string> {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, "0")).join("");
  }
  
  export async function uaHash(): Promise<string> {
    const ua = navigator.userAgent || "";
    return sha256(ua);
  }
  
  export function calibStorageKey(deviceId: string, videoHeight: number, ua: string) {
    return `pd-calib:v1:${deviceId}:${videoHeight}:${ua}`;
  }
  