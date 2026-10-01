const DEFAULT_GROQ_KEYS = "";

function updateKeyCountHint() {
  const raw = document.getElementById("apiKey").value.trim();
  const count = raw.split(/[\n,]+/).map(k => k.trim()).filter(Boolean).length;
  const hintEl = document.getElementById("keyCountHint");
  if (hintEl) {
    hintEl.innerText = count > 0 
      ? `(${count} key${count > 1 ? 's' : ''} loaded • Round-robin rotation active)`
      : "(Comma or newline separated)";
  }
}

const DEFAULT_CUSTOM_RETICLE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%2300d4ff' stroke-width='1.5' stroke-dasharray='3 2'/%3E%3Ccircle cx='16' cy='16' r='3' fill='%2300d4ff'/%3E%3Cline x1='16' y1='2' x2='16' y2='9' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='16' y1='23' x2='16' y2='30' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='2' y1='16' x2='9' y2='16' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='23' y1='16' x2='30' y2='16' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 16 16, crosshair`;

function getActiveCursorCss(preset, customUrl) {
  if (preset === "default") return "default";
  if (preset === "custom") {
    if (customUrl && customUrl.trim()) {
      return `url("${customUrl.trim()}"), crosshair`;
    }
    return DEFAULT_CUSTOM_RETICLE;
  }
  return "crosshair";
}

function updateCursorPreview() {
  const preset = document.getElementById("cursorPresetSelect").value;
  const customUrl = document.getElementById("customCursorUrlInput").value.trim();
  const previewBox = document.getElementById("cursorPreviewArea");
  const customField = document.getElementById("customCursorField");

  if (preset === "custom") {
    customField.style.display = "flex";
  } else {
    customField.style.display = "none";
  }

  const cursorCss = getActiveCursorCss(preset, customUrl);
  if (previewBox) {
    previewBox.style.cursor = cursorCss;
  }
}

// Load saved settings from chrome.storage.local
function loadSettings() {
  chrome.storage.local.get(["keys", "models", "style", "subject", "autoSelect", "snipCursor", "customCursorUrl"], (data) => {
    const keys = data.keys || {};
    const models = data.models || {};

    const groqCount = (keys.Groq || "").split(/[\n,]+/).map(k => k.trim()).filter(Boolean).length;
    if (!keys.Groq || groqCount < 7) {
      const existing = (keys.Groq || "").split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
      const defaults = DEFAULT_GROQ_KEYS.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
      keys.Groq = [...new Set([...existing, ...defaults])].join("\n");
      chrome.storage.local.set({ keys, api: "Groq" });
    }

    document.getElementById("apiKey").value = keys.Groq || DEFAULT_GROQ_KEYS;
    document.getElementById("modelInput").value = models.Groq || "";
    const savedSubject = data.subject === "logical-reasoning" ? "aptitude-reasoning" : (data.subject || "auto");
    document.getElementById("subjectSelect").value = savedSubject;
    document.getElementById("styleSelect").value = data.style || "detailed";
    document.getElementById("autoSelectCb").checked = !!data.autoSelect;

    const snipCursor = data.snipCursor || "crosshair";
    document.getElementById("cursorPresetSelect").value = snipCursor;
    document.getElementById("customCursorUrlInput").value = data.customCursorUrl || "";
    updateCursorPreview();

    updateKeyCountHint();
  });
}

document.getElementById("apiKey").addEventListener("input", updateKeyCountHint);
document.getElementById("cursorPresetSelect").addEventListener("change", updateCursorPreview);
document.getElementById("customCursorUrlInput").addEventListener("input", updateCursorPreview);

// Save Settings Handler
function saveSettings(callback) {
  const key = document.getElementById("apiKey").value.trim();
  let model = document.getElementById("modelInput").value.trim();
  if (model && /^qwen[-_/\s]*3\.?6(?:[-_]27b)?$/i.test(model)) {
    model = "qwen/qwen3.8-27b";
    document.getElementById("modelInput").value = model;
  }
  const subject = document.getElementById("subjectSelect").value;
  const style = document.getElementById("styleSelect").value;
  const autoSelect = document.getElementById("autoSelectCb").checked;
  const snipCursor = document.getElementById("cursorPresetSelect").value;
  const customCursorUrl = document.getElementById("customCursorUrlInput").value.trim();

  chrome.storage.local.get(["keys", "models"], (data) => {
    const keys = data.keys || {};
    const models = data.models || {};
    keys.Groq = key;
    models.Groq = model;

    chrome.storage.local.set({
      api: "Groq",
      keys,
      models,
      subject,
      style,
      autoSelect,
      snipCursor,
      customCursorUrl
    }, () => {
      const status = document.getElementById("saveStatus");
      if (status) {
        status.style.color = "#267344";
        status.innerText = "✅ Settings saved successfully!";
        setTimeout(() => { status.innerText = ""; }, 3000);
      }
      updateKeyCountHint();
      if (callback) callback();
    });
  });
}

document.getElementById("saveBtn").addEventListener("click", () => {
  saveSettings();
});

