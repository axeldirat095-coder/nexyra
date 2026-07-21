/**
 * Lot 4.1 — Pixel capture bridge.
 * Le composant <WorkspacePreview/> enregistre l'iframe ici. Les tools workspace
 * appellent `capturePixelSnapshot()` qui postMessage à l'iframe et résout
 * lorsque le snapshot revient. Sert de QA visuel automatique pour Elena.
 */

let frame: HTMLIFrameElement | null = null;

export function registerPreviewFrame(el: HTMLIFrameElement | null) {
  frame = el;
}

export type PixelSnapshot = {
  url: string;
  title: string;
  viewport: { w: number; h: number; scrollW: number; scrollH: number; hasOverflowX: boolean };
  style: { background: string; color: string; fontFamily: string };
  counts: Record<string, number>;
  outline: unknown;
  bodyText: string;
  consoleErrors: string[];
  renderedAt: number;
};

export async function capturePixelSnapshot(timeoutMs = 3000): Promise<PixelSnapshot> {
  if (!frame || !frame.contentWindow) {
    throw new Error("Preview iframe non disponible (preview pas encore prête).");
  }
  const id = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const win = frame.contentWindow;
  return await new Promise<PixelSnapshot>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error(`Timeout ${timeoutMs}ms — preview ne répond pas au bridge.`));
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { type?: string; id?: string; ok?: boolean; snapshot?: PixelSnapshot; error?: string };
      if (!d || d.type !== "NEXYRA_PIXEL_RESULT" || d.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      if (d.ok && d.snapshot) resolve(d.snapshot);
      else reject(new Error(d.error || "Capture échouée."));
    }
    window.addEventListener("message", onMsg);
    win.postMessage({ type: "NEXYRA_PIXEL_CAPTURE", id }, "*");
  });
}

export type PixelScreenshot = {
  dataUrl: string; // data:image/jpeg;base64,...
  width: number;
  height: number;
};

/**
 * Lot 4.2 — capture pixel réelle via html2canvas (chargé en CDN dans
 * l'iframe template). Renvoie une JPEG downscalée + un snapshot DOM léger
 * pour que le QA visuel multimodal ait à la fois l'image ET le contexte.
 */
export async function capturePixelScreenshot(
  timeoutMs = 8000,
  maxWidth = 1024,
): Promise<{ screenshot: PixelScreenshot; snapshot: PixelSnapshot }> {
  if (!frame || !frame.contentWindow) {
    throw new Error("Preview iframe non disponible (preview pas encore prête).");
  }
  const id = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const win = frame.contentWindow;
  return await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error(`Timeout ${timeoutMs}ms — screenshot non rendu (html2canvas absent ?).`));
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      const d = ev.data as {
        type?: string;
        id?: string;
        ok?: boolean;
        screenshot?: PixelScreenshot;
        snapshot?: PixelSnapshot;
        error?: string;
      };
      if (!d || d.type !== "NEXYRA_PIXEL_SCREENSHOT_RESULT" || d.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      if (d.ok && d.screenshot && d.snapshot) {
        resolve({ screenshot: d.screenshot, snapshot: d.snapshot });
      } else {
        reject(new Error(d.error || "Screenshot échoué."));
      }
    }
    window.addEventListener("message", onMsg);
    win.postMessage({ type: "NEXYRA_PIXEL_SCREENSHOT", id, maxWidth }, "*");
  });
}
