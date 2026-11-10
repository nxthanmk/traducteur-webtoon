const DEFAULTS = { source: "es", target: "fr", enabled: true };

// Langue du webtoon -> code Tesseract (les données sont dans lib/lang/)
const OCR_LANGS = { es: "spa", en: "eng", pt: "por", it: "ita", de: "deu", auto: "spa+eng" };

let creatingOffscreen = null;

// ---------- Raccourci clavier ----------
chrome.commands.onCommand.addListener((command) => {
  if (command === "start-ocr") startSelection();
});

// ---------- Messages ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRANSLATE") {
    translate(message.text, message.source, message.target)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "START_OCR") {
    startSelection().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "OCR_REGION") {
    handleRegion(message, sender.tab)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
});

// ---------- Lancer le mode "tracer une zone" dans l'onglet actif ----------
async function startSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "START_SELECT" });
  } catch {
    // Onglet ouvert avant l'installation de l'extension : on injecte le script.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "START_SELECT" });
    } catch {
      // Page non autorisée (chrome://, boutique d'extensions...) : rien à faire.
    }
  }
}

// ---------- Capture -> OCR -> traduction ----------
async function handleRegion(message, tab) {
  const settings = await chrome.storage.sync.get(DEFAULTS);

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

  await ensureOffscreen();
  const ocr = await chrome.runtime.sendMessage({
    type: "OFFSCREEN_OCR",
    dataUrl,
    rect: message.rect,
    viewport: message.viewport,
    lang: OCR_LANGS[settings.source] || "spa",
  });

  if (!ocr || !ocr.ok) {
    return { ok: false, error: "Lecture impossible : " + ((ocr && ocr.error) || "pas de réponse") };
  }

  const text = cleanOcrText(ocr.text);
  if (!text) {
    return { ok: false, error: "Aucun texte détecté. Essaie de mieux cadrer la bulle." };
  }

  const { translation } = await translate(text, settings.source, settings.target);
  return { ok: true, original: text, translation };
}

function cleanOcrText(raw) {
  return (raw || "")
    .replace(/-\s*\n\s*/g, "") // mot coupé en fin de ligne
    .replace(/\s*\n\s*/g, " ") // retours à la ligne -> espaces
    .replace(/[|_~]+/g, " ") // bruit fréquent
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length > 0) return;

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification: "Exécuter l'OCR (Tesseract) dans un Web Worker",
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

// ---------- Traduction ----------
async function translate(text, source, target) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    `?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}` +
    `&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur réseau (${res.status})`);

  const data = await res.json();
  const translation = (data[0] || []).map((part) => part[0]).join("");
  const detected = data[2] || source;
  return { translation, detected };
}
