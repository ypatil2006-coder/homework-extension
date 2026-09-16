const links = {
  Groq:   "https://console.groq.com",
  OpenAI: "https://platform.openai.com/api-keys",
  Claude: "https://console.anthropic.com"
};

// Start Snipping directly from popup
document.getElementById("snipBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "startSnip" }, () => {
        if (chrome.runtime.lastError) {
          // Injection fallback if script wasn't ready
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => { window.dispatchEvent(new CustomEvent("hs-start-snip")); }
          });
        }
      });
      window.close();
    }
  });
});

// Open Chrome Native Keyboard Shortcuts Page
document.getElementById("openShortcutsBtn").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Load saved settings
chrome.storage.local.get(["api", "keys", "style", "models", "subject", "autoSelect"], (data) => {
  const api = data.api || "Groq";
  const keys = data.keys || {};
  const models = data.models || {};

  document.getElementById("apiSelect").value     = api;
  document.getElementById("apiKey").value        = keys[api] || "";
  document.getElementById("modelInput").value    = models[api] || "";
  const savedSubject = data.subject === "logical-reasoning" ? "aptitude-reasoning" : (data.subject || "auto");
  document.getElementById("subjectSelect").value = savedSubject;
  document.getElementById("styleSelect").value    = data.style || "detailed";
  document.getElementById("apiLink").href        = links[api];
  document.getElementById("autoSelectCb").checked = !!data.autoSelect;
});

// Update key & model fields and link when API changes
document.getElementById("apiSelect").addEventListener("change", () => {
  const selected = document.getElementById("apiSelect").value;
  document.getElementById("apiLink").href = links[selected];
  chrome.storage.local.get(["keys", "models"], (data) => {
    document.getElementById("apiKey").value = (data.keys || {})[selected] || "";
    document.getElementById("modelInput").value = (data.models || {})[selected] || "";
  });
});

// Save settings
document.getElementById("saveBtn").addEventListener("click", () => {
  const api     = document.getElementById("apiSelect").value;
  const key     = document.getElementById("apiKey").value.trim();
  const model   = document.getElementById("modelInput").value.trim();
  const subject = document.getElementById("subjectSelect").value;
  const style   = document.getElementById("styleSelect").value;
  const autoSelect = document.getElementById("autoSelectCb").checked;

  chrome.storage.local.get(["keys", "models"], (data) => {
    const keys = data.keys || {};
    const models = data.models || {};
    keys[api] = key;
    models[api] = model;
    chrome.storage.local.set({ api, keys, models, subject, style, autoSelect }, () => {
      document.getElementById("saveBtn").innerText = "✅ Saved!";
      setTimeout(() => document.getElementById("saveBtn").innerText = "💾 Save Settings", 1500);
    });
  });
});

// Export / Copy All Keys & Settings Backup
document.getElementById("exportKeysBtn").addEventListener("click", () => {
  chrome.storage.local.get(["keys", "models", "api", "subject", "style", "autoSelect"], (data) => {
    const backupJson = JSON.stringify(data, null, 2);
    const status = document.getElementById("backupStatus");
    navigator.clipboard.writeText(backupJson).then(() => {
      status.style.color = "#10b981";
      status.innerText = "✅ Backup copied to clipboard!";
      setTimeout(() => status.innerText = "", 3000);
    }).catch(() => {
      prompt("Copy your backup data:", backupJson);
    });
  });
});

// Import / Restore All Keys & Settings
document.getElementById("importKeysBtn").addEventListener("click", () => {
  const pasteData = prompt("Paste your Backup JSON here:");
  if (!pasteData || !pasteData.trim()) return;
  try {
    const parsed = JSON.parse(pasteData.trim());
    if (parsed && typeof parsed === "object") {
      chrome.storage.local.set(parsed, () => {
        const status = document.getElementById("backupStatus");
        status.style.color = "#10b981";
        status.innerText = "✅ Keys & Settings Restored!";
        chrome.storage.local.get(["api", "keys", "style", "models", "subject", "autoSelect"], (data) => {
          const api = data.api || "Groq";
          document.getElementById("apiSelect").value     = api;
          document.getElementById("apiKey").value        = (data.keys || {})[api] || "";
          document.getElementById("modelInput").value    = (data.models || {})[api] || "";
          const savedSubject = data.subject === "logical-reasoning" ? "aptitude-reasoning" : (data.subject || "auto");
          document.getElementById("subjectSelect").value = savedSubject;
          document.getElementById("styleSelect").value    = data.style || "detailed";
          document.getElementById("apiLink").href        = links[api];
          document.getElementById("autoSelectCb").checked = !!data.autoSelect;
        });
        setTimeout(() => status.innerText = "", 3000);
      });
    } else {
      alert("Invalid backup data format.");
    }
  } catch (err) {
    alert("Could not parse JSON. Please ensure the full backup was pasted.");
  }
});

