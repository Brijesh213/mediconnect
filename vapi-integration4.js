// vapi-integration.js
// Moves and styles the Vapi SDK button bottom-center inside the calling screen.
// If SDK button is not stylable (shadow/iframe), uses a fallback custom button to trigger Vapi.

(function () {
  // ===== CONFIG =====
  const assistant = "d8050cfe-f36a-4478-96ae-50d5167b8ca4";
  const apiKey = "bea10a6c-40ee-4473-808e-18febd3108fd";
  const sdkUrl = "https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js";
  const sdkButtonSelectorCandidates = [
    ".vapi-call-button",                          // common
    "[class*='vapi'][class*='button']",          // heuristic
    "button[id*='vapi']"                         // heuristic
  ];
  const sdkRunConfig = { color: "#0ea5e9", size: "large" }; // pass-through if the SDK uses it
  const moveTimeoutMs = 6000; // max wait to find SDK button before enabling fallback
  // ===================

  // Expose globally if you need elsewhere
  window.vapiInstance = null;

  const host = document.getElementById("vapi-button");
  const fallbackBtn = document.getElementById("fallback-vapi-btn");

  // ======= Transcript dedupe helpers (small, non-invasive) =======
  // Prevent duplicate message entries when SDK emits both message(type='transcript') and user-speech-end
  const DEDUPE_WINDOW_MS = 1500;
  const recentTranscripts = new Map();
  function transcriptKey(role, text) {
    if (!text) return null;
    return (role + '|' + text.trim().replace(/\s+/g, ' ')).slice(0, 1200);
  }
  function isDuplicate(role, text) {
    const key = transcriptKey(role, text);
    if (!key) return false;
    const now = Date.now();
    const prev = recentTranscripts.get(key);
    if (prev && now - prev < DEDUPE_WINDOW_MS) return true;
    recentTranscripts.set(key, now);
    // cleanup occasionally
    if (recentTranscripts.size > 400) {
      const cutoff = now - DEDUPE_WINDOW_MS * 4;
      for (const [k, t] of recentTranscripts.entries()) {
        if (t < cutoff) recentTranscripts.delete(k);
      }
    }
    return false;
  }
  // =============================================================

  // Inline styling to override SDK inline styles reliably
  function applyInlineStyleToSdkButton(el) {
    if (!el) return;
    try {
      // position and box model
      el.style.position = "relative";
      el.style.inset = "unset";
      el.style.left = "unset";
      el.style.right = "unset";
      el.style.top = "unset";
      el.style.bottom = "unset";
      el.style.width = "auto";
      el.style.height = "56px";
      el.style.padding = "10px 20px";
      el.style.borderRadius = "14px";
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.gap = "10px";
      el.style.whiteSpace = "nowrap";
      el.style.cursor = "pointer";
      el.style.zIndex = "1";
      // glass look
      el.style.background = "linear-gradient(135deg, rgba(247, 3, 3, 1), rgba(255, 0, 0, 1))";
      el.style.border = "1px solid rgba(255, 0, 0, 1)";
      el.style.color = "#ffffffff";
      el.style.fontWeight = "700";
      el.style.fontSize = "15px";
      el.style.boxShadow = "0 12px 30px rgba(2,6,23,0.20)";
      el.style.backdropFilter = "blur(8px) saturate(120%)";
      el.style.webkitBackdropFilter = "blur(8px) saturate(120%)";
      el.style.transition = "transform .18s ease, box-shadow .18s ease";

      // hover effect (basic JS hover handler because we’re using inline styles)
      el.addEventListener("mouseenter", () => {
        el.style.transform = "translateY(-4px)";
        el.style.boxShadow = "0 20px 40px rgba(2,6,23,0.28)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "0 12px 30px rgba(2,6,23,0.20)";
      });

      // responsive tweaks via resize listener
      const applyResponsive = () => {
        const w = window.innerWidth || document.documentElement.clientWidth;
        if (w <= 420) {
          el.style.height = "46px";
          el.style.padding = "6px 12px";
          el.style.borderRadius = "12px";
          el.style.fontSize = "13px";
        } else if (w <= 760) {
          el.style.height = "50px";
          el.style.padding = "8px 14px";
          el.style.borderRadius = "12px";
          el.style.fontSize = "13px";
        } else {
          el.style.height = "56px";
          el.style.padding = "10px 20px";
          el.style.borderRadius = "14px";
          el.style.fontSize = "15px";
        }
      };
      applyResponsive();
      window.addEventListener("resize", applyResponsive);
    } catch (_) {
      // ignore
    }
  }

  // Move SDK button into our host
  function moveSdkButton(el) {
    if (!el || !host) return;
    if (el.parentElement !== host) host.appendChild(el);
    applyInlineStyleToSdkButton(el);
    // mark page so fallback hides
    document.documentElement.classList.add("has-sdk");
  }

  // Find the SDK button in normal DOM
  function findSdkButtonInDocument() {
    for (const sel of sdkButtonSelectorCandidates) {
      const found = document.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  // DOM watcher to catch late insertion
  function watchForSdkButton() {
    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          // check node
          if (sdkButtonSelectorCandidates.some(sel => n.matches && n.matches(sel))) {
            moveSdkButton(n);
            return;
          }
          // check descendants
          const inner = sdkButtonSelectorCandidates
            .map(sel => n.querySelector && n.querySelector(sel))
            .find(Boolean);
          if (inner) {
            moveSdkButton(inner);
            return;
          }
        }
      }
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    return mo;
  }

  // Load SDK
  function loadVapiSdk() {
    return new Promise((resolve, reject) => {
      if (window.vapiSDK) return resolve();
      if (document.querySelector(`script[src="${sdkUrl}"]`)) {
        let attempts = 0;
        const t = setInterval(() => {
          if (window.vapiSDK) { clearInterval(t); resolve(); }
          else if (++attempts > 40) { clearInterval(t); reject(new Error("Vapi SDK not available")); }
        }, 200);
        return;
      }
      const s = document.createElement("script");
      s.src = sdkUrl;
      s.defer = true;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  // Init SDK
  function initVapi() {
    if (!window.vapiSDK) return;
    try {
      window.vapiInstance = window.vapiSDK.run({
        apiKey,
        assistant,
        config: sdkRunConfig
      });
      wireSdkEvents();
    } catch (e) {
      console.error("Vapi init error:", e);
    }
  }

  // Determine role (user/ai/system) using heuristics
  function determineRoleFromMessage(msg) {
    if (!msg || typeof msg !== 'object') return null;
    // Prefer explicit fields
    if (msg.speaker) {
      const s = String(msg.speaker).toLowerCase();
      if (s.includes('user') || s === 'you' || s.includes('human')) return 'user';
      if (s.includes('assistant') || s.includes('ai') || s.includes('bot')) return 'ai';
      if (s.includes('system')) return 'system';
    }
    if (msg.role) {
      const r = String(msg.role).toLowerCase();
      if (r.includes('user')) return 'user';
      if (r.includes('assistant') || r.includes('ai') || r.includes('agent') || r.includes('bot')) return 'ai';
      if (r.includes('system')) return 'system';
    }
    if (msg.from || msg.source || msg.origin) {
      const f = String(msg.from || msg.source || msg.origin).toLowerCase();
      if (f.includes('user') || f.includes('human')) return 'user';
      if (f.includes('assistant') || f.includes('ai') || f.includes('agent')) return 'ai';
      if (f.includes('system')) return 'system';
    }
    // fallback: if message.type === 'transcript' and no other clues, assume 'ai' (safer)
    return null;
  }

  // Wire events to your existing hooks if present
  function wireSdkEvents() {
    const v = window.vapiInstance;
    if (!v || !v.on) return;

    v.on("call-start", () => { if (window.callStarted) window.callStarted(); });

    v.on("call-end", () => { if (window.callEnded) window.callEnded(); });

    v.on("message", (msg) => {
      if (!msg) return;
      // capture possible transcript text from known fields
      const text = (msg.transcript && String(msg.transcript).trim()) || (msg.text && String(msg.text).trim());
      if (!text) return;

      // Determine role using heuristics
      let role = determineRoleFromMessage(msg);
      // If role couldn't be determined, treat as 'ai' by default (safe)
      if (!role) role = 'ai';

      // dedupe: avoid duplicates if same role+text arrived recently
      if (isDuplicate(role, text)) return;

      if (window.addTranscriptMessage) {
        // Map role to label
        const label = role === 'user' ? 'You' : role === 'ai' ? 'AI Assistant' : 'System';
        try {
          window.addTranscriptMessage(label, text, role);
        } catch (e) {
          console.warn('addTranscriptMessage threw', e);
        }
      }
    });

    v.on("user-speech-end", (utt) => {
      // SDK often sends final user utterance here; ensure it's treated as user and deduped
      if (utt && typeof utt === 'string') {
        const text = utt.trim();
        if (!text) return;
        if (isDuplicate('user', text)) return;
        if (window.addTranscriptMessage) {
          try {
            window.addTranscriptMessage('You', text, 'user');
          } catch (e) {
            console.warn('addTranscriptMessage threw', e);
          }
        }
      }
    });

    v.on("error", (err) => {
      if (window.updateCallStatus) window.updateCallStatus("Error: " + (err?.message || "unknown"), "offline");
    });
  }

  // Fallback: custom button click opens/starts the SDK
  function setupFallback() {
    if (!fallbackBtn) return;
    fallbackBtn.addEventListener("click", () => {
      const v = window.vapiInstance;
      // Prefer explicit methods if exposed
      if (v && typeof v.open === "function") return v.open();
      if (v && typeof v.start === "function") return v.start();
      if (v && typeof v.startCall === "function") return v.startCall();
      // Last resort: try clicking the SDK button if it appears later
      const sdkBtn = findSdkButtonInDocument();
      if (sdkBtn && typeof sdkBtn.click === "function") sdkBtn.click();
    });
  }

  // Boot
  (async function boot() {
    setupFallback();

    try {
      await loadVapiSdk();
      initVapi();

      const observer = watchForSdkButton();

      // Initial attempt to capture and move button
      const first = findSdkButtonInDocument();
      if (first) {
        moveSdkButton(first);
      } else {
        // If not found within timeout, leave fallback visible
        setTimeout(() => {
          if (!document.documentElement.classList.contains("has-sdk")) {
            // Still no SDK button; fallback remains visible
            // nothing else to do
          }
        }, moveTimeoutMs);
      }
    } catch (e) {
      console.error("Vapi integration failed to load:", e);
      // fallback stays visible
    }
  })();

})();


/* === vapi-button reposition + resize helper ===
   Drop this after the SDK load code (end of vapi-integration.js or before </body>).
   It WILL NOT create a new button. It only finds the existing injected SDK button
   and styles/moves it to the bottom-center inside the calling-screen.
*/
(function () {
  const BUTTON_SELECTORS = [
    '.vapi-call-button',
    'button[class*="vapi"]',
    '[id*="vapi"][role="button"]',
    'button[aria-label*="vapi"]',
    'button[aria-label*="call"]'
  ];

  const HOST_CONTAINER_ID = 'vapi-button'; // your on-page host container
  const CALLING_CARD_CLASS = 'calling-screen'; // container to center within
  const POLL_INTERVAL = 200;
  const MAX_TRIES = 40; // ~8 seconds

  // Desired inline styles (edit sizes here)
  function applyInlineStylesToHostButton(el) {
    try {
      // Position inside host container; host container will be centered absolutely inside calling card
      el.style.position = 'relative';
      el.style.inset = 'unset';
      el.style.left = 'unset';
      el.style.right = 'unset';
      el.style.top = 'unset';
      el.style.bottom = 'unset';

      // Geometry (size)
      el.style.width = '50px';           // set width you want
      el.style.height = '50px';          // set height you want
      el.style.padding = '10px';         // inner padding
      el.style.borderRadius = '50px';   // circular pill
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.boxSizing = 'border-box';
      el.style.whiteSpace = 'nowrap';
      el.style.cursor = 'pointer';

      // Glassmorphism look (adjust colors to match)




      // Hover effects using JS (inline style can't define :hover)


      // responsive adjustments
      const adjustForWidth = () => {
        const w = window.innerWidth || document.documentElement.clientWidth;
        if (w <= 420) {
          el.style.width = '50px';
          el.style.height = '50px';
        } else if (w <= 760) {
          el.style.width = '50px';
          el.style.height = '50px';
        } else {
          el.style.width = '50px';
          el.style.height = '50px';
        }
      };
      adjustForWidth();
      window.addEventListener('resize', adjustForWidth);
    } catch (err) {
      console.warn('Failed to apply inline styles to vapi button', err);
    }
  }

  // Put the SDK button inside our host container if present
  function moveButtonIntoHost(btn) {
    try {
      const host = document.getElementById(HOST_CONTAINER_ID);
      if (host && btn && btn.parentElement !== host) {
        host.appendChild(btn);
      }
      // Ensure the parent container (.vapi-button-container) is centered inside calling-screen
      const container = document.querySelector('.vapi-button-container') || (host && host.parentElement);
      if (container) {
        container.style.position = 'absolute';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.bottom = '18px';
        container.style.zIndex = '1200';
        container.style.pointerEvents = 'none'; // container ignores pointer; host will accept pointer events
        if (host) host.style.pointerEvents = 'auto';
      } else if (host) {
        // ensure host sits bottom-center if no container
        host.style.position = 'absolute';
        host.style.left = '50%';
        host.style.transform = 'translateX(-50%)';
        host.style.bottom = '18px';
        host.style.zIndex = '1200';
      }
    } catch (e) { console.warn('moveButtonIntoHost error', e); }
  }

  // Attempt to inject CSS into a shadow root (if the SDK uses open shadowRoots)
  function tryInjectIntoShadowRoot(hostEl) {
    try {
      if (!hostEl) return false;
      // If element is a shadow host and has shadowRoot
      if (hostEl.shadowRoot) {
        const css = `
          :host { all: initial; } /* avoid resetting if not desired */
        `;
        const s = document.createElement('style');
        s.textContent = css;
        hostEl.shadowRoot.appendChild(s);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  // Find an SDK button candidate
  function findSdkButton() {
    for (const sel of BUTTON_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // general fallback: any button with phone icon
    const possible = Array.from(document.querySelectorAll('button,div')).find(node => {
      if (!(node instanceof HTMLElement)) return false;
      const txt = (node.innerText || '').toLowerCase();
      if (txt.includes('call') || txt.includes('phone') || txt.includes('start')) return true;
      // icon test - check for phone svg or font awesome phone class
      if (node.querySelector && (node.querySelector('.fa-phone, .fa-solid.fa-phone, svg'))) return true;
      return false;
    });
    return possible || null;
  }

  // MutationObserver to detect late injection
  function watchForSdkButton() {
    let tries = 0;
    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          // check candidate nodes & descendants
          for (const sel of BUTTON_SELECTORS) {
            try {
              if (n.matches && n.matches(sel)) {
                handleFoundButton(n);
                return;
              }
            } catch (_) { }
            const inner = n.querySelector && n.querySelector(sel);
            if (inner) {
              handleFoundButton(inner);
              return;
            }
          }
        }
      }
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

    // polling fallback
    const poll = setInterval(() => {
      tries++;
      const btn = findSdkButton();
      if (btn) {
        handleFoundButton(btn);
        clearInterval(poll);
        // keep observer alive (optional)
        return;
      }
      if (tries > MAX_TRIES) clearInterval(poll);
    }, POLL_INTERVAL);
  }

  // Central handler when button found
  function handleFoundButton(btnElement) {
    if (!btnElement) return;
    // If button is inside a cross-origin iframe, we can't style it
    let el = btnElement;
    try {
      // If the found element is inside a shadow root and the actual visible button is inside the shadow,
      // try to apply inline styles to the host element (the element we have).
      if (el.shadowRoot) {
        // attempt to style host
        applyInlineStylesToHostButton(el);
        tryInjectIntoShadowRoot(el);
      } else {
        // apply inline styles to the element directly (most likely works)
        applyInlineStylesToHostButton(el);
      }

      // Move into host container if available
      moveButtonIntoHost(el);
      console.info('Vapi button styled and moved.');
    } catch (err) {
      console.warn('Error styling moving Vapi button', err);
    }
  }

  // Start watching now
  watchForSdkButton();

  // Also run an immediate scan in case it's already present
  setTimeout(() => {
    const btn = findSdkButton();
    if (btn) handleFoundButton(btn);
  }, 100);
})();
