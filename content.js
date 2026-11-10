(() => {
  if (window.__twLoaded) return;
  window.__twLoaded = true;

  const DEFAULTS = { source: "es", target: "fr", enabled: true };
  let settings = { ...DEFAULTS };
  let bubble = null;

  chrome.storage.sync.get(DEFAULTS, (s) => (settings = { ...DEFAULTS, ...s }));
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
    }
  });

  // ---------- Bulle de résultat ----------
  function removeBubble() {
    if (bubble) {
      bubble.remove();
      bubble = null;
    }
  }

  // rect : { left, top, bottom } en coordonnées de la fenêtre
  function showBubble(rect, html) {
    removeBubble();
    bubble = document.createElement("div");
    bubble.className = "tw-bubble";
    bubble.innerHTML = html;
    document.body.appendChild(bubble);

    let top = rect.bottom + 8;
    // Pas la place en dessous : on met la bulle au-dessus de la zone
    if (top + bubble.offsetHeight > window.innerHeight && rect.top - 8 - bubble.offsetHeight > 0) {
      top = rect.top - 8 - bubble.offsetHeight;
    }

    let left = window.scrollX + rect.left;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - bubble.offsetWidth - 12;
    left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));

    bubble.style.top = `${window.scrollY + top}px`;
    bubble.style.left = `${left}px`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function resultHtml(original, translation) {
    return `<div class="tw-original">${escapeHtml(original)}</div>
            <div class="tw-translation">${escapeHtml(translation)}</div>`;
  }

  // ---------- Mode 1 : texte sélectionné ----------
  document.addEventListener("mouseup", () => {
    if (!settings.enabled) return;

    // petit délai pour que la sélection soit bien finalisée
    setTimeout(() => {
      if (bubble && bubble.matches(":hover")) return;

      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : "";

      if (!text || text.length > 1500) {
        removeBubble();
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      showBubble(rect, `<div class="tw-loading">Traduction…</div>`);

      chrome.runtime.sendMessage(
        { type: "TRANSLATE", text, source: settings.source, target: settings.target },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            showBubble(rect, `<div class="tw-error">Extension rechargée : actualise la page.</div>`);
            return;
          }
          if (!response.ok) {
            showBubble(rect, `<div class="tw-error">${escapeHtml(response.error)}</div>`);
            return;
          }
          showBubble(rect, resultHtml(text, response.translation));
        }
      );
    }, 10);
  });

  // Fermer la bulle en cliquant ailleurs ou avec Échap
  document.addEventListener("mousedown", (e) => {
    if (bubble && !bubble.contains(e.target)) removeBubble();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeBubble();
  });

  // ---------- Mode 2 : tracer une zone (OCR sur l'image) ----------
  function startAreaSelect() {
    removeBubble();
    if (document.querySelector(".tw-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "tw-overlay";
    const box = document.createElement("div");
    box.className = "tw-box";
    const hint = document.createElement("div");
    hint.className = "tw-hint";
    hint.textContent = "Trace un rectangle autour du texte à traduire (Échap pour annuler)";
    overlay.append(box, hint);
    document.documentElement.appendChild(overlay);

    let start = null;

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
      }
    };
    function cleanup() {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
    }
    document.addEventListener("keydown", onKey, true);

    function currentRect(e) {
      return {
        x: Math.min(start.x, e.clientX),
        y: Math.min(start.y, e.clientY),
        w: Math.abs(e.clientX - start.x),
        h: Math.abs(e.clientY - start.y),
      };
    }

    overlay.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      start = { x: e.clientX, y: e.clientY };
      hint.style.display = "none";
      box.style.display = "block";
      Object.assign(box.style, { left: `${start.x}px`, top: `${start.y}px`, width: "0px", height: "0px" });
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!start) return;
      const r = currentRect(e);
      Object.assign(box.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
      });
    });

    overlay.addEventListener("mouseup", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!start) return;

      const r = currentRect(e);
      cleanup();
      if (r.w < 12 || r.h < 12) return;

      // On laisse le temps à la page de se redessiner sans le voile, avant la capture
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 60));

      const anchor = { left: r.x, top: r.y, bottom: r.y + r.h };
      chrome.runtime.sendMessage(
        {
          type: "OCR_REGION",
          rect: r,
          viewport: { w: window.innerWidth, h: window.innerHeight },
        },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            showBubble(anchor, `<div class="tw-error">Extension rechargée : actualise la page.</div>`);
            return;
          }
          if (!response.ok) {
            showBubble(anchor, `<div class="tw-error">${escapeHtml(response.error)}</div>`);
            return;
          }
          showBubble(anchor, resultHtml(response.original, response.translation));
        }
      );
      // La bulle d'attente est placée hors de la zone capturée
      showBubble(anchor, `<div class="tw-loading">Lecture du texte…</div>`);
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "START_SELECT") startAreaSelect();
  });
})();
