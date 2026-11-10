const DEFAULTS = { source: "es", target: "fr", enabled: true };

const sourceEl = document.getElementById("source");
const targetEl = document.getElementById("target");
const enabledEl = document.getElementById("enabled");
const ocrBtn = document.getElementById("ocr");

chrome.storage.sync.get(DEFAULTS, (s) => {
  sourceEl.value = s.source;
  targetEl.value = s.target;
  enabledEl.checked = s.enabled;
});

sourceEl.addEventListener("change", () => chrome.storage.sync.set({ source: sourceEl.value }));
targetEl.addEventListener("change", () => chrome.storage.sync.set({ target: targetEl.value }));
enabledEl.addEventListener("change", () => chrome.storage.sync.set({ enabled: enabledEl.checked }));

ocrBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_OCR" }, () => window.close());
});
