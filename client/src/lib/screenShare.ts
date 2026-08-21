/** 원격 화면보기 — 관리자 요청 시에만 JPEG 스틸 이미지를 전송 */

export function buildScreenViewerUrl(token: string): string {
  return `${window.location.origin}/screen/view?token=${token}`;
}

export const SCREEN_PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  },
  debug: 0,
};

const JPEG_MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.72;
const CHUNK_SIZE = 12_000;

function waitUntilUiIdle(idleMs = 450, maxWaitMs = 1800): Promise<void> {
  return new Promise((resolve) => {
    let lastInput = 0;
    const mark = () => {
      lastInput = Date.now();
    };
    const events = ["scroll", "wheel", "touchstart", "touchmove", "pointerdown", "keydown"];
    for (const ev of events) {
      window.addEventListener(ev, mark, { capture: true, passive: true });
    }
    const started = Date.now();
    const tick = () => {
      const idle = lastInput === 0 || Date.now() - lastInput >= idleMs;
      if (idle || Date.now() - started >= maxWaitMs) {
        for (const ev of events) {
          window.removeEventListener(ev, mark, true);
        }
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** 앱이 한가할 때 한 장만 찍어 JPEG data URL로 반환. 평소에는 아무 것도 하지 않음. */
export async function captureAppJpeg(): Promise<string> {
  await waitUntilUiIdle();
  const { default: html2canvas } = await import("html2canvas");
  const vw = Math.max(window.innerWidth, 320);
  const vh = Math.max(window.innerHeight, 240);
  const scale = Math.min(1, JPEG_MAX_WIDTH / vw);
  const shot = await html2canvas(document.body, {
    scale,
    logging: false,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#111111",
    width: vw,
    height: vh,
    windowWidth: vw,
    windowHeight: vh,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
    ignoreElements: (el) => el.tagName === "VIDEO",
  });

  let canvas: HTMLCanvasElement = shot;
  if (shot.width > JPEG_MAX_WIDTH) {
    const resized = document.createElement("canvas");
    const fit = JPEG_MAX_WIDTH / shot.width;
    resized.width = JPEG_MAX_WIDTH;
    resized.height = Math.max(1, Math.round(shot.height * fit));
    const ctx = resized.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(shot, 0, 0, resized.width, resized.height);
      canvas = resized;
    }
  }
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  releaseCanvas(shot);
  if (canvas !== shot) releaseCanvas(canvas);
  return dataUrl;
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  try {
    canvas.width = 1;
    canvas.height = 1;
  } catch {
    // ignore
  }
}

export async function sendScreenshotChunks(
  send: (payload: string) => void,
  dataUrl: string,
  isCancelled?: () => boolean,
): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const total = Math.max(1, Math.ceil(dataUrl.length / CHUNK_SIZE));
  send(JSON.stringify({ type: "screenshot_begin", id, total }));
  for (let index = 0; index < total; index++) {
    if (isCancelled?.()) return;
    const chunk = dataUrl.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    send(JSON.stringify({ type: "screenshot", id, index, total, chunk }));
    if (index + 1 < total) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