// Reset to Defaults
document.getElementById("resetDefaultsBtn").addEventListener("click", () => {
  if (confirm("Reset all settings and restore the default 7 free Groq keys?")) {
    chrome.storage.local.get(["keys", "models"], (data) => {
      const keys = data.keys || {};
      const models = data.models || {};
      keys.Groq = DEFAULT_GROQ_KEYS;
      delete models.Groq;

      chrome.storage.local.set({
        api: "Groq",
        keys,
        models,
        subject: "auto",
        style: "detailed",
        autoSelect: false,
        snipCursor: "crosshair",
        customCursorUrl: ""
      }, () => {
        loadSettings();
        const status = document.getElementById("saveStatus");
        if (status) {
          status.style.color = "#267344";
          status.innerText = "✅ Defaults restored!";
          setTimeout(() => { status.innerText = ""; }, 3000);
        }
      });
    });
  }
});

// Test Groq API Keys
const testKeysBtn = document.getElementById("testKeysBtn");
if (testKeysBtn) {
  testKeysBtn.addEventListener("click", async () => {
    const rawKeys = document.getElementById("apiKey").value.trim();
    const resultBox = document.getElementById("keyTestResults");
    if (!resultBox) return;

    const keyList = rawKeys.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
    if (!keyList.length) {
      resultBox.style.display = "block";
      resultBox.innerHTML = "<span style='color: #b91c1c;'>⚠️ No keys entered to test.</span>";
      return;
    }

    testKeysBtn.disabled = true;
    testKeysBtn.innerText = "Testing Keys...";
    resultBox.style.display = "block";
    resultBox.innerHTML = "<div style='color: #826a58;'>Pinging Groq API endpoints & testing vision inference...</div>";

    const results = [];

    for (let i = 0; i < keyList.length; i++) {
      const k = keyList[i];
      const shortKey = k.length > 8 ? `...${k.slice(-6)}` : k;
      try {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { "Authorization": `Bearer ${k}` }
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const modelIds = (data?.data || []).map(m => m.id);
          const hasQwen38 = modelIds.includes("qwen/qwen3.8-27b");
          if (hasQwen38) {
            const infRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${k}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "qwen/qwen3.8-27b", messages: [{ role: "user", content: "ping" }], max_tokens: 1 })
            });
            if (infRes.ok) {
              results.push(`<div style="color: #267344; margin-bottom: 4px;">✅ <b>Key #${i+1} (${shortKey})</b>: Active & verified Qwen 3.8 inference!</div>`);
            } else if (infRes.status === 429) {
              results.push(`<div style="color: #b45309; margin-bottom: 4px;">⏳ <b>Key #${i+1} (${shortKey})</b>: Rate limited (429 - Token Quota).</div>`);
            } else {
              const infErr = await infRes.json().catch(() => ({}));
              results.push(`<div style="color: #b45309; margin-bottom: 4px;">⚠️ <b>Key #${i+1} (${shortKey})</b>: ${infErr?.error?.message || `HTTP ${infRes.status}`}.</div>`);
            }
          } else {
            results.push(`<div style="color: #b91c1c; margin-bottom: 4px;">❌ <b>Key #${i+1} (${shortKey})</b>: Valid key, but NO access to Qwen 3.8.</div>`);
          }
        } else if (res.status === 429) {
          results.push(`<div style="color: #b45309; margin-bottom: 4px;">⏳ <b>Key #${i+1} (${shortKey})</b>: Rate limited (429 - out of tokens).</div>`);
        } else if (res.status === 401) {
          results.push(`<div style="color: #b91c1c; margin-bottom: 4px;">❌ <b>Key #${i+1} (${shortKey})</b>: Invalid / Revoked key (401).</div>`);
        } else {
          results.push(`<div style="color: #b91c1c; margin-bottom: 4px;">❌ <b>Key #${i+1} (${shortKey})</b>: HTTP ${res.status}.</div>`);
        }
      } catch (err) {
        results.push(`<div style="color: #b91c1c; margin-bottom: 4px;">❌ <b>Key #${i+1} (${shortKey})</b>: Network error (${err.message}).</div>`);
      }
    }

    resultBox.innerHTML = results.join("");
    testKeysBtn.disabled = false;
    testKeysBtn.innerText = "⚡ Test Keys Now";
  });
}

// Shortcuts link
document.getElementById("openShortcutsBtn").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Export Backup
document.getElementById("exportKeysBtn").addEventListener("click", () => {
  chrome.storage.local.get(["keys", "models", "api", "subject", "style", "autoSelect"], (data) => {
    const backupJson = JSON.stringify(data, null, 2);
    const status = document.getElementById("backupStatus");
    navigator.clipboard.writeText(backupJson).then(() => {
      status.style.color = "#267344";
      status.innerText = "✅ Backup JSON copied to clipboard!";
      setTimeout(() => { status.innerText = ""; }, 3000);
    }).catch(() => {
      prompt("Copy your backup data:", backupJson);
    });
  });
});

// Import Backup
document.getElementById("importKeysBtn").addEventListener("click", () => {
  const pasteData = prompt("Paste your Backup JSON here:");
  if (!pasteData || !pasteData.trim()) return;
  try {
    const parsed = JSON.parse(pasteData.trim());
    if (parsed && typeof parsed === "object") {
      parsed.api = "Groq";
      chrome.storage.local.set(parsed, () => {
        const status = document.getElementById("backupStatus");
        status.style.color = "#267344";
        status.innerText = "✅ Keys & Settings Restored!";
        loadSettings();
        setTimeout(() => { status.innerText = ""; }, 3000);
      });
    } else {
      alert("Invalid backup data format.");
    }
  } catch (err) {
    alert("Could not parse JSON. Please ensure valid JSON was pasted.");
  }
});

loadSettings();
