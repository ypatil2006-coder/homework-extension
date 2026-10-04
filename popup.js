const DEFAULT_GROQ_KEYS = "";

// Ensure default Groq keys exist in storage
function initDefaults() {
  chrome.storage.local.get(["keys", "api"], (data) => {
    const keys = data.keys || {};
    if (!keys.Groq && DEFAULT_GROQ_KEYS) {
      keys.Groq = DEFAULT_GROQ_KEYS;
      chrome.storage.local.set({ keys, api: "Groq" });
    }
  });
}

// Load and restore quick toggles
function loadSettings() {
  chrome.storage.local.get(["style", "subject", "autoSelect"], (data) => {
    const savedSubject = data.subject === "logical-reasoning" ? "aptitude-reasoning" : (data.subject || "auto");
    document.getElementById("subjectSelect").value = savedSubject;
    document.getElementById("styleSelect").value = data.style || "detailed";
    document.getElementById("autoSelectCb").checked = !!data.autoSelect;
  });
}

// Auto-save changes immediately when toggles change
function saveQuickSettings() {
  const subject = document.getElementById("subjectSelect").value;
  const style = document.getElementById("styleSelect").value;
  const autoSelect = document.getElementById("autoSelectCb").checked;
  chrome.storage.local.set({ subject, style, autoSelect, api: "Groq" });
}

document.getElementById("subjectSelect").addEventListener("change", saveQuickSettings);
document.getElementById("styleSelect").addEventListener("change", saveQuickSettings);
document.getElementById("autoSelectCb").addEventListener("change", saveQuickSettings);

// Start Snipping directly from popup
document.getElementById("snipBtn").addEventListener("click", () => {
  saveQuickSettings();
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
      window.close();
    }
  });
});

// Launch More Settings Tab
document.getElementById("openSettingsBtn").addEventListener("click", () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    chrome.tabs.create({ url: "options.html" });
  }
  window.close();
});

function applyActivePopupTheme(data) {
  const mode = data.tabThemeMode || (data.themeScope === "inpage-only" ? "default" : data.themeMode) || "default";
  const custom = data.tabCustomTheme || data.customTheme || "catppuccin-mocha";
  const badge = document.getElementById("popupThemeBadge");

  if (mode === "customized" && typeof HS_THEMES !== "undefined") {
    const theme = HS_THEMES[custom] || HS_THEMES["catppuccin-mocha"];
    if (typeof HS_applyThemeVariables === "function" && theme) {
      HS_applyThemeVariables(document.documentElement, theme);
    }
    if (badge && theme) {
      badge.innerText = `${theme.name.split(" ")[0]} ⚡`;
    }
  } else if (typeof HS_THEMES !== "undefined") {
    if (typeof HS_applyThemeVariables === "function") {
      HS_applyThemeVariables(document.documentElement, HS_THEMES["default"]);
    }
    if (badge) {
      badge.innerText = "Groq ⚡";
    }
  }
}

function loadTheme() {
  chrome.storage.local.get(["tabThemeMode", "tabCustomTheme", "themeMode", "customTheme", "themeScope"], (data) => {
    applyActivePopupTheme(data || {});
  });
}

chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === "local") {
    chrome.storage.local.get(["tabThemeMode", "tabCustomTheme", "themeMode", "customTheme", "themeScope"], (data) => {
      applyActivePopupTheme(data || {});
    });
  }
});

initDefaults();
loadSettings();
loadTheme();
