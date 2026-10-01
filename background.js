const DEFAULT_GROQ_KEYS = "";

function initDefaultKeys() {
  chrome.storage.local.get(["keys"], (data) => {
    const keys = data.keys || {};
    if (!keys.Groq && DEFAULT_GROQ_KEYS) {
      keys.Groq = DEFAULT_GROQ_KEYS;
      chrome.storage.local.set({ keys });
    }
  });
}

chrome.runtime.onInstalled.addListener(initDefaultKeys);
chrome.runtime.onStartup.addListener(initDefaultKeys);
initDefaultKeys();

chrome.commands.onCommand.addListener((command) => {
  if (command === "activate-snip") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "startSnip" }, () => {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => { window.dispatchEvent(new CustomEvent("hs-start-snip")); }
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
            });
          }
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "captureScreen") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
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
          body: JSON.stringify({ ...body, stream: true })
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";

          for (const line of lines) {
            const p = line.trim();
            if (!p.startsWith("data:")) continue;
            const d = p.slice(5).trim();
            if (d === "[DONE]") continue;

            try {
              const j = JSON.parse(d);
              const choice = j.choices?.[0];
              delta = choice?.delta?.content || "";
              if (!delta && (choice?.delta?.reasoning || choice?.delta?.reasoning_content)) {
                delta = choice?.delta?.reasoning || choice?.delta?.reasoning_content;
              }
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
