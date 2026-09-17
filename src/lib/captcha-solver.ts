import type { Worker as TesseractWorker } from "tesseract.js";

let workerPromise: Promise<TesseractWorker> | null = null;

function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(async (mod) => {
      const worker = await mod.createWorker("eng", 1, {
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        tessedit_pageseg_mode: "7" as never,
      });
      return worker;
    });
  }
  return workerPromise;
}

/**
 * Preprocess a `data:` URL for better OCR: grayscale → contrast boost → threshold.
 * Returns a new data URL the worker can consume.
 */
function preprocessImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth * 2;
      canvas.height = img.naturalHeight * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = (d[i] ?? 0) * 0.299 + (d[i + 1] ?? 0) * 0.587 + (d[i + 2] ?? 0) * 0.114;
        const boosted = gray > 140 ? 255 : 0;
        d[i] = boosted;
        d[i + 1] = boosted;
        d[i + 2] = boosted;
        d[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load captcha image"));
    img.src = src;
  });
}

export interface SolveResult {
  text: string;
  confidence: number;
}

/**
 * OCR a captcha data-URL. Lazy-loads Tesseract on first call (~2 MB WASM).
 * The image is preprocessed (grayscale → threshold) before recognition.
 */
export async function solveCaptcha(dataUrl: string): Promise<SolveResult> {
  const worker = await getWorker();
  const preprocessed = await preprocessImage(dataUrl);
  const {
    data: { text, confidence },
  } = await worker.recognize(preprocessed);
  return { text: text.replace(/\s+/g, "").trim(), confidence };
}
