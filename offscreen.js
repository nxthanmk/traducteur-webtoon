// Document hors-écran : fait tourner Tesseract (OCR) localement, sans rien envoyer en ligne.

let worker = null;
let workerLang = null;
let queue = Promise.resolve();

async function getWorker(lang) {
  if (worker && workerLang === lang) return worker;

  if (worker) {
    await worker.terminate();
    worker = null;
  }

  worker = await Tesseract.createWorker(lang.split("+"), 1, {
    workerPath: chrome.runtime.getURL("lib/worker.min.js"),
    corePath: chrome.runtime.getURL("lib"),
    langPath: chrome.runtime.getURL("lib/lang"),
    workerBlobURL: false,
    cacheMethod: "none",
  });

  // 6 = "un seul bloc de texte uniforme" : idéal pour une bulle de dialogue
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  });

  workerLang = lang;
  return worker;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Capture illisible"));
    img.src = src;
  });
}

// Découpe la zone, l'agrandit, passe en niveaux de gris et met le texte en sombre sur fond clair.
async function prepareImage(dataUrl, rect, viewport) {
  const img = await loadImage(dataUrl);

  // La capture est en pixels réels : on convertit les coordonnées de la page.
  const sx = img.width / viewport.w;
  const sy = img.height / viewport.h;

  const cx = Math.max(0, Math.round(rect.x * sx));
  const cy = Math.max(0, Math.round(rect.y * sy));
  const cw = Math.min(img.width - cx, Math.round(rect.w * sx));
  const ch = Math.min(img.height - cy, Math.round(rect.h * sy));
  if (cw < 5 || ch < 5) throw new Error("Zone trop petite");

  // Tesseract lit mieux quand les lettres sont grandes : on agrandit (x3 max).
  const scale = Math.min(3, Math.max(1, 3000 / Math.max(cw, ch)));
  const w = Math.round(cw * scale);
  const h = Math.round(ch * scale);

  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  const cctx = crop.getContext("2d", { willReadFrequently: true });
  cctx.imageSmoothingEnabled = true;
  cctx.imageSmoothingQuality = "high";
  cctx.drawImage(img, cx, cy, cw, ch, 0, 0, w, h);

  const imageData = cctx.getImageData(0, 0, w, h);
  const px = imageData.data;

  // Niveaux de gris + luminosité moyenne
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = g;
    sum += g;
  }
  const mean = sum / (px.length / 4);

  // Fond sombre (texte clair) -> on inverse
  if (mean < 110) {
    for (let i = 0; i < px.length; i += 4) {
      px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
    }
  }
  cctx.putImageData(imageData, 0, 0);

  // Marge blanche autour du texte (Tesseract aime avoir de l'air)
  const pad = 24;
  const out = document.createElement("canvas");
  out.width = w + pad * 2;
  out.height = h + pad * 2;
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(crop, pad, pad);

  return out;
}

// Reconstruit le texte ligne par ligne en écartant les "mots" très peu fiables
// (bords de bulle, traits du dessin... que l'OCR prend pour des lettres).
function extractText(data) {
  const words = [];
  if (!data.blocks) return { text: data.text || "", words };

  const lines = [];
  for (const block of data.blocks) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const kept = [];
        for (const word of line.words || []) {
          const t = (word.text || "").trim();
          if (!t) continue;
          words.push({ t, c: Math.round(word.confidence) });
          const tooUnsure = word.confidence < 35 || (t.length <= 2 && word.confidence < MIN_SHORT_WORD_CONFIDENCE);
          if (!tooUnsure) kept.push(t);
        }
        if (kept.length) lines.push(kept.join(" "));
      }
    }
  }
  return { text: lines.join("\n"), words };
}

const MIN_SHORT_WORD_CONFIDENCE = 70;

async function runOcr({ dataUrl, rect, viewport, lang }) {
  const canvas = await prepareImage(dataUrl, rect, viewport);
  const w = await getWorker(lang);
  const result = await w.recognize(canvas, {}, { text: true, blocks: true });
  return extractText(result.data);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "OFFSCREEN_OCR") return;

  // Une seule lecture à la fois
  queue = queue
    .then(() => runOcr(message))
    .then(({ text, words }) => sendResponse({ ok: true, text, words }))
    .catch((err) => sendResponse({ ok: false, error: (err && err.message) || String(err) }));

  return true;
});
