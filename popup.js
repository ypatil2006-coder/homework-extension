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
  chrome.storage.local.get(["style", "subject", "autoSelect", "quickApproach"], (data) => {
    const savedSubject = data.subject === "logical-reasoning" ? "aptitude-reasoning" : (data.subject || "auto");
    document.getElementById("subjectSelect").value = savedSubject;
    document.getElementById("styleSelect").value = data.style || "detailed";
    document.getElementById("autoSelectCb").checked = !!data.autoSelect;
    const approachEl = document.getElementById("approachSelect");
    if (approachEl) approachEl.value = data.quickApproach || "global";
  });
}

// Auto-save changes immediately when toggles change
function saveQuickSettings() {
  const subject = document.getElementById("subjectSelect").value;
  const style = document.getElementById("styleSelect").value;
  const autoSelect = document.getElementById("autoSelectCb").checked;
  const approachEl = document.getElementById("approachSelect");
  const quickApproach = approachEl ? approachEl.value : "global";
  chrome.storage.local.set({ subject, style, autoSelect, quickApproach, api: "Groq" });
}

document.getElementById("subjectSelect").addEventListener("change", saveQuickSettings);
document.getElementById("approachSelect").addEventListener("change", saveQuickSettings);
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

async function initPopupUpdateBanner() {
  const banner = document.getElementById("updateBanner");
  const verText = document.getElementById("updateVerText");
  const oneClickBtn = document.getElementById("oneClickUpdateBtn");
  const dismissBtn = document.getElementById("dismissUpdateBtn");
  const statusMsg = document.getElementById("popupUpdateStatus");

  if (!banner || !verText || !oneClickBtn || !dismissBtn) return;

  try {
    const data = await chrome.storage.local.get(["hs_update_available", "hs_dismissed_update"]);
    let update = data.hs_update_available;

    // If no cached update flag, run a quick check
    if (!update && typeof checkForExtensionUpdates === "function") {
      const res = await checkForExtensionUpdates().catch(() => null);
      if (res && res.hasUpdate) {
        update = res.release;
      }
    }

    if (update && update.version && update.version !== data.hs_dismissed_update) {
      verText.textContent = `v${update.version}`;
      banner.style.display = "flex";

      oneClickBtn.onclick = async () => {
        oneClickBtn.disabled = true;
        oneClickBtn.innerHTML = "<span>⏳ Saving Backup...</span>";
        try {
          if (typeof exportExtensionSettings === "function") {
            await exportExtensionSettings();
          }
          if (statusMsg) {
            statusMsg.textContent = "✅ Config backed up! Opening download...";
            statusMsg.style.display = "block";
          }
          const downloadUrl = update.zipUrl || update.htmlUrl;
          if (chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: downloadUrl });
          } else {
            window.open(downloadUrl, "_blank");
          }
          setTimeout(() => {
            oneClickBtn.innerHTML = "<span>✅ Backup Saved & Downloaded</span>";
          }, 1000);
        } catch (err) {
          oneClickBtn.disabled = false;
          oneClickBtn.innerHTML = "<span>📦 1-Click Update</span>";
          alert("Backup failed: " + err.message);
        }
      };

      dismissBtn.onclick = () => {
        banner.style.display = "none";
        chrome.storage.local.set({ hs_dismissed_update: update.version }).catch(() => {});
        if (chrome.action && chrome.action.setBadgeText) {
          chrome.action.setBadgeText({ text: "" }).catch(() => {});
        }
      };
    }
  } catch (e) {
    console.warn("[popup] Update check error:", e);
  }
}

initPopupUpdateBanner();

// ── GitHub Star Repo Consent Flow for Popup ──────────
function initPopupStarFlow() {
  const starBtn = document.getElementById("popupStarRepoBtn");
  const modal = document.getElementById("popupStarModal");
  const cancelBtn = document.getElementById("popupCancelStarBtn");
  const confirmBtn = document.getElementById("popupConfirmStarBtn");

  if (!starBtn || !modal) return;

  function refreshStarredStatus() {
    chrome.storage.local.get(["hasStarredRepo"], (data) => {
      if (data.hasStarredRepo) {
        starBtn.innerHTML = "<span>⭐ Starred on GitHub (Thanks!)</span>";
      }
    });
  }

  refreshStarredStatus();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.hasStarredRepo) {
      refreshStarredStatus();
    }
  });

  starBtn.addEventListener("click", () => {
    modal.style.display = "flex";
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      modal.style.display = "none";
      chrome.storage.local.set({ pendingStarIntent: true, starRequestedAt: Date.now() }, () => {
        chrome.tabs.create({ url: "https://github.com/ypatil2006-coder/homework-extension#autostar=1" });
        window.close();
      });
    });
  }
}

initPopupStarFlow();

