importScripts("updater.js");
try {
  importScripts("keys.local.js");
} catch (e) {}

const DEFAULT_GROQ_KEYS = typeof LOCAL_GROQ_KEYS !== "undefined" ? LOCAL_GROQ_KEYS : "";

function initDefaultKeys() {
  chrome.storage.local.get(["keys", "configVersion"], (data) => {
    const keys = data.keys || {};
    const defaultList = DEFAULT_GROQ_KEYS.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
    if (!keys.Groq && defaultList.length) {
      keys.Groq = DEFAULT_GROQ_KEYS;
      chrome.storage.local.set({ keys, configVersion: 2 });
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  initDefaultKeys();
  if (details && details.reason === "update") {
    // Clear update badge on successful upgrade
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: "" });
    }
    // Flag to show v1.6.2 notification toast on next active page
    chrome.storage.local.set({ hs_just_updated: "1.6.2", hs_rate_limited_keys: {} });
  }
  // Check for updates on extension installation or refresh
  checkForExtensionUpdates().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  initDefaultKeys();
  checkForExtensionUpdates().catch(() => {});
});

initDefaultKeys();

let keyIndexQueue = Promise.resolve();
function reserveGroqKeyIndex(total) {
  if (!Number.isInteger(total) || total < 1) {
    return Promise.reject(new Error("Invalid Groq key count"));
  }
  const result = keyIndexQueue.then(async () => {
    const stored = await chrome.storage.local.get(["providerKeyIndices"]);
    const indices = stored.providerKeyIndices || {};
    const index = (indices.Groq || 0) % total;
    indices.Groq = (index + 1) % total;
    await chrome.storage.local.set({ providerKeyIndices: indices });
    return index;
  });
  keyIndexQueue = result.catch(() => {});
  return result;
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-snip") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tabId = tabs[0].id;
        chrome.tabs.sendMessage(tabId, { action: "startSnip" }, () => {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript({
              target: { tabId },
              files: ["themes.js", "content.js"]
            }, () => {
              if (!chrome.runtime.lastError) {
                chrome.tabs.sendMessage(tabId, { action: "startSnip" }, () => {
                  if (chrome.runtime.lastError) {
                    chrome.scripting.executeScript({
                      target: { tabId },
                      func: () => { window.dispatchEvent(new CustomEvent("hs-start-snip")); }
                    }).catch(() => {});
                  }
                });
              }
            });
          }
        });
      }
    });
  } else if (command === "close-overlay") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "closeOverlayAndDot" }, () => {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => { window.dispatchEvent(new CustomEvent("hs-close-overlay-and-dot")); }
            }).catch(() => {});
          }
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "reserveGroqKeyIndex") {
    reserveGroqKeyIndex(msg.total)
      .then(index => sendResponse({ index }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  if (msg.action === "captureScreen") {
    const winId = (sender && sender.tab && sender.tab.windowId) ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(winId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ dataUrl: null });
        return;
      }
      sendResponse({ dataUrl });
    });
    return true;
  }
  if (msg.action === "checkForUpdates") {
    checkForExtensionUpdates({ force: !!msg.force })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.action === "clearUpdateBadge") {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: "" });
    }
    chrome.storage.local.set({ hs_dismissed_update: msg.version }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
});

// ── Stream AI calls through the Service Worker ─────
// Content scripts inherit the page's CORS/CSP, so a fetch() there is killed on
// restrictive sites. The service worker runs isolated and bypasses that, so
// content.js opens a "stream_api" port and we do the fetch + streaming here,
// pushing (ttft, delta, done, error) chunks back over the port.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream_api") return;

  let ctrl = null;
  let disconnected = false;

  port.onDisconnect.addListener(() => {
    disconnected = true;
    if (ctrl) ctrl.abort(); // page closed / navigated away mid-stream
  });

  const send = (msg) => {
    if (disconnected) return;
    try { port.postMessage(msg); } catch (e) {}
  };

  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "start") return;
    const { provider, url, headers, body, deadlineMs } = msg;

    ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), deadlineMs);
    const t0 = performance.now();

    (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          signal: ctrl.signal,
          body: JSON.stringify({ temperature: 0, ...body, stream: true })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const apiMsg = errJson?.error?.message || "";
          // Include the status code so 401 (bad key), 403 (blocked region/network),
          // and 429 (rate limit) are distinguishable in the overlay.
          send({ type: "error", error: `HTTP ${res.status}${apiMsg ? ` — ${apiMsg}` : ""}` });
          return;
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let text = "";
        let ttft = 0;
        let finishReason = "";

        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";

          for (const line of lines) {
            const p = line.trim();
            if (!p.startsWith("data:")) continue;
            const d = p.slice(5).trim();
            if (d === "[DONE]") {
              streamDone = true;
              break;
            }

            try {
              const j = JSON.parse(d);
              const choice = j.choices?.[0];
              const delta = choice?.delta?.content || choice?.delta?.reasoning || choice?.delta?.reasoning_content || "";
              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
              }

              if (delta) {
                if (!ttft) {
                  ttft = performance.now() - t0;
                  clearTimeout(timer);
                  timer = setTimeout(() => ctrl.abort(), 180000); // 180s hard deadline after first token
                }
                text += delta;
                send({ type: "delta", text });
              }
            } catch (e) {}
          }
        }

        if (text.length === 0) {
          // Stream produced no tokens — typical when a network filter or proxy
          // returns a 200 block page, or the model name is wrong. Surface it as
          // a real error instead of a silent empty answer box.
          send({ type: "error", error: "API returned an empty response (network filter or bad model?)" });
          return;
        }

        send({
          type: "done",
          ok: true,
          text,
          ttft,
          truncated: finishReason === "length" || finishReason === "max_tokens",
          total: performance.now() - t0
        });
      } catch (e) {
        send({ type: "error", error: e.name === "AbortError" ? "Timeout" : e.message });
      } finally {
        clearTimeout(timer);
      }
    })();
  });
});
