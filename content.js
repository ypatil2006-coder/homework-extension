window.addEventListener("hs-start-snip", () => startSnipping());
window.addEventListener("hs-close-overlay-and-dot", () => toggleOverlayAndDot());

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "startSnip") {
      startSnipping();
    } else if (msg.action === "closeOverlayAndDot") {
      toggleOverlayAndDot();
    }
  });
}

// In-page fallback keyboard handler for Alt+D (Minimize/Toggle Floating Dot)
window.addEventListener("keydown", (e) => {
  if (e.altKey && (e.key === "d" || e.key === "D")) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea") return;
    e.preventDefault();
    toggleOverlayAndDot();
  }
});

let isSnipping = false;
let startX, startY, selectionBox;
let screenshotDataUrl = null;
let capturePromise = null;
let lastCroppedBase64 = (typeof sessionStorage !== "undefined") ? sessionStorage.getItem("hs_last_crop") : null;
let savedOverlayPos = null;
let savedDotPos = null;
let currentDotMode = false;
let currentDotSize = 11;
let currentDotOpacity = 50;
let currentDotExpanded = false;
let pendingAnswerPayload = null;
let lastAnswerPayload = null;
let answerHistory = [];
let isDotHidden = false;
let lastLoadingStatus = "Solving question...";

let currentSnipCursor = "crosshair";
let currentCustomCursorUrl = "";

const CUSTOM_RETICLE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%2300d4ff' stroke-width='1.5' stroke-dasharray='3 2'/%3E%3Ccircle cx='16' cy='16' r='3' fill='%2300d4ff'/%3E%3Cline x1='16' y1='2' x2='16' y2='9' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='16' y1='23' x2='16' y2='30' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='2' y1='16' x2='9' y2='16' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='23' y1='16' x2='30' y2='16' stroke='%2300d4ff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 16 16, crosshair`;

function getSnipCursorCss() {
  if (currentSnipCursor === "default") return "default";
  if (currentSnipCursor === "custom") {
    if (currentCustomCursorUrl && currentCustomCursorUrl.trim()) {
      return `url("${currentCustomCursorUrl.trim()}"), crosshair`;
    }
    return CUSTOM_RETICLE_CURSOR;
  }
  return "crosshair";
}

let currentSnipThemeMode = "default";
let currentSnipCustomTheme = "catppuccin-mocha";
let currentAnswerThemeMode = "default";
let currentAnswerCustomTheme = "catppuccin-mocha";
let currentSplitAnswerTheme = false;

let currentSnipDimming = 15;
let currentSnipBorderThickness = 2; // Supports 0px absolute zero
let currentSnipFillOpacity = 12;
let currentSnipBorderStyle = "dashed";
let currentSnipBorderGlow = true;
let currentSnipShowHint = true;

let currentAnswerStealthMode = false;
let currentAnswerBorderThickness = 1; // Supports 0px absolute zero
let currentAnswerBorderRadius = 14;
let currentAnswerWidth = 350;
let currentAnswerOpacity = 98;
let currentAnswerBlur = 14;
let currentAnswerFontSize = 13;
let currentAnswerBorderStyle = "solid";
let currentAnswerDragBar = true;
let currentAnswerAutoCopy = false;

let currentAnswerCustomColorEnabled = false;
let currentAnswerCustomBgColor = "#181825";
let currentAnswerCustomTextColor = "#cdd6f4";
let currentAnswerCustomBorderColor = "#89b4fa";

function colorWithAlpha(colorStr, alpha) {
  if (alpha <= 0) return "transparent";
  if (!colorStr) return `rgba(0, 0, 0, ${alpha})`;
  colorStr = colorStr.trim();
  if (colorStr.startsWith("#")) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (colorStr.startsWith("rgb")) {
    const parts = colorStr.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  }
  return colorStr;
}

function getAnswerEffectiveInp() {
  const base = activeAnswerConfig.inpage;
  if (currentAnswerStealthMode) {
    return {
      ...base,
      overlayBg: "transparent",
      overlayBorder: "transparent",
      overlayShadow: "none",
      overlayTextPrimary: "#000000",
      overlayTextSecondary: "#111111",
      overlayTextMuted: "#333333",
      cardBg: "transparent",
      cardBorder: "transparent",
      cardLabel: "#000000",
      cardValue: "#000000",
      buttonBg: "transparent",
      buttonBorder: "transparent",
      buttonText: "#000000",
      buttonHoverBg: "transparent",
      buttonHoverBorder: "transparent",
      buttonHoverText: "#000000",
      spinnerColor: "#000000"
    };
  }
  if (currentAnswerCustomColorEnabled) {
    const bg = currentAnswerCustomBgColor || "#181825";
    const text = currentAnswerCustomTextColor || "#cdd6f4";
    const border = currentAnswerCustomBorderColor || "#89b4fa";
    return {
      ...base,
      overlayBg: bg,
      overlayBorder: border,
      overlayShadow: `0 4px 20px 0 ${colorWithAlpha(border, 0.15)}, inset 0 0 0 1px ${colorWithAlpha(border, 0.25)}`,
      overlayTextPrimary: text,
      overlayTextSecondary: colorWithAlpha(text, 0.82),
      overlayTextMuted: colorWithAlpha(text, 0.60),
      cardBg: colorWithAlpha(border, 0.08),
      cardBorder: border,
      cardLabel: border,
      cardValue: text,
      buttonBg: colorWithAlpha(border, 0.12),
      buttonBorder: colorWithAlpha(border, 0.40),
      buttonText: text,
      buttonHoverBg: colorWithAlpha(border, 0.25),
      buttonHoverBorder: border,
      buttonHoverText: text,
      spinnerColor: border
    };
  }
  return base;
}

function getAnswerBoxBorderCss(inp) {
  if (currentAnswerStealthMode) {
    return "none";
  }
  if (currentAnswerBorderThickness <= 0 || currentAnswerBorderStyle === "none") {
    return "none";
  }
  return `${currentAnswerBorderThickness}px ${currentAnswerBorderStyle} ${inp.overlayBorder}`;
}

function getAnswerBoxBg(inp) {
  if (currentAnswerStealthMode) {
    return "transparent";
  }
  const bgAlpha = Math.max(0, Math.min(100, currentAnswerOpacity)) / 100;
  return (bgAlpha < 1.0) ? colorWithAlpha(inp.overlayBg, bgAlpha) : inp.overlayBg;
}

function getAnswerBoxBlurCss() {
  if (currentAnswerStealthMode) {
    return "blur(2px)";
  }
  const blurPx = Math.max(0, Math.min(40, currentAnswerBlur));
  return (blurPx <= 0) ? "none" : `blur(${blurPx}px)`;
}

const defaultThemeObj = (typeof HS_THEMES !== "undefined" && HS_THEMES["default"]) ? HS_THEMES["default"] : {
  inpage: {
    snipOverlayBg: "rgba(0, 0, 0, 0.08)",
    snipBorder: "#9b5329",
    snipSelectionBg: "rgba(155, 83, 41, 0.1)",
    snipBoxShadow: "0 0 14px rgba(155, 83, 41, 0.22)",
    snipHintBg: "rgba(254, 250, 245, 0.94)",
    snipHintBorder: "rgba(184, 158, 134, 0.55)",
    snipHintShadow: "0 6px 20px rgba(92, 65, 43, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
    snipHintText: "#4a2815",
    overlayBg: "rgba(246, 241, 235, 0.90)",
    overlayBorder: "rgba(184, 158, 134, 0.45)",
    overlayShadow: "0 4px 20px 0 rgba(74, 44, 17, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.5)",
    overlayTextPrimary: "#3b2210",
    overlayTextSecondary: "#5a4230",
    overlayTextMuted: "#786959",
    cardBg: "rgba(255, 255, 255, 0.5)",
    cardBorder: "#b85d19",
    cardLabel: "#87431b",
    cardValue: "#3b2210",
    spinnerColor: "#b85d19",
    buttonBg: "rgba(255, 255, 255, 0.75)",
    buttonBorder: "rgba(184, 158, 134, 0.55)",
    buttonText: "#87431b",
    buttonHoverBg: "rgba(255, 255, 255, 0.95)",
    buttonHoverBorder: "#87431b",
    buttonHoverText: "#6d3314",
    badgeSuccess: "#2e6930",
    badgeWarning: "#b45309",
    copySuccess: "#2e6930"
  }
};

let activeSnipConfig = defaultThemeObj;
let activeAnswerConfig = defaultThemeObj;

function updateActiveThemeConfigs(data) {
  if (!data) return;
  if (data.snipThemeMode !== undefined) currentSnipThemeMode = data.snipThemeMode;
  else if (data.themeMode !== undefined) currentSnipThemeMode = data.themeMode;

  if (data.snipCustomTheme !== undefined) currentSnipCustomTheme = data.snipCustomTheme;
  else if (data.customTheme !== undefined) currentSnipCustomTheme = data.customTheme;

  if (data.answerThemeMode !== undefined) currentAnswerThemeMode = data.answerThemeMode;
  else if (data.splitAnswerTheme !== undefined) currentAnswerThemeMode = data.splitAnswerTheme ? "customized" : "default";
  else if (data.themeMode !== undefined) currentAnswerThemeMode = data.themeMode;

  if (data.answerCustomTheme !== undefined) currentAnswerCustomTheme = data.answerCustomTheme;
  else if (data.customTheme !== undefined) currentAnswerCustomTheme = data.customTheme;

  if (typeof HS_resolveActiveTheme === "function") {
    activeSnipConfig = HS_resolveActiveTheme(currentSnipThemeMode, currentSnipCustomTheme);
    activeAnswerConfig = HS_resolveActiveTheme(currentAnswerThemeMode, currentAnswerCustomTheme);
  }
}

function rethemeLiveAnswerOverlay() {
  const box = document.getElementById("hs-answer-overlay");
  if (!box) return;
  const inp = getAnswerEffectiveInp();

  if (currentAnswerStealthMode) {
    box.classList.add("hs-stealth-mode");
  } else {
    box.classList.remove("hs-stealth-mode");
  }

  box.style.background = getAnswerBoxBg(inp);
  const blurVal = getAnswerBoxBlurCss();
  box.style.backdropFilter = blurVal;
  box.style.webkitBackdropFilter = blurVal;
  box.style.width = `${currentAnswerWidth}px`;
  box.style.borderRadius = `${currentAnswerBorderRadius}px`;
  box.style.border = getAnswerBoxBorderCss(inp);
  box.style.boxShadow = inp.overlayShadow;
  box.style.color = inp.overlayTextPrimary;

  const closeBtn = document.getElementById("hs-close");
  if (closeBtn) {
    closeBtn.style.color = inp.overlayTextMuted;
    closeBtn.style.opacity = currentAnswerStealthMode ? "0.6" : "0.75";
  }
  const copyBtn = document.getElementById("hs-copy");
  if (copyBtn) {
    copyBtn.style.color = inp.overlayTextMuted;
    copyBtn.style.opacity = currentAnswerStealthMode ? "0.6" : "0.75";
  }
  const dragBar = document.getElementById("hs-drag-bar");
  if (dragBar) dragBar.style.display = currentAnswerDragBar ? "block" : "none";

  box.querySelectorAll(".hs-card").forEach(c => {
    c.style.background = inp.cardBg;
    c.style.borderLeftColor = inp.cardBorder;
    c.style.color = inp.cardValue;
    c.style.fontSize = `${currentAnswerFontSize}px`;
  });
  box.querySelectorAll(".hs-card-label").forEach(l => {
    l.style.color = inp.cardLabel;
  });
  const expandBtn = document.getElementById("hs-expand-step");
  if (expandBtn) {
    expandBtn.style.background = inp.buttonBg;
    expandBtn.style.color = inp.buttonText;
    expandBtn.style.borderColor = inp.buttonBorder;
  }
}

let currentQuickSettings = {
  style: "detailed",
  subject: "auto",
  globalApproach: "normal",
  autoSelect: false,
  dsaLanguage: "Python",
  dsaOptimize: "Optimal Time & Space",
  dsaFormat: "Function Solution"
};

if (typeof chrome !== "undefined" && chrome.storage?.local) {
  try {
    chrome.storage.local.get([
      "hsOverlayPos", "hsDotPos", "dotMode", "dotSize", "dotOpacity", "snipCursor", "customCursorUrl",
      "snipThemeMode", "snipCustomTheme", "answerThemeMode", "answerCustomTheme", "splitAnswerTheme",
      "themeMode", "customTheme",
      "snipDimming", "snipBorderThickness", "snipFillOpacity", "snipBorderStyle", "snipBorderGlow", "snipShowHint",
      "answerStealthMode", "answerBorderThickness", "answerBorderRadius", "answerWidth", "answerOpacity", "answerBlur", "answerFontSize", "answerBorderStyle", "answerDragBar", "answerAutoCopy",
      "answerCustomColorEnabled", "answerCustomBgColor", "answerCustomTextColor", "answerCustomBorderColor",
      "style", "subject", "globalApproach", "autoSelect", "dsaLanguage", "dsaOptimize", "dsaFormat"
    ], (res) => {
      if (res) {
        if (res.style) currentQuickSettings.style = res.style;
        if (res.subject) currentQuickSettings.subject = res.subject;
        if (res.globalApproach) currentQuickSettings.globalApproach = res.globalApproach;
        if (res.autoSelect !== undefined) currentQuickSettings.autoSelect = !!res.autoSelect;
        if (res.dsaLanguage) currentQuickSettings.dsaLanguage = res.dsaLanguage;
        if (res.dsaOptimize) currentQuickSettings.dsaOptimize = res.dsaOptimize;
        if (res.dsaFormat) currentQuickSettings.dsaFormat = res.dsaFormat;
        if (res.hsOverlayPos) savedOverlayPos = res.hsOverlayPos;
        if (res.hsDotPos) savedDotPos = res.hsDotPos;
        if (res.dotMode !== undefined) currentDotMode = !!res.dotMode;
        if (res.dotSize !== undefined) currentDotSize = Number(res.dotSize);
        if (res.dotOpacity !== undefined) currentDotOpacity = Number(res.dotOpacity);
        if (res.snipCursor) currentSnipCursor = res.snipCursor;
        if (res.customCursorUrl) currentCustomCursorUrl = res.customCursorUrl;
        if (res.snipDimming !== undefined) currentSnipDimming = Number(res.snipDimming);
        if (res.snipBorderThickness !== undefined) currentSnipBorderThickness = Number(res.snipBorderThickness);
        if (res.snipFillOpacity !== undefined) currentSnipFillOpacity = Number(res.snipFillOpacity);
        if (res.snipBorderStyle !== undefined) currentSnipBorderStyle = res.snipBorderStyle;
        if (res.snipBorderGlow !== undefined) currentSnipBorderGlow = !!res.snipBorderGlow;
        if (res.snipShowHint !== undefined) currentSnipShowHint = !!res.snipShowHint;

        if (res.answerStealthMode !== undefined) currentAnswerStealthMode = !!res.answerStealthMode;
        if (res.answerBorderThickness !== undefined) currentAnswerBorderThickness = Number(res.answerBorderThickness);
        if (res.answerBorderRadius !== undefined) currentAnswerBorderRadius = Number(res.answerBorderRadius);
        if (res.answerWidth !== undefined) currentAnswerWidth = Number(res.answerWidth);
        if (res.answerOpacity !== undefined) currentAnswerOpacity = Number(res.answerOpacity);
        if (res.answerBlur !== undefined) currentAnswerBlur = Number(res.answerBlur);
        if (res.answerFontSize !== undefined) currentAnswerFontSize = Number(res.answerFontSize);
        if (res.answerBorderStyle !== undefined) currentAnswerBorderStyle = res.answerBorderStyle;
        if (res.answerDragBar !== undefined) currentAnswerDragBar = !!res.answerDragBar;
        if (res.answerAutoCopy !== undefined) currentAnswerAutoCopy = !!res.answerAutoCopy;

        if (res.answerCustomColorEnabled !== undefined) currentAnswerCustomColorEnabled = !!res.answerCustomColorEnabled;
        if (res.answerCustomBgColor) currentAnswerCustomBgColor = res.answerCustomBgColor;
        if (res.answerCustomTextColor) currentAnswerCustomTextColor = res.answerCustomTextColor;
        if (res.answerCustomBorderColor) currentAnswerCustomBorderColor = res.answerCustomBorderColor;

        updateActiveThemeConfigs(res);
      }
    });
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === "local") {
        if (changes.dotMode !== undefined) currentDotMode = !!changes.dotMode.newValue;
        if (changes.dotSize !== undefined) {
          currentDotSize = Number(changes.dotSize.newValue);
          applyDotOptics(document.getElementById("hs-dot-trigger"));
        }
        if (changes.dotOpacity !== undefined) {
          currentDotOpacity = Number(changes.dotOpacity.newValue);
          applyDotOptics(document.getElementById("hs-dot-trigger"));
        }
        if (changes.hsDotPos) savedDotPos = changes.hsDotPos.newValue;
        if (changes.snipCursor) currentSnipCursor = changes.snipCursor.newValue;
        if (changes.customCursorUrl) currentCustomCursorUrl = changes.customCursorUrl.newValue;
        if (changes.snipDimming !== undefined) currentSnipDimming = Number(changes.snipDimming.newValue);
        if (changes.snipBorderThickness !== undefined) currentSnipBorderThickness = Number(changes.snipBorderThickness.newValue);
        if (changes.snipFillOpacity !== undefined) currentSnipFillOpacity = Number(changes.snipFillOpacity.newValue);
        if (changes.snipBorderStyle !== undefined) currentSnipBorderStyle = changes.snipBorderStyle.newValue;
        if (changes.snipBorderGlow !== undefined) currentSnipBorderGlow = !!changes.snipBorderGlow.newValue;
        if (changes.snipShowHint !== undefined) currentSnipShowHint = !!changes.snipShowHint.newValue;

        let rethemeNeeded = false;
        if (changes.answerStealthMode !== undefined) {
          currentAnswerStealthMode = !!changes.answerStealthMode.newValue;
          rethemeNeeded = true;
        }
        if (changes.answerBorderThickness !== undefined) {
          currentAnswerBorderThickness = Number(changes.answerBorderThickness.newValue);
          rethemeNeeded = true;
        }
        if (changes.answerBorderRadius !== undefined) {
          currentAnswerBorderRadius = Number(changes.answerBorderRadius.newValue);
          rethemeNeeded = true;
        }
        if (changes.answerWidth !== undefined) {
          currentAnswerWidth = Number(changes.answerWidth.newValue);
          rethemeNeeded = true;
        }
        if (changes.answerOpacity !== undefined) {
          currentAnswerOpacity = Number(changes.answerOpacity.newValue);
          rethemeNeeded = true;
        }
        if (changes.answerBlur !== undefined) {
          currentAnswerBlur = Number(changes.answerBlur.newValue);
          rethemeNeeded = true;
        }
        if (changes.answerFontSize !== undefined) {
          currentAnswerFontSize = Number(changes.answerFontSize.newValue);
          rethemeNeeded = true;
        }
        if (changes.answerBorderStyle !== undefined) {
          currentAnswerBorderStyle = changes.answerBorderStyle.newValue;
          rethemeNeeded = true;
        }
        if (changes.answerDragBar !== undefined) {
          currentAnswerDragBar = !!changes.answerDragBar.newValue;
          rethemeNeeded = true;
        }
        if (changes.answerAutoCopy !== undefined) {
          currentAnswerAutoCopy = !!changes.answerAutoCopy.newValue;
        }
        if (changes.answerCustomColorEnabled !== undefined) {
          currentAnswerCustomColorEnabled = !!changes.answerCustomColorEnabled.newValue;
          rethemeNeeded = true;
        }
        if (changes.answerCustomBgColor) {
          currentAnswerCustomBgColor = changes.answerCustomBgColor.newValue;
          rethemeNeeded = true;
        }
        if (changes.answerCustomTextColor) {
          currentAnswerCustomTextColor = changes.answerCustomTextColor.newValue;
          rethemeNeeded = true;
        }
        if (changes.answerCustomBorderColor) {
          currentAnswerCustomBorderColor = changes.answerCustomBorderColor.newValue;
          rethemeNeeded = true;
        }

        if (changes.style?.newValue) currentQuickSettings.style = changes.style.newValue;
        if (changes.subject?.newValue) currentQuickSettings.subject = changes.subject.newValue;
        if (changes.globalApproach?.newValue) currentQuickSettings.globalApproach = changes.globalApproach.newValue;
        if (changes.autoSelect !== undefined) currentQuickSettings.autoSelect = !!changes.autoSelect.newValue;
        if (changes.dsaLanguage?.newValue) currentQuickSettings.dsaLanguage = changes.dsaLanguage.newValue;
        if (changes.dsaOptimize?.newValue) currentQuickSettings.dsaOptimize = changes.dsaOptimize.newValue;
        if (changes.dsaFormat?.newValue) currentQuickSettings.dsaFormat = changes.dsaFormat.newValue;

        let themeChanged = false;
        if (changes.snipThemeMode || changes.themeMode) {
          currentSnipThemeMode = changes.snipThemeMode?.newValue || changes.themeMode?.newValue || "default";
          themeChanged = true;
        }
        if (changes.snipCustomTheme || changes.customTheme) {
          currentSnipCustomTheme = changes.snipCustomTheme?.newValue || changes.customTheme?.newValue || "catppuccin-mocha";
          themeChanged = true;
        }
        if (changes.answerThemeMode) {
          currentAnswerThemeMode = changes.answerThemeMode.newValue;
          themeChanged = true;
        }
        if (changes.answerCustomTheme) {
          currentAnswerCustomTheme = changes.answerCustomTheme.newValue;
          themeChanged = true;
        }
        if (changes.splitAnswerTheme !== undefined) {
          currentSplitAnswerTheme = !!changes.splitAnswerTheme.newValue;
          if (!changes.answerThemeMode) {
            currentAnswerThemeMode = currentSplitAnswerTheme ? "customized" : "default";
          }
          themeChanged = true;
        }
        if (themeChanged) {
          updateActiveThemeConfigs({
            snipThemeMode: currentSnipThemeMode,
            snipCustomTheme: currentSnipCustomTheme,
            answerThemeMode: currentAnswerThemeMode,
            answerCustomTheme: currentAnswerCustomTheme
          });
          rethemeLiveAnswerOverlay();
        } else if (rethemeNeeded) {
          rethemeLiveAnswerOverlay();
        }
      }
    });
  } catch (e) {}
}

function isContextValid() {
  try {
    return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function startSnipping() {
  if (!isContextValid()) {
    alert("Homework Solver extension was reloaded. Please refresh this page (F5) to snip and solve.");
    return;
  }
  if (isSnipping) return;

  // Immediately close previous answer overlay when scanning a new question
  removeExistingOverlay();

  isSnipping = true;
  screenshotDataUrl = null;
  answerHistory = [];
  isDotHidden = false;

  capturePromise = new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: "captureScreen" }, (res) => {
        if (chrome.runtime.lastError || !res || !res.dataUrl) {
          resolve(null);
          return;
        }
        screenshotDataUrl = res.dataUrl;
        resolve(res.dataUrl);
      });
    } catch (e) {
      resolve(null);
    }
  });

  const inp = activeSnipConfig.inpage;

  const dimAlpha = Math.max(0, Math.min(100, currentSnipDimming)) / 100;
  const overlayBg = (dimAlpha > 0) ? `rgba(0, 0, 0, ${dimAlpha})` : "transparent";

  const overlay = document.createElement("div");
  overlay.id = "hs-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: ${overlayBg};
    z-index: 2147483640; cursor: ${getSnipCursorCss()} !important;
  `;

  const hint = document.createElement("div");
  hint.innerText = "Drag to snip • Right-click or Esc to cancel";
  hint.style.cssText = `
    position: fixed; top: 14px; left: 50%;
    transform: translateX(-50%);
    background: ${inp.snipHintBg};
    border: 1px solid ${inp.snipHintBorder};
    box-shadow: ${inp.snipHintShadow};
    color: ${inp.snipHintText};
    padding: 7px 20px; border-radius: 30px;
    font-size: 12.5px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-weight: 600;
    z-index: 2147483645; pointer-events: none;
    user-select: none;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    letter-spacing: 0.15px;
    display: ${currentSnipShowHint ? "block" : "none"};
  `;

  const selectionFill = (currentSnipFillOpacity <= 0)
    ? "transparent"
    : colorWithAlpha(inp.snipBorder, currentSnipFillOpacity / 100);

  const selectionGlow = (currentSnipBorderGlow && currentSnipBorderThickness > 0 && currentSnipBorderStyle !== "none")
    ? (inp.snipBoxShadow || `0 0 14px ${colorWithAlpha(inp.snipBorder, 0.4)}`)
    : "none";

  const selectionBorder = (currentSnipBorderThickness <= 0 || currentSnipBorderStyle === "none")
    ? "none"
    : `${currentSnipBorderThickness}px ${currentSnipBorderStyle} ${inp.snipBorder}`;

  selectionBox = document.createElement("div");
  selectionBox.style.cssText = `
    position: fixed;
    border: ${selectionBorder};
    background: ${selectionFill};
    box-shadow: ${selectionGlow};
    z-index: 2147483642; pointer-events: none;
    display: none;
    will-change: left, top, width, height;
    transform: translateZ(0);
    contain: strict;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(hint);
  document.body.appendChild(selectionBox);

  const onContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  };

  overlay.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("contextmenu", onContextMenu, true);

  let recaptureTimer = null;
  overlay.addEventListener("wheel", (e) => {
    e.preventDefault();
    window.scrollBy(0, e.deltaY);
    clearTimeout(recaptureTimer);
    recaptureTimer = setTimeout(() => {
      if (!isContextValid()) return;
      capturePromise = new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ action: "captureScreen" }, (res) => {
            if (chrome.runtime.lastError || !res || !res.dataUrl) {
              resolve(null);
              return;
            }
            screenshotDataUrl = res.dataUrl;
            resolve(res.dataUrl);
          });
        } catch (err) {
          resolve(null);
        }
      });
    }, 250);
  }, { passive: false });

  overlay.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      e.preventDefault();
      cleanup();
      return;
    }
    if (e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
  });

  let snipRaf = null;
  let curMouseX = 0;
  let curMouseY = 0;

  overlay.addEventListener("mousemove", (e) => {
    if (startX === null || startY === null) return;
    curMouseX = e.clientX;
    curMouseY = e.clientY;
    if (!snipRaf) {
      snipRaf = requestAnimationFrame(() => {
        snipRaf = null;
        if (startX === null || startY === null) return;
        const x = Math.min(curMouseX, startX);
        const y = Math.min(curMouseY, startY);
        const w = Math.abs(curMouseX - startX);
        const h = Math.abs(curMouseY - startY);
        selectionBox.style.left = `${x}px`;
        selectionBox.style.top = `${y}px`;
        selectionBox.style.width = `${w}px`;
        selectionBox.style.height = `${h}px`;
      });
    }
  }, { passive: true });

  overlay.addEventListener("mouseup", (e) => {
    if (e.button === 2) {
      e.preventDefault();
      cleanup();
      return;
    }
    if (e.button !== 0 || startX === null || startY === null) return;
    if (snipRaf) {
      cancelAnimationFrame(snipRaf);
      snipRaf = null;
    }
    const endX = e.clientX;
    const endY = e.clientY;
    const x1 = Math.min(startX, endX);
    const y1 = Math.min(startY, endY);
    const x2 = Math.max(startX, endX);
    const y2 = Math.max(startY, endY);
    cleanup();
    if (x2 - x1 > 5 && y2 - y1 > 5) {
      cropAndSolve(x1, y1, x2, y2);
    }
  });

  function escHandler(e) {
    if (e.key === "Escape") {
      cleanup();
    }
  }
  document.addEventListener("keydown", escHandler);

  function cleanup() {
    if (snipRaf) {
      cancelAnimationFrame(snipRaf);
      snipRaf = null;
    }
    isSnipping = false;
    startX = startY = null;
    document.removeEventListener("keydown", escHandler);
    window.removeEventListener("contextmenu", onContextMenu, true);
    overlay.removeEventListener("contextmenu", onContextMenu);
    overlay.remove();
    hint.remove();
    selectionBox.remove();
  }
}

// ── Crop screenshot ────────────────────────────────
async function cropAndSolve(x1, y1, x2, y2) {
  const dpr = window.devicePixelRatio || 1;
  let rawW = (x2 - x1) * dpr;
  let rawH = (y2 - y1) * dpr;

  // Calibrated resolution: 800px provides crisp readability for zoomed-out
  // questions and math formulas while reducing image token consumption by ~65%
  // to stay well within Groq free-tier's 8,000 TPM limit.
  const maxDim = 800;
  let scale = Math.min(maxDim / rawW, maxDim / rawH, 1);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rawW * scale);
  canvas.height = Math.round(rawH * scale);

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let dataUrl = screenshotDataUrl;
  if (!dataUrl && capturePromise) {
    dataUrl = await capturePromise;
  }
  if (!dataUrl) {
    dataUrl = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "captureScreen" }, (res) => {
          resolve((res && res.dataUrl) || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  if (!dataUrl) {
    showAnswerOverlay("Could not capture screen. Please check tab permissions or refresh the page (F5).");
    return;
  }

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img,
      x1 * dpr, y1 * dpr,
      rawW, rawH,
      0, 0, canvas.width, canvas.height
    );
    // 0.85 JPEG quality provides sharp text without heavy compression artifacts
    const croppedBase64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    lastCroppedBase64 = croppedBase64;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("hs_last_crop", croppedBase64);
      }
    } catch (e) {}
    callAPI(croppedBase64);
  };
  img.onerror = () => {
    showAnswerOverlay("Failed to process captured image. Please try again.");
  };
  img.src = dataUrl;
}

const DEFAULT_GROQ_KEYS = "";

// ── Smart 60-second backoff memory for rate-limited (HTTP 429) keys ──
const keyRateLimitCooldowns = new Map(); // key -> expiration timestamp (ms)

function isKeyCoolingDown(key) {
  if (!key) return false;
  const exp = keyRateLimitCooldowns.get(key);
  if (!exp) return false;
  if (Date.now() >= exp) {
    keyRateLimitCooldowns.delete(key);
    return false;
  }
  return true;
}

function markKeyRateLimited(key) {
  if (!key) return;
  const cooldownMs = 60 * 1000; // 60 seconds cooldown
  keyRateLimitCooldowns.set(key, Date.now() + cooldownMs);
  console.warn(`[hs] Groq Key ending with ...${key.slice(-6)} hit rate limit (HTTP 429). Placed on 60s cooldown.`);
}

function isRateLimitError(err) {
  return /429|rate\s*limit|quota|too\s*many\s*requests|resource_exhausted/i.test(err || "");
}

// Persistent Groq key rotation across all tabs, windows, and page reloads
async function getRotatedGroqKeys(keysData) {
  let raw = (keysData || {}).Groq || "";
  let parsed = raw.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
  if (parsed.length === 0 && DEFAULT_GROQ_KEYS) {
    const defaultList = DEFAULT_GROQ_KEYS.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
    parsed = [...new Set([...parsed, ...defaultList])];
  }
  if (!parsed.length) return { keys: [], activeIndex: 0, total: 0 };
  if (parsed.length === 1) return { keys: parsed, activeIndex: 0, total: 1 };

  let storedIndices = {};
  try {
    const res = await chrome.storage.local.get(["providerKeyIndices"]);
    storedIndices = res.providerKeyIndices || {};
  } catch (e) {}

  const currentIndex = (storedIndices.Groq || 0) % parsed.length;
  // Advance index for the next request so traffic is evenly distributed
  storedIndices.Groq = (currentIndex + 1) % parsed.length;
  try {
    await chrome.storage.local.set({ providerKeyIndices: storedIndices });
  } catch (e) {}

  // Rotate list so currentIndex is primary, followed by remaining keys
  const rotated = [...parsed.slice(currentIndex), ...parsed.slice(0, currentIndex)];

  // Smart backoff prioritization: move keys on 60s HTTP 429 cooldown to the back
  const readyKeys = rotated.filter(k => !isKeyCoolingDown(k));
  const coolingKeys = rotated.filter(k => isKeyCoolingDown(k));
  const prioritized = readyKeys.length > 0 ? [...readyKeys, ...coolingKeys] : rotated;

  return { keys: prioritized, activeIndex: currentIndex, total: parsed.length };
}

const DEPRECATED_GROQ_MODELS = new Set([
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-4-scout-17b-16e-instruct",
  "llama-3.2-11b-vision-preview",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-instruct",
  "qwen/qwen3.6-27b",
  "qwen3.6"
]);

function normalizeGroqModel(m) {
  if (!m) return "";
  const trimmed = m.trim();
  if (/^qwen[-_/\s]*3\.?6(?:[-_]27b)?$/i.test(trimmed)) {
    return "qwen/qwen3.8-27b"; // Auto-migrate decommissioned 3.6 to active 3.8
  }
  if (/^qwen[-_/\s]*3\.?8(?:[-_]27b)?$/i.test(trimmed)) {
    return "qwen/qwen3.8-27b";
  }
  return trimmed;
}

function getGroqVisionModels(customModel, lastGoodModel) {
  const candidates = [];

  // Ignore models belonging to other providers (e.g. gemini-*, gpt-*, claude-*)
  const isForeignModel = (m) => m && /^(?:gemini|gpt|claude|o1|o3|chatgpt)/i.test(m);

  const normCustom = normalizeGroqModel(customModel);
  const normLastGood = normalizeGroqModel(lastGoodModel);

  // 1. User custom model override (if not foreign and not in known deprecated set)
  if (normCustom && !isForeignModel(normCustom) && !DEPRECATED_GROQ_MODELS.has(normCustom)) {
    candidates.push(normCustom);
  }

  // 2. Previously verified working model (if not foreign and not known deprecated)
  if (normLastGood && !isForeignModel(normLastGood) && !DEPRECATED_GROQ_MODELS.has(normLastGood) && !candidates.includes(normLastGood)) {
    candidates.push(normLastGood);
  }

  // 3. Active production vision models on Groq
  const defaults = [
    "qwen/qwen3.8-27b"
  ];

  for (const d of defaults) {
    if (!candidates.includes(d)) candidates.push(d);
  }

  return candidates;
}

// ── Stream AI call through the background service worker ──
// Content scripts inherit the page's CORS/CSP, so fetch() here gets killed on
// restrictive sites. background.js runs isolated and bypasses those — we open a
// "stream_api" port and stream the response chunks back over it. The return
// contract ({ok,text,ttft,truncated,total,error}) is unchanged, so the two-phase
// orchestrator in callAPI doesn't know the difference.
function callStream({ provider, url, headers, body, deadlineMs, onChunk }) {
  return new Promise((resolve) => {
    let port;
    try {
      port = chrome.runtime.connect({ name: "stream_api" });
    } catch (e) {
      resolve({ ok: false, error: "Extension context invalidated. Please refresh this page (F5)." });
      return;
    }

    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      try { port.disconnect(); } catch (e) {}
      resolve(res);
    };

    port.onMessage.addListener((msg) => {
      if (msg.type === "delta") {
        if (onChunk) onChunk(msg.text);
      } else if (msg.type === "done") {
        finish({ ok: msg.ok, text: msg.text, ttft: msg.ttft, truncated: msg.truncated, total: msg.total });
      } else if (msg.type === "error") {
        finish({ ok: false, error: msg.error });
      }
    });

    port.onDisconnect.addListener(() => {
      // lastError is set when the connection dropped unexpectedly (service
      // worker killed). Our own finish() disconnect fires this with no error.
      if (chrome.runtime.lastError) {
        finish({ ok: false, error: chrome.runtime.lastError.message || "Background connection lost" });
      } else {
        finish({ ok: false, error: "Background closed the connection before a response" });
      }
    });

    port.postMessage({ type: "start", provider, url, headers, body, deadlineMs });
  });
}

function buildUserPromptWithQuery(base, customQuery) {
  if (!customQuery || !customQuery.trim()) return base;
  return `User Specific Instruction / README Context: "${customQuery.trim()}"\n\nAnalyze the question in the image and fulfill the user's specific instruction/context completely:\n${base}`;
}

function getSubjectPersona(sub, options = {}) {
  const aptitudePersona = "You are an Elite Quantitative Aptitude, Logical Reasoning & Mathematics Specialist. You master both numerical aptitude and logical deduction:\n" +
    "- Quantitative Aptitude: Exact calculations for percentages, ratios, profit & loss, work & time, speed-time-distance, averages, mixtures, number series, simple/compound interest, geometry, mensuration, and algebraic equations. Pay strict attention to units and dimensional consistency.\n" +
    "- Logical Reasoning & Puzzles: Formal deductions for linear/circular seating arrangements, family trees & blood relations, syllogisms (strict Venn logic), direction sense, input-output machines, coding-decoding, and matrix elimination grids. Never make unstated assumptions.";

  let dsaPersona = "You are a Principal Algorithms Engineer & Competitive Programming Specialist. Rigorously analyze data structures (trees, graphs, heaps, hash maps, tries) and algorithmic techniques (DP, two pointers, sliding window, binary search, DFS/BFS). Trace invariants, time/space complexity, and boundary edge cases (null, empty, single element, cycles, integer overflow).";
  if (options && options.dsaLanguage) {
    dsaPersona += `\nTARGET LANGUAGE: ${options.dsaLanguage}.`;
  }
  if (options && options.dsaOptimize) {
    dsaPersona += `\nOPTIMIZATION GOAL: ${options.dsaOptimize}.`;
  }
  if (options && options.dsaFormat) {
    dsaPersona += `\nCODE FORMAT: ${options.dsaFormat}.`;
  }

  const personas = {
    auto: "You are an Expert Academic Tutor & Multi-Disciplinary Problem Solver. Rigorously analyze problems across sciences, engineering, mathematics, and humanities from first principles. Extract given parameters, verify step-by-step logic, and check for negative constraints (NOT, EXCEPT, LEAST).",
    "aptitude-reasoning": aptitudePersona,
    "logical-reasoning": aptitudePersona,
    "prob-stats": "You are a Senior Probability & Mathematical Statistics Specialist. Rigorously analyze discrete and continuous probability distributions (Binomial, Poisson, Normal, Exponential), conditional probability, Bayes' Theorem, expected value, variance, hypothesis testing, p-values, regression, and combinatorics (permutations & combinations). Verify sample spaces and independence assumptions before calculating.",
    "ai-finance": "You are a Senior Quantitative Finance & AI for Finance Specialist. Rigorously analyze financial mathematics, options pricing, Sharpe/Sortino ratios, risk models (VaR), portfolio optimization, time value of money, trading logic, and ML/RAG evaluation metrics with financial and algorithmic precision.",
    "dsa": dsaPersona,
    "backend-dev": "You are a Principal Backend Systems Engineer. The user will provide an image of their project file tree/system along with a README context or task logs. Rigorously analyze the project's directory structure, database schemas, APIs, and models from first principles.\nSTRICT NO-PROSE / 1-SHOT TERMINAL EXECUTION CONTRACT:\n- ZERO English conversational steps or instructions (do NOT write 'Open file X and replace line Y...').\n- Output the full, complete production code for every modified or new file so all changes across all directories can be applied in ONE terminal command.\n- Use the standard delimiter for every file:\n### FILE: <relative/path/to/file>\nfollowed by the complete, directly runnable file content in triple-backtick code fences.\n- Ensure all directory paths are properly structured relative to the project root with 100% clean 4-space indentation starting at column 0 with zero tabs.",
    "communication": "You are an Expert in Linguistic Analysis, English Grammar, and Verbal Ability. Rigorously analyze grammatical correctness (subject-verb agreement, modifiers, tense, parallelism), vocabulary in context, reading comprehension logic, sentence completion, and argument structures."
  };

  return personas[sub || "auto"] || personas["auto"];
}

// ── Approach 1: Sequential 3-Stage Unrestricted Deep Engine ──
async function callAptitudeSequential3Stage(b64, { forceStyle, answerStyle, keys, customModel, lastGood, autoSelect, subject, customQuery, dsaOptions } = {}) {
  const groqKeysRaw = (keys || {}).Groq || "";
  const groqParsed = groqKeysRaw.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
  if (groqParsed.length === 0) {
    showAnswerOverlay(
      `⚠️ No Groq API key found!\n\n` +
      `👉 How to configure:\n` +
      `1. Click the extension icon in the Chrome toolbar.\n` +
      `2. Paste your Groq API key(s) in the Groq API Key box.\n` +
      `3. Click '💾 Save'.\n\n` +
      `💡 Get a free API key at https://console.groq.com/keys`
    );
    return;
  }

  const keyInfo = await getRotatedGroqKeys(keys);
  const allKeys = keyInfo.keys.length > 0 ? keyInfo.keys : groqParsed;
  const totalKeys = keyInfo.total || allKeys.length;
  const groqModels = getGroqVisionModels(customModel, lastGood.GroqModel);
  const model = groqModels[0] || "qwen/qwen3.8-27b";

  // Dedicated distinct key indices for the 3 sequential stages
  const stage1KeyIdx = 0;
  const stage2KeyIdx = allKeys.length > 1 ? 1 : 0;
  const stage3KeyIdx = allKeys.length > 2 ? 2 : (allKeys.length > 1 ? 0 : 0);

  async function executeStage({ stageNum, stageName, assignedKeyIdx, messages, maxTokens, statusMessage, onChunk }) {
    const numKeys = allKeys.length;
    let attempts = 0;
    let currentKeyIdx = assignedKeyIdx % numKeys;

    while (attempts < numKeys) {
      const activeKey = allKeys[currentKeyIdx];
      const actualDisplayIndex = ((keyInfo.activeIndex + currentKeyIdx) % totalKeys) + 1;

      if (isKeyCoolingDown(activeKey) && attempts < numKeys - 1) {
        currentKeyIdx = (currentKeyIdx + 1) % numKeys;
        attempts++;
        continue;
      }

      console.log(`[hs-3stage] Stage ${stageNum}/3 (${stageName}) running on Key #${actualDisplayIndex}/${totalKeys} (${model})`);
      showLoadingOverlay(`⚡ [Key #${actualDisplayIndex}/${totalKeys}] Stage ${stageNum}/3: ${statusMessage}`);

      const cfg = {
        provider: "Groq",
        key: activeKey,
        keyIndex: currentKeyIdx,
        totalKeys,
        model,
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { "Authorization": `Bearer ${activeKey}`, "Content-Type": "application/json" },
        body: {
          model,
          messages,
          temperature: 0,
          max_completion_tokens: maxTokens,
          max_tokens: maxTokens,
          reasoning_format: "raw"
        },
        deadlineMs: 90000, // 90s deadline: unrestricted thinking is never interrupted
        onChunk
      };

      const res = await callStream(cfg);
      if (res.ok && res.text) {
        chrome.storage.local.set({ lastGood: { GroqModel: model } }).catch(() => {});
        return {
          ok: true,
          text: res.text,
          keyIndex: currentKeyIdx,
          actualDisplayIndex,
          totalKeys
        };
      }

      console.warn(`[hs-3stage] Stage ${stageNum} failed on Key #${actualDisplayIndex}: ${res.error}`);
      if (isRateLimitError(res.error)) {
        markKeyRateLimited(activeKey);
      }

      currentKeyIdx = (currentKeyIdx + 1) % numKeys;
      attempts++;
    }

    return {
      ok: false,
      error: `All ${numKeys} Groq key(s) failed or rate-limited during Stage ${stageNum} (${stageName}).`
    };
  }

  // ── Stage 1: Visual Extraction & Problem Deconstruction ──
  const STAGE1_SYSTEM = `You are an Elite Problem Extraction & Visual Deconstruction Specialist.
Your SOLE task is to transcribe, formalize, and deconstruct the problem from the screenshot with 100% precision:
1. QUESTION TEXT: Transcribe the exact question text word-for-word.
2. SELECTOR TYPE: Explicitly note whether candidate options have SQUARE CHECKBOXES (☐ / [ ], multi-select) or CIRCULAR RADIO BUTTONS (○ / ( ), single choice).
3. GIVEN PARAMETERS & CONSTRAINTS:
   - Explicitly list every numerical value with its exact unit (e.g. km/h, m/s, hours, minutes, liters, $, %, ratio).
   - Flag any negative constraints or qualifying terms: NOT, EXCEPT, LEAST, MUST, CANNOT, NEITHER, BOTH, IF AND ONLY IF.
4. DIAGRAM / TABLE / DATA VISUALIZATION:
   - If there is a table, transcribe all rows, column headers, and cells.
   - If there is a diagram, code snippet, or figure, describe all labeled components and measurements.
5. TARGET VARIABLE: Identify precisely what the question asks for.
6. CANDIDATE OPTIONS: Transcribe each option letter (A, B, C, D, etc.) and complete text exactly as shown.
CRITICAL: Do NOT attempt to solve. Output ONLY the clean structured deconstruction.`;

  let stage1Stream = "";
  const s1DisplayIdx = ((keyInfo.activeIndex + stage1KeyIdx) % totalKeys) + 1;
  const stage1Res = await executeStage({
    stageNum: 1,
    stageName: "Visual Extraction",
    assignedKeyIdx: stage1KeyIdx,
    messages: [
      { role: "system", content: STAGE1_SYSTEM },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        { type: "text", text: buildUserPromptWithQuery("Extract and formalize the question, given values, units, options, and constraints from this image.", customQuery) }
      ]}
    ],
    maxTokens: 4096,
    statusMessage: "Extracting problem, constraints & diagram data…",
    onChunk: (chunk) => {
      stage1Stream = chunk;
      updateStreamingOverlay(`⚡ Stage 1/3 (Key #${s1DisplayIdx}/${totalKeys}): Extracting problem & constraints…\n\n${escapeHtml(stripThinkTags(stage1Stream))}`, "detailed");
    }
  });

  if (!stage1Res.ok) {
    showAnswerOverlay(`⚠️ Stage 1 Error:\n${stage1Res.error}`);
    return;
  }

  const stage1Text = stripThinkTags(stage1Res.text).trim();

  // ── Stage 2: Independent First-Principles Derivation (UNRESTRICTED THINKING) ──
  const domainPersona = getSubjectPersona(subject, dsaOptions);
  const STAGE2_SYSTEM = `${domainPersona}
You are an Elite Problem Solving & Pure Mathematical/Logical Deduction Specialist.
You are given the verified problem transcription from Stage 1 AND the original screenshot.
Your mandate is to derive the definitive solution from absolute first principles.

UNRESTRICTED THINKING PROTOCOL:
You have COMPLETE, UNRESTRICTED THINKING FREEDOM inside <think>...</think>. Take as many thinking tokens and thought steps as you want. Do not restrict, compress, or abbreviate your reasoning.
1. FORMULATION & UNITS:
   - State foundational formulas, laws, theorems, and definitions.
   - Explicitly harmonize all dimensional units (e.g. km/h to m/s, minutes to hours, currency, percentages).
   - If logic puzzle, sequence, or structure: construct the exact positional array, grid, or relational hierarchy.
   - If code/algorithm: trace invariants, memory complexity, pointer states, and edge conditions.
2. EXHAUSTIVE STEP-BY-STEP CALCULATION:
   - Calculate blind from first principles without looking at or biasing toward multiple-choice options.
   - Show all intermediate arithmetic, algebra, simplifications, and logic deductions explicitly.
   - Double-check arithmetic calculations, signs, fractions, and square roots.
3. VERIFICATION & SELF-CHECK:
   - Reverse-substitute your calculated result back into the problem statement to confirm every condition holds with zero contradiction.

OUTPUT FORMAT:
Conclude your deep thought process inside </think>, then OUTSIDE <think>, output strictly:
Derived Result: <exact calculated numeric value, equation, algorithm, or deduced identity>
Key Derivation Summary: <2-3 sentence crisp explanation of how this was proven>`;

  let stage2Stream = "";
  const s2DisplayIdx = ((keyInfo.activeIndex + stage2KeyIdx) % totalKeys) + 1;
  const stage2Res = await executeStage({
    stageNum: 2,
    stageName: "First-Principles Derivation",
    assignedKeyIdx: stage2KeyIdx,
    messages: [
      { role: "system", content: STAGE2_SYSTEM },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        { type: "text", text: `Here is the structured deconstruction from Stage 1:\n\n${stage1Text}\n\nSolve it from first principles. Take as much thought process as needed in <think> tags with zero restriction, and conclude with Derived Result: <exact answer>.` }
      ]}
    ],
    maxTokens: 4096,
    statusMessage: "Unrestricted deep reasoning from first principles…",
    onChunk: (chunk) => {
      stage2Stream = chunk;
      const clean = stripThinkTags(stage2Stream);
      const isThinking = stage2Stream.length > 0 && !clean;
      const tokenEst = Math.round(stage2Stream.length / 3.8);
      const msg = isThinking 
        ? `⚡ [Key #${s2DisplayIdx}/${totalKeys}] Stage 2/3: Unrestricted Deep Reasoning in progress… (~${tokenEst} thought tokens)`
        : `⚡ [Key #${s2DisplayIdx}/${totalKeys}] Stage 2/3: Derivation complete:\n\n${clean}`;
      updateStreamingOverlay(msg, "detailed");
    }
  });

  if (!stage2Res.ok) {
    showAnswerOverlay(`⚠️ Stage 2 Error:\n${stage2Res.error}`);
    return;
  }

  const stage2Text = stripThinkTags(stage2Res.text).trim();

  // ── Stage 3: Adversarial Trap Verification & Final Answer Formulation ──
  const STAGE3_SYSTEM = `You are a Principal Academic Examiner & Adversarial Distractor Auditor.
You are given:
1. The original question screenshot.
2. The structured extraction and candidate options from Stage 1.
3. The independent first-principles derivation from Stage 2.

YOUR MANDATE: AUDIT TRAPS & DELIVER THE DEFINITIVE FINAL ANSWER.
Inside <think>...</think>, audit with unrestricted depth:
1. ADVERSARIAL TRAP AUDIT:
   - Check every classic test-maker trap:
     * Question asking for initial vs final value vs change?
     * Diameter vs radius?
     * Markup % vs profit %?
     * Downstream vs upstream?
     * Total time vs additional/extra time?
     * Negative qualifiers: NOT, EXCEPT, LEAST, MUST, CANNOT BE TRUE, FALSE?
   - Compare Stage 2's derived result against the problem constraints to ensure no trap was missed.
2. OPTION RECONCILIATION:
   - Check selector markers in the image: SQUARE CHECKBOXES (☐ / [ ], multi-select) vs CIRCULAR RADIO BUTTONS (○ / ( ), single choice).
   - For single-choice: identify the ONE matching option and explicitly eliminate all distractors.
   - For multi-select: evaluate each candidate option independently and identify ALL correct options.

CRITICAL: THE USER ONLY WANTS THE DIRECT FINAL ANSWER.
Conclude inside </think>, then OUTSIDE <think> tags, respond strictly with:
${answerStyle === "mcq" ? `Why: <one crisp, complete sentence explaining why the selected answer is correct and avoids distractor traps>\nCorrect Option(s): <Option Letter(s)> — <full option text(s)> (e.g. "Option B — 45 km/h" or "Options A, C — ...")` :
answerStyle === "short" ? `Why: <one short line explaining why this answer is correct>\nFinal Answer: <the direct final answer>` :
`Output ONLY the pure, complete, optimal executable code without any comments, markdown formatting, explanations, or surrounding text.`}`;

  let stage3Stream = "";
  const s3DisplayIdx = ((keyInfo.activeIndex + stage3KeyIdx) % totalKeys) + 1;
  const stage3Res = await executeStage({
    stageNum: 3,
    stageName: "Trap Verification & Option Reconciliation",
    assignedKeyIdx: stage3KeyIdx,
    messages: [
      { role: "system", content: STAGE3_SYSTEM },
      { role: "user", content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        { type: "text", text: `Verify the derivation against the original question and candidate options in the image. Eliminate traps and provide the final answer:\n\n[STRUCTURED PROBLEM & OPTIONS FROM STAGE 1]:\n${stage1Text}\n\n[INDEPENDENT DERIVATION FROM STAGE 2]:\n${stage2Text}` }
      ]}
    ],
    maxTokens: 4096,
    statusMessage: "Auditing traps & finalizing answer…",
    onChunk: (chunk) => {
      stage3Stream = chunk;
      const clean = stripThinkTags(stage3Stream);
      const isThinking = stage3Stream.length > 0 && !clean;
      const tokenEst = Math.round(stage3Stream.length / 3.8);
      if (isThinking) {
        updateStreamingOverlay(`⚡ [Key #${s3DisplayIdx}/${totalKeys}] Stage 3/3: Adversarial Trap & Option Audit… (~${tokenEst} thought tokens)`, answerStyle);
      } else {
        updateStreamingOverlay(stage3Stream, answerStyle);
      }
    }
  });

  if (!stage3Res.ok) {
    showAnswerOverlay(`⚠️ Stage 3 Error:\n${stage3Res.error}`);
    return;
  }

  // Advance key index by 3 in background storage
  try {
    const res = await chrome.storage.local.get(["providerKeyIndices"]);
    const storedIndices = res.providerKeyIndices || {};
    storedIndices.Groq = ((storedIndices.Groq || 0) + (allKeys.length >= 3 ? 3 : allKeys.length)) % totalKeys;
    await chrome.storage.local.set({ providerKeyIndices: storedIndices });
  } catch (e) {}

  const cleanAnswer = stripThinkTags(stage3Res.text).trim();

  showAnswerOverlay(cleanAnswer, {
    style: answerStyle,
    autoSelect,
    meta: {
      provider: "Groq (🔬 3-Stage Unrestricted Engine)",
      keyIndex: stage3Res.keyIndex,
      totalKeys
    },
    isDerivation: forceStyle === "detailed"
  });
}


// ── Approach 2: Parallel Dual-Key Consensus Engine (~1.5s) ──
async function callAptitudeParallelDualKey(b64, { forceStyle, answerStyle, keys, customModel, lastGood, autoSelect, subject, customQuery, dsaOptions } = {}) {
  const groqKeysRaw = (keys || {}).Groq || "";
  const groqParsed = groqKeysRaw.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
  if (groqParsed.length === 0) {
    showAnswerOverlay(
      `⚠️ No Groq API key found!\n\n` +
      `👉 How to configure:\n` +
      `1. Click the extension icon in the Chrome toolbar.\n` +
      `2. Paste your Groq API key(s) in the Groq API Key box.\n` +
      `3. Click '💾 Save'.\n\n` +
      `💡 Get a free API key at https://console.groq.com/keys`
    );
    return;
  }

  const keyInfo = await getRotatedGroqKeys(keys);
  const allKeys = keyInfo.keys.length > 0 ? keyInfo.keys : groqParsed;
  const totalKeys = keyInfo.total || allKeys.length;
  const groqModels = getGroqVisionModels(customModel, lastGood.GroqModel);
  const model = groqModels[0] || "qwen/qwen3.8-27b";

  const key1 = allKeys[0];
  const key2 = allKeys.length > 1 ? allKeys[1] : allKeys[0];
  const key1Display = ((keyInfo.activeIndex) % totalKeys) + 1;
  const key2Display = allKeys.length > 1 ? (((keyInfo.activeIndex + 1) % totalKeys) + 1) : key1Display;

  console.log(`[hs-parallel] Running Dual-Key Engine: Worker 1 on Key #${key1Display}, Worker 2 on Key #${key2Display}`);
  showLoadingOverlay(`⚡ [Parallel Dual-Key] Solving & Auditing across Keys #${key1Display} & #${key2Display}…`);

  const domainPersona = getSubjectPersona(subject, dsaOptions);
  const SOLVER_SYSTEM = `${domainPersona}
Analyze the problem in the screenshot from absolute first principles:
1. Parse parameters, strict dimensional units, and explicit constraints.
2. Selector Check: Note whether options use SQUARE CHECKBOXES (☐ / [ ], multi-select) or CIRCULAR RADIO BUTTONS (○ / ( ), single choice).
3. Compute the exact solution blind from first principles with full arithmetic and logical rigor.
4. Output format:
Inside <think>...</think>, show the concise derivation (under 120 words).
Then OUTSIDE <think>, respond strictly with:
${answerStyle === "mcq" ? "Why: <one short line explaining the exact derivation>\nCorrect Option(s): <Option Letter(s)> — <full option text(s)>" : answerStyle === "short" ? "Why: <one short line>\nFinal Answer: <the direct final answer>" : "Output ONLY the pure, complete, optimal executable code without any comments, explanations, markdown formatting, or surrounding text."}`;

  const AUDITOR_SYSTEM = `You are an Elite Academic Examiner & Adversarial Distractor Auditor.
Analyze the problem in the screenshot to catch deceptive traps:
1. Trap Audit: Actively check for tricky pitfalls: diameter vs radius, downstream vs upstream, markup vs profit %, total time vs extra time, original vs final, and negative constraints (NOT, EXCEPT, LEAST, CANNOT, FALSE).
2. Selector Check: Verify if options have square checkboxes (☐ = multi-select) or circular radio buttons (○ = single choice).
3. Option Elimination: Test each candidate option directly against problem conditions and eliminate distractors.
4. Output format:
Inside <think>...</think>, audit traps and verify options concisely (under 120 words).
Then OUTSIDE <think>, respond strictly with:
${answerStyle === "mcq" ? "Why: <one short line explaining why this option avoids traps and is correct>\nCorrect Option(s): <Option Letter(s)> — <full option text(s)>" : answerStyle === "short" ? "Why: <one short line>\nFinal Answer: <the direct final answer>" : "Output ONLY the pure, complete, optimal executable code without any comments, explanations, markdown formatting, or surrounding text."}`;

  const userPrompt = answerStyle === "mcq" ?
    "Solve the question in this screenshot accurately. Check for square checkboxes (multi-select) vs radio buttons. Output Why and Correct Option(s)." :
    answerStyle === "short" ?
    "Solve the question in this screenshot accurately from first principles. Output Why and Final Answer." :
    "Solve the coding question in this screenshot accurately. Output ONLY the pure, complete executable code with zero comments, zero markdown ticks, and zero explanations.";

  let streamText1 = "";
  let streamText2 = "";
  let liveAnswerRendered = false;

  const onChunk1 = (text) => {
    streamText1 = text;
    if (!liveAnswerRendered) {
      updateStreamingOverlay(streamText1, answerStyle);
      const parts = parseAnswer(stripThinkTags(streamText1));
      if (parts.correct || parts.final) liveAnswerRendered = true;
    }
  };

  const onChunk2 = (text) => {
    streamText2 = text;
    if (!liveAnswerRendered) {
      updateStreamingOverlay(streamText2, answerStyle);
      const parts = parseAnswer(stripThinkTags(streamText2));
      if (parts.correct || parts.final) liveAnswerRendered = true;
    }
  };

  const maxTokens = (answerStyle === "detailed" || forceStyle === "detailed") ? 1200 : 650;

  // Launch BOTH calls at the exact same moment across the two distinct keys!
  const worker1Promise = callStream({
    provider: "Groq",
    key: key1,
    keyIndex: 0,
    totalKeys,
    model,
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: { "Authorization": `Bearer ${key1}`, "Content-Type": "application/json" },
    body: {
      model,
      messages: [
        { role: "system", content: SOLVER_SYSTEM },
        { role: "user", content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: "text", text: buildUserPromptWithQuery(userPrompt, customQuery) }
        ]}
      ],
      temperature: 0,
      max_completion_tokens: maxTokens,
      max_tokens: maxTokens,
      reasoning_format: "raw"
    },
    deadlineMs: 12000,
    onChunk: onChunk1
  });

  const worker2Promise = callStream({
    provider: "Groq",
    key: key2,
    keyIndex: allKeys.length > 1 ? 1 : 0,
    totalKeys,
    model,
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: { "Authorization": `Bearer ${key2}`, "Content-Type": "application/json" },
    body: {
      model,
      messages: [
        { role: "system", content: AUDITOR_SYSTEM },
        { role: "user", content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: "text", text: buildUserPromptWithQuery(userPrompt, customQuery) }
        ]}
      ],
      temperature: 0,
      max_completion_tokens: maxTokens,
      max_tokens: maxTokens,
      reasoning_format: "raw"
    },
    deadlineMs: 12000,
    onChunk: onChunk2
  });

  const [res1Result, res2Result] = await Promise.allSettled([worker1Promise, worker2Promise]);

  const res1 = res1Result.status === "fulfilled" ? res1Result.value : { ok: false, error: res1Result.reason?.message };
  const res2 = res2Result.status === "fulfilled" ? res2Result.value : { ok: false, error: res2Result.reason?.message };

  if (res1.ok) chrome.storage.local.set({ lastGood: { GroqModel: model } }).catch(() => {});
  if (!res1.ok && isRateLimitError(res1.error)) markKeyRateLimited(key1);
  if (!res2.ok && isRateLimitError(res2.error)) markKeyRateLimited(key2);

  if (!res1.ok && !res2.ok) {
    showAnswerOverlay(`⚠️ Dual-Key Error:\nWorker 1 (Key #${key1Display}): ${res1.error || "failed"}\nWorker 2 (Key #${key2Display}): ${res2.error || "failed"}`);
    return;
  }

  const clean1 = res1.ok ? stripThinkTags(res1.text) : "";
  const clean2 = res2.ok ? stripThinkTags(res2.text) : "";
  const parts1 = parseAnswer(clean1);
  const parts2 = parseAnswer(clean2);

  let chosenOutput = "";
  let consensus = false;

  const getOptLetter = (text) => {
    const m = String(text || "").match(/\b([A-E])\b/i);
    return m ? m[1].toUpperCase() : "";
  };

  const letter1 = getOptLetter(parts1.correct || parts1.final);
  const letter2 = getOptLetter(parts2.correct || parts2.final);

  if (res1.ok && res2.ok && letter1 && letter2 && letter1 === letter2) {
    consensus = true;
    chosenOutput = clean2 || clean1;
  } else if (res2.ok && (parts2.correct || parts2.final)) {
    chosenOutput = clean2;
  } else if (res1.ok && (parts1.correct || parts1.final)) {
    chosenOutput = clean1;
  } else {
    chosenOutput = clean2 || clean1 || "Could not parse answer.";
  }

  // Advance key index by 2 in background storage
  try {
    const res = await chrome.storage.local.get(["providerKeyIndices"]);
    const storedIndices = res.providerKeyIndices || {};
    storedIndices.Groq = ((storedIndices.Groq || 0) + (allKeys.length >= 2 ? 2 : 1)) % totalKeys;
    await chrome.storage.local.set({ providerKeyIndices: storedIndices });
  } catch (e) {}

  showAnswerOverlay(chosenOutput, {
    style: answerStyle,
    autoSelect,
    meta: {
      provider: consensus ? "Groq (⚡ Parallel Dual-Key Consensus)" : "Groq (⚡ Parallel Dual-Key)",
      keyIndex: 0,
      totalKeys
    },
    isDerivation: forceStyle === "detailed"
  });
}

// ── Approach 3: 2-Stage Pipeline (Solver ➔ Crosschecker) ──
async function callAptitudeDecoupledPipeline(b64, { forceStyle, answerStyle, keys, customModel, lastGood, autoSelect, subject, customQuery, dsaOptions } = {}) {
  const groqKeysRaw = (keys || {}).Groq || "";
  const groqParsed = groqKeysRaw.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
  if (groqParsed.length === 0) {
    showAnswerOverlay(
      `⚠️ No Groq API key found!\n\n` +
      `👉 How to configure:\n` +
      `1. Click the extension icon in the Chrome toolbar.\n` +
      `2. Paste your Groq API key(s) in the Groq API Key box.\n` +
      `3. Click '💾 Save'.\n\n` +
      `💡 Get a free API key at https://console.groq.com/keys`
    );
    return;
  }

  const keyInfo = await getRotatedGroqKeys(keys);
  const allKeys = keyInfo.keys.length > 0 ? keyInfo.keys : groqParsed;
  const totalKeys = keyInfo.total || allKeys.length;
  const groqModels = getGroqVisionModels(customModel, lastGood.GroqModel);
  const model = groqModels[0] || "qwen/qwen3.8-27b";

  // Distinct keys across the two stages
  const key1 = allKeys[0];
  const key2 = allKeys.length > 1 ? allKeys[1] : allKeys[0];
  const key1Display = ((keyInfo.activeIndex) % totalKeys) + 1;
  const key2Display = allKeys.length > 1 ? (((keyInfo.activeIndex + 1) % totalKeys) + 1) : key1Display;

  // ── STAGE 1: First-Principles Solver (Key 1) ──
  showLoadingOverlay(`⚡ [Key #${key1Display}/${totalKeys}] Stage 1/2: Solving question from first principles…`);

  const domainPersona = getSubjectPersona(subject, dsaOptions);
  const STAGE1_SOLVER_SYSTEM = `${domainPersona}
You are an Elite Problem Solver.
Analyze the problem in the screenshot and solve it directly from absolute first principles.

MANDATORY SOLVING PROTOCOL:
Solve the problem with complete rigor inside <think>...</think>:
1. QUESTION DECONSTRUCTION & UNITS:
   - Identify the exact question, all given values, and dimensional units.
   - Harmonize units explicitly (e.g. km/h to m/s, minutes to hours, currency, percentages).
   - Check option selector: SQUARE CHECKBOXES (☐ / [ ], multi-select) vs CIRCULAR RADIO BUTTONS (○ / ( ), single choice).
   - Note negative qualifiers: NOT, EXCEPT, LEAST, MUST, FALSE.
2. STEP-BY-STEP DERIVATION:
   - State foundational formulas and principles.
   - Show all intermediate arithmetic, algebra, or logical deduction steps clearly.
3. PRELIMINARY ANSWER:
   - State the derived result and identify the matching candidate option.

OUTPUT FORMAT:
Conclude inside </think>, then OUTSIDE <think>, provide:
Derived Solution:
<step-by-step derivation and calculations>

Preliminary Answer:
${answerStyle === "mcq" ? "Option(s): <Option Letter(s)> — <full option text(s)>" : answerStyle === "short" ? "Final Answer: <the calculated result>" : "Output ONLY the pure, complete executable code without any comments, markdown formatting, or surrounding text."}`;

  let stage1Stream = "";
  const onChunkStage1 = (chunk) => {
    stage1Stream = chunk;
    const clean = stripThinkTags(stage1Stream);
    const isThinking = stage1Stream.length > 0 && !clean;
    const tokenEst = Math.round(stage1Stream.length / 3.8);
    const msg = isThinking 
      ? `⚡ [Key #${key1Display}/${totalKeys}] Stage 1/2: Solving from first principles… (~${tokenEst} thought tokens)`
      : `⚡ [Key #${key1Display}/${totalKeys}] Stage 1/2: Solution generated:\n\n${clean}`;
    updateStreamingOverlay(msg, "detailed");
  };

  let stage1Res = await callStream({
    provider: "Groq",
    key: key1,
    keyIndex: 0,
    totalKeys,
    model,
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: { "Authorization": `Bearer ${key1}`, "Content-Type": "application/json" },
    body: {
      model,
      messages: [
        { role: "system", content: STAGE1_SOLVER_SYSTEM },
        { role: "user", content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: "text", text: buildUserPromptWithQuery("Solve this question directly from first principles. Show the step-by-step derivation and state the preliminary answer clearly.", customQuery) }
        ]}
      ],
      temperature: 0,
      max_completion_tokens: 3500,
      max_tokens: 3500,
      reasoning_format: "raw"
    },
    deadlineMs: 45000,
    onChunk: onChunkStage1
  });

  if (!stage1Res.ok) {
    if (isRateLimitError(stage1Res.error)) markKeyRateLimited(key1);
    if (allKeys.length > 1) {
      console.warn(`[hs-2stage] Stage 1 failed on Key #${key1Display}, failing over to Key #${key2Display}...`);
      stage1Res = await callStream({
        provider: "Groq",
        key: key2,
        keyIndex: 1,
        totalKeys,
        model,
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { "Authorization": `Bearer ${key2}`, "Content-Type": "application/json" },
        body: {
          model,
          messages: [
            { role: "system", content: STAGE1_SOLVER_SYSTEM },
            { role: "user", content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
              { type: "text", text: "Solve this question directly from first principles. Show the step-by-step derivation and state the preliminary answer clearly." }
            ]}
          ],
          temperature: 0,
          max_completion_tokens: 3500,
          max_tokens: 3500,
          reasoning_format: "raw"
        },
        deadlineMs: 45000,
        onChunk: onChunkStage1
      });
    }
  }

  if (!stage1Res.ok || !stage1Res.text) {
    showAnswerOverlay(`⚠️ Stage 1 Solve Error:\n${stage1Res.error || "Failed to solve problem."}`);
    return;
  }

  const stage1Text = stripThinkTags(stage1Res.text).trim();

  // ── STAGE 2: Adversarial Crosschecker & Trap Auditor (Key 2) ──
  showLoadingOverlay(`⚡ [Key #${key2Display}/${totalKeys}] Stage 2/2: Crosschecking derivation & traps…`);

  const STAGE2_CROSSCHECK_SYSTEM = `You are a Principal Academic Examiner & Adversarial Crosschecker.
You are given:
1. The original question screenshot.
2. The preliminary solution and answer derived by Solver in Stage 1.

YOUR MANDATE: CROSSCHECK & ADVERSARIALLY VERIFY THE SOLUTION.
Inside <think>...</think>, audit the solution with rigorous depth:
1. ARITHMETIC & CALCULATION AUDIT:
   - Re-calculate every mathematical operation independently from the image pixels.
   - Did Stage 1 make any arithmetic slip, sign mistake, rounding error, or unit conversion error?
2. TRAP & DISTRACTOR AUDIT:
   - Did the question ask for initial vs final value? Diameter vs radius? Markup vs profit %? Downstream vs upstream? Total time vs extra time?
   - Did Stage 1 miss negative qualifiers (NOT, EXCEPT, LEAST, CANNOT BE TRUE, FALSE)?
   - For multi-select square checkboxes (☐ / [ ]), verify whether multiple options are correct.
   - For single-choice radio buttons (○ / ( )), eliminate all distractors.
3. VERDICT:
   - If Stage 1 was correct: validate it with 100% certainty.
   - If Stage 1 made an error: correct the derivation and supply the true answer.

OUTPUT FORMAT:
Conclude inside </think>, then OUTSIDE <think>, respond strictly with:
${answerStyle === "mcq" ? `Why: <one crisp, definitive sentence explaining why this verified answer is correct and avoids traps>\nCorrect Option(s): <Option Letter(s)> — <full option text(s)> (e.g. "Option B — 45 km/h" or "Options A, C — ...")` :
  answerStyle === "short" ? `Why: <one crisp sentence>\nFinal Answer: <the direct final answer>` :
  `Output ONLY the pure, verified, executable code with zero explanations, zero comments, and zero surrounding text.`}`;

  let stage2Stream = "";
  const onChunkStage2 = (chunk) => {
    stage2Stream = chunk;
    const clean = stripThinkTags(stage2Stream);
    const isThinking = stage2Stream.length > 0 && !clean;
    const tokenEst = Math.round(stage2Stream.length / 3.8);
    if (isThinking) {
      updateStreamingOverlay(`⚡ [Key #${key2Display}/${totalKeys}] Stage 2/2: Crosschecking & Auditing traps… (~${tokenEst} thought tokens)`, answerStyle);
    } else {
      updateStreamingOverlay(stage2Stream, answerStyle);
    }
  };

  let stage2Res = await callStream({
    provider: "Groq",
    key: key2,
    keyIndex: allKeys.length > 1 ? 1 : 0,
    totalKeys,
    model,
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: { "Authorization": `Bearer ${key2}`, "Content-Type": "application/json" },
    body: {
      model,
      messages: [
        { role: "system", content: STAGE2_CROSSCHECK_SYSTEM },
        { role: "user", content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: "text", text: `Here is the preliminary solution and answer derived by Solver in Stage 1:\n\n${stage1Text}\n\nCrosscheck this solution against the screenshot. Re-calculate every step independently, audit for test-maker traps, verify all options, and output the final verified answer.` }
        ]}
      ],
      temperature: 0,
      max_completion_tokens: 3500,
      max_tokens: 3500,
      reasoning_format: "raw"
    },
    deadlineMs: 45000,
    onChunk: onChunkStage2
  });

  if (!stage2Res.ok) {
    if (isRateLimitError(stage2Res.error)) markKeyRateLimited(key2);
    if (allKeys.length > 1) {
      console.warn(`[hs-2stage] Stage 2 failed on Key #${key2Display}, failing over to Key #${key1Display}...`);
      stage2Res = await callStream({
        provider: "Groq",
        key: key1,
        keyIndex: 0,
        totalKeys,
        model,
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { "Authorization": `Bearer ${key1}`, "Content-Type": "application/json" },
        body: {
          model,
          messages: [
            { role: "system", content: STAGE2_CROSSCHECK_SYSTEM },
            { role: "user", content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
              { type: "text", text: `Here is the preliminary solution and answer derived by Solver in Stage 1:\n\n${stage1Text}\n\nCrosscheck this solution against the screenshot. Re-calculate every step independently, audit for test-maker traps, verify all options, and output the final verified answer.` }
            ]}
          ],
          temperature: 0,
          max_completion_tokens: 3500,
          max_tokens: 3500,
          reasoning_format: "raw"
        },
        deadlineMs: 45000,
        onChunk: onChunkStage2
      });
    }
  }

  // Advance persistent key indices by 2 in background storage
  try {
    const res = await chrome.storage.local.get(["providerKeyIndices"]);
    const storedIndices = res.providerKeyIndices || {};
    storedIndices.Groq = ((storedIndices.Groq || 0) + (allKeys.length >= 2 ? 2 : 1)) % totalKeys;
    await chrome.storage.local.set({ providerKeyIndices: storedIndices });
  } catch (e) {}

  chrome.storage.local.set({ lastGood: { GroqModel: model } }).catch(() => {});

  if (stage2Res.ok && stage2Res.text) {
    const cleanAnswer = stripThinkTags(stage2Res.text).trim();
    showAnswerOverlay(cleanAnswer, {
      style: answerStyle,
      autoSelect,
      meta: {
        provider: "Groq (🎯 2-Stage Solve ➔ Crosscheck)",
        keyIndex: 1,
        totalKeys
      },
      isDerivation: forceStyle === "detailed"
    });
  } else {
    // If Stage 2 completely failed, fall back to Stage 1 solution!
    showAnswerOverlay(stage1Text, {
      style: answerStyle,
      autoSelect,
      meta: {
        provider: "Groq (Stage 1 Solver - Crosscheck failed)",
        keyIndex: 0,
        totalKeys
      },
      isDerivation: forceStyle === "detailed"
    });
  }
}


// ── Call AI API (Orchestrator with Multi-Approach Dispatching) ─
async function callAPI(b64, { forceStyle, customQuery } = {}) {
  const loadingStatus = customQuery
    ? "Refining with README / custom query…"
    : forceStyle === "detailed" ? "Generating step-by-step derivation..." : "Solving question...";
  if (forceStyle === "detailed") {
    currentDotExpanded = true;
  } else {
    currentDotExpanded = false;
    pendingAnswerPayload = null;
  }

  if (!isContextValid()) {
    showAnswerOverlay("Extension reloaded. Please refresh this page (F5) to continue.");
    return;
  }

  let keys, style, models, subject, lastGood, autoSelect, globalApproach, subjectApproaches, quickApproach, dsaLanguage, dsaOptimize, dsaFormat;
  try {
    const data = await chrome.storage.local.get([
      "keys", "style", "models", "subject", "lastGood", "autoSelect", "dotMode", "dotSize", "dotOpacity", "hsDotPos",
      "globalApproach", "subjectApproaches", "quickApproach",
      "dsaLanguage", "dsaOptimize", "dsaFormat"
    ]);
    if (data.dotMode !== undefined) currentDotMode = !!data.dotMode;
    if (data.dotSize !== undefined) currentDotSize = Number(data.dotSize);
    if (data.dotOpacity !== undefined) currentDotOpacity = Number(data.dotOpacity);
    if (data.hsDotPos) savedDotPos = data.hsDotPos;

    keys = data.keys;
    style = data.style;
    models = data.models;
    subject = data.subject;
    lastGood = data.lastGood || {};
    if (lastGood.GroqModel && DEPRECATED_GROQ_MODELS.has(lastGood.GroqModel)) {
      lastGood.GroqModel = undefined;
      chrome.storage.local.set({ lastGood: { ...lastGood, GroqModel: undefined } }).catch(() => {});
    }
    autoSelect = !!data.autoSelect;
    globalApproach = data.globalApproach || "normal";
    subjectApproaches = data.subjectApproaches || {};
    quickApproach = data.quickApproach || "global";
    dsaLanguage = data.dsaLanguage || currentQuickSettings.dsaLanguage;
    dsaOptimize = data.dsaOptimize || currentQuickSettings.dsaOptimize;
    dsaFormat = data.dsaFormat || currentQuickSettings.dsaFormat;

    currentQuickSettings = {
      style: style || currentQuickSettings.style,
      subject: subject || currentQuickSettings.subject,
      globalApproach: globalApproach || currentQuickSettings.globalApproach,
      autoSelect: autoSelect !== undefined ? autoSelect : currentQuickSettings.autoSelect,
      dsaLanguage,
      dsaOptimize,
      dsaFormat
    };
  } catch (e) {
    showAnswerOverlay("Extension context invalidated. Please refresh this page (F5).");
    return;
  }

  const dsaOptions = { dsaLanguage, dsaOptimize, dsaFormat };

  showLoadingOverlay(loadingStatus);

  let customModel = (models || {})["Groq"] || "";
  if (DEPRECATED_GROQ_MODELS.has(customModel)) {
    customModel = "";
  }
  const answerStyle = forceStyle || style || "detailed";

  // Normalize subject identifier
  const subjectKey = (subject === "logical-reasoning") ? "aptitude-reasoning" : (subject || "auto");

  // Determine Effective Reasoning Approach:
  // 1. Quick popup override (if not "global")
  // 2. Domain-specific setting (if not "global")
  // 3. Global approach setting (default: "normal")
  let effectiveApproach = (quickApproach && quickApproach !== "global") ? quickApproach : null;
  if (!effectiveApproach) {
    const custom = (subjectApproaches || {})[subjectKey];
    if (custom && custom !== "global") {
      effectiveApproach = custom;
    }
  }
  if (!effectiveApproach) {
    effectiveApproach = globalApproach || "normal";
  }

  console.log(`[hs] Subject: "${subjectKey}", Effective Approach: "${effectiveApproach}", Query: "${customQuery || ''}"`);

  // Dispatch to chosen approach engine
  if (effectiveApproach === "parallel-dual") {
    await callAptitudeParallelDualKey(b64, {
      forceStyle,
      answerStyle,
      keys,
      customModel,
      lastGood,
      autoSelect,
      subject: subjectKey,
      customQuery,
      dsaOptions
    });
    return;
  }

  if (effectiveApproach === "decoupled-2stage") {
    await callAptitudeDecoupledPipeline(b64, {
      forceStyle,
      answerStyle,
      keys,
      customModel,
      lastGood,
      autoSelect,
      subject: subjectKey,
      customQuery,
      dsaOptions
    });
    return;
  }

  if (effectiveApproach === "sequential-3stage") {
    await callAptitudeSequential3Stage(b64, {
      forceStyle,
      answerStyle,
      keys,
      customModel,
      lastGood,
      autoSelect,
      subject: subjectKey,
      customQuery,
      dsaOptions
    });
    return;
  }

  // ── Fall-through: Normal Single-Pass Engine (~1.2s) ──
  const domainIntro = getSubjectPersona(subjectKey, dsaOptions);


  const reasoningProtocol = `
TWO-STEP REASONING PROTOCOL:
Solve the problem in two disciplined steps inside <think>...</think> tags:
<think>
Step 1 (Deconstruct & Solve):
- Check selector markers: SQUARE CHECKBOXES (☐ / [ ]) denote a MULTI-SELECT question where one, multiple, or all options can be correct. CIRCULAR RADIO BUTTONS (○ / ( )) denote a SINGLE-CHOICE question (strictly one correct choice).
- Parse parameters, constraints (NOT, EXCEPT, LEAST, TRUE, FALSE), and compute the exact solution from first principles.
Step 2 (Verify & Finalize): Sanity check against all options. For single choice, verify the singular correct choice and eliminate distractors. For multi-select, evaluate each option independently and identify ALL valid correct options.
</think>
CRITICAL CONSTRAINT: Keep internal reasoning CONCISE (under 120 words). Do NOT ramble. Conclude with </think> immediately upon verifying the answer, then output the final answer outside <think>.
`;

  const isBackend = subjectKey === "backend-dev";

  const systemPrompts = {
    detailed: isBackend
      ? `${domainIntro}\n${reasoningProtocol}\nCRITICAL BACKEND CODE PROTOCOL:
You are in Backend Systems Mode.
Analyze the project file tree and README context thoroughly.
STRICT NEGATIVE CONSTRAINTS:
- ZERO plain English explanations before or after (do NOT say 'Now open file X and edit line Y').
- ZERO conversational filler.
- Output production-ready, complete code for EVERY required file across all directories.
- For each file, you MUST use the standard delimiter:
### FILE: <relative/path/to/file>
followed by the complete code enclosed in triple backticks.
- All code must start at column 0 with strict 4-space indentation and zero tabs.`
      : `${domainIntro}\n${reasoningProtocol}\nCRITICAL CODE-ONLY INSTRUCTION:
You are in Pure Code Mode.
If the screenshot contains ANY coding question, algorithm, function, method, class, SQL query, script, or program:
Output ONLY the 100% complete, working, optimal code in the requested or implied language (Python, C++, Java, JS, etc.).
STRICT NEGATIVE CONSTRAINTS:
- ZERO English explanations before or after.
- ZERO markdown code block ticks (do NOT wrap in \`\`\` or \`\`\`python).
- ZERO comments inside or outside the code.
- ZERO test cases, usage examples, or time complexity analysis.
- Output ONLY the pure, directly runnable source code!
For non-coding questions: output ONLY the direct final code or numerical answer with zero conversational filler.`,
    short: `${domainIntro}\n${reasoningProtocol}\nCODING INSTRUCTION: If this is a coding question, output ONLY the pure code outside <think> tags with zero comments and zero explanations. Otherwise, outside <think> tags, respond with EXACTLY two lines and nothing else:\nWhy: <one short line explaining why this answer is correct>\nFinal Answer: <the direct final answer>`,
    mcq: `${domainIntro}\n${reasoningProtocol}\nMCQ INSTRUCTION: Execute Step 1 and Step 2 inside <think> tags. Check if options are square checkboxes (multi-select / select all that apply) or circular radio buttons (single choice). Then, OUTSIDE <think> tags, respond with EXACTLY two lines and nothing else:\nWhy: <one short line summarizing why the selected option(s) are correct>\nCorrect Option(s): <Option Letter(s)> — <full option text(s)> (For multi-select, list all correct options, e.g. "Options B, C — [Option B text] | [Option C text]")`
  };

  const userPrompts = {
    detailed: isBackend
      ? buildUserPromptWithQuery("Analyze the question, file system tree, and README in this screenshot. Follow the Two-Step Reasoning protocol internally in <think>...</think> concisely. Outside <think>, do NOT write plain English conversational steps. Output production-ready code for all required files using '### FILE: <relative/path/to/file>' so the entire project can be updated in one command.", customQuery)
      : buildUserPromptWithQuery("Solve the question in this screenshot. Follow the Two-Step Reasoning protocol internally in <think>...</think> concisely. Outside <think>, output ONLY the complete executable code with NO comments, NO markdown ticks, and NO explanations. Pure code only.", customQuery),
    short: buildUserPromptWithQuery("Solve the question in this screenshot. Follow the Two-Step Reasoning protocol internally in <think>...</think> concisely. If this is a coding problem, output ONLY the code without comments or text. Otherwise outside <think>, output exactly two lines: Why: <explanation> and Final Answer: <the answer>.", customQuery),
    mcq: buildUserPromptWithQuery("Solve the question in this screenshot. Follow the Two-Step Reasoning protocol internally in <think>...</think> concisely. Check if the options have square checkboxes (multi-select / select all that apply) or circular radio buttons (single choice). Outside <think>, output exactly two lines: Why: <explanation> and Correct Option(s): <Letter(s)> — <full text>.", customQuery)
  };

  // Output token budget: 4096 tokens for multi-file/detailed code generation, 750 for short/mcq
  const maxTokensMap = {
    mcq: 750,
    short: 750,
    detailed: 4096
  };

  const groqKeysRaw = (keys || {}).Groq || "";
  const groqParsed = groqKeysRaw.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
  if (groqParsed.length === 0) {
    showAnswerOverlay(
      `⚠️ No Groq API key found!\n\n` +
      `👉 How to configure:\n` +
      `1. Click the extension icon in the Chrome toolbar.\n` +
      `2. Paste your Groq API key(s) (starts with gsk_...) in the Groq API Key box.\n` +
      `3. Click '💾 Save' (or '✂️ Start Snipping Now').\n\n` +
      `💡 Get a free API key at https://console.groq.com/keys`
    );
    return;
  }

  // Build candidate configs list using persistent round-robin key rotation for Groq
  const candidateConfigs = [];
  const keyInfo = await getRotatedGroqKeys(keys);
  const groqModels = getGroqVisionModels(customModel, lastGood.GroqModel);

  for (const m of groqModels) {
    keyInfo.keys.forEach((k, idx) => {
      const actualKeyIdx = (keyInfo.activeIndex + idx) % keyInfo.total;
      candidateConfigs.push({
        provider: "Groq",
        key: k,
        keyIndex: actualKeyIdx,
        totalKeys: keyInfo.total,
        model: m,
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { "Authorization": `Bearer ${k}`, "Content-Type": "application/json" },
        body: {
          model: m,
          messages: [
            { role: "system", content: systemPrompts[answerStyle] },
            { role: "user", content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
              { type: "text", text: userPrompts[answerStyle] }
            ]}
          ],
          temperature: 0,
          max_completion_tokens: maxTokensMap[answerStyle] || 750,
          max_tokens: maxTokensMap[answerStyle] || 750,
          reasoning_format: "raw"
        }
      });
    });
  }

  if (candidateConfigs.length === 0) {
    showAnswerOverlay("No Groq API key found. Open the extension and add your key(s) in Settings.");
    return;
  }

  // ── requestAnimationFrame Streaming Throttling ──
  // Groq streams tokens at blazing speeds (300+ token/s). Direct DOM updates on
  // every raw chunk trigger micro-stutters and main-thread layout thrashing.
  // We buffer streaming text and sync repaints with the display refresh cycle.
  let rafId = null;
  let isStreamActive = true;
  let latestStreamText = "";
  const paintChunk = (partialText) => {
    if (!isStreamActive) return;
    latestStreamText = partialText;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isStreamActive && latestStreamText) {
          updateStreamingOverlay(latestStreamText, answerStyle);
        }
      });
    }
  };
  const stopStreamPainting = () => {
    isStreamActive = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
  const flushChunk = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (isStreamActive && latestStreamText) {
      updateStreamingOverlay(latestStreamText, answerStyle);
    }
  };

  // Phase 1: Try primary rotated key with a 10s first-token deadline
  const primaryCfg = candidateConfigs[0];
  console.log(`[hs] Requesting Groq using Key #${(primaryCfg.keyIndex ?? 0) + 1}/${primaryCfg.totalKeys}`);
  const phase1 = await callStream({ ...primaryCfg, deadlineMs: 10000, onChunk: paintChunk });
  flushChunk();

  if (phase1.ok) {
    stopStreamPainting();
    chrome.storage.local.set({ lastGood: { GroqModel: primaryCfg.model } });
    showAnswerOverlay(phase1.text, {
      style: answerStyle,
      truncated: phase1.truncated,
      autoSelect,
      meta: { provider: "Groq", keyIndex: primaryCfg.keyIndex, totalKeys: primaryCfg.totalKeys },
      isDerivation: forceStyle === "detailed"
    });
    return;
  }

  // If primary key failed due to rate limiting (HTTP 429), place it on 60s cooldown
  if (isRateLimitError(phase1.error)) {
    markKeyRateLimited(primaryCfg.key);
  }

  const isGlobalModelUnavailable = (err) => /decommissioned/i.test(err || "");

  if (isGlobalModelUnavailable(phase1.error)) {
    chrome.storage.local.remove(["lastGood"]).catch(() => {});
  }

  // Phase 2: Sequential fallback across remaining keys — NO parallel token blasting!
  let remainingConfigs = candidateConfigs.slice(1);
  if (isGlobalModelUnavailable(phase1.error)) {
    console.warn(`[hs] Model ${primaryCfg.model} globally unavailable on Groq (${phase1.error}). Skipping it for remaining keys.`);
    remainingConfigs = remainingConfigs.filter(cfg => cfg.model !== primaryCfg.model);
  }

  if (remainingConfigs.length === 0) {
    if (/blocked at the organization level/i.test(phase1.error || "")) {
      showAnswerOverlay(
        "⚠️ Groq Organization Model Restriction (HTTP 403)\n\n" +
        `The model \`${primaryCfg.model}\` is currently blocked in your Groq organization settings.\n\n` +
        "👉 How to fix in Groq:\n" +
        "1. Open https://console.groq.com/settings/limits\n" +
        "2. Find \"Model Permissions\" / \"Limits\"\n" +
        `3. Enable \`${primaryCfg.model}\` (or set Model Access to Allow All)\n` +
        "4. Save changes"
      );
    } else {
      showAnswerOverlay(`Error: ${phase1.error || "Groq API call failed"}`);
    }
    return;
  }

  showLoadingOverlay(loadingStatus);
  const errors = [`Key #${(primaryCfg.keyIndex ?? 0) + 1} (${primaryCfg.model}): ${phase1.error || "unknown"}`];

  for (let i = 0; i < remainingConfigs.length; i++) {
    const fallbackCfg = remainingConfigs[i];

    // Smart 60-second backoff: Skip keys known to be rate-limited
    if (isKeyCoolingDown(fallbackCfg.key)) {
      console.log(`[hs] Skipping Key #${(fallbackCfg.keyIndex ?? 0) + 1} (cooling down after HTTP 429).`);
      errors.push(`Key #${(fallbackCfg.keyIndex ?? 0) + 1} (${fallbackCfg.model}): Skipped (rate-limited, cooling down)`);
      continue;
    }

    console.log(`[hs] Primary failed. Sequential fallback trying Key #${(fallbackCfg.keyIndex ?? 0) + 1}/${fallbackCfg.totalKeys}...`);
    const res = await callStream({ ...fallbackCfg, deadlineMs: 12000, onChunk: paintChunk });
    flushChunk();

    if (res.ok) {
      stopStreamPainting();
      chrome.storage.local.set({ lastGood: { GroqModel: fallbackCfg.model } });
      if (typeof fallbackCfg.keyIndex === "number") {
        try {
          const stored = await chrome.storage.local.get(["providerKeyIndices"]);
          const idxs = stored.providerKeyIndices || {};
          idxs.Groq = fallbackCfg.keyIndex;
          await chrome.storage.local.set({ providerKeyIndices: idxs });
        } catch (e) {}
      }
      showAnswerOverlay(res.text, {
        style: answerStyle,
        truncated: res.truncated,
        autoSelect,
        meta: { provider: "Groq", keyIndex: fallbackCfg.keyIndex, totalKeys: fallbackCfg.totalKeys, fallback: true },
        isDerivation: forceStyle === "detailed"
      });
      return;
    }

    // Rate-limit tracking for fallback key
    if (isRateLimitError(res.error)) {
      markKeyRateLimited(fallbackCfg.key);
    }

    errors.push(`Key #${(fallbackCfg.keyIndex ?? 0) + 1} (${fallbackCfg.model}): ${res.error || "failed"}`);

    if (isGlobalModelUnavailable(res.error)) {
      chrome.storage.local.remove(["lastGood"]).catch(() => {});
      console.warn(`[hs] Model ${fallbackCfg.model} globally unavailable on Groq (${res.error}). Skipping it for remaining keys.`);
      remainingConfigs = remainingConfigs.filter((cfg, idx) => idx <= i || cfg.model !== fallbackCfg.model);
    }
  }

  const isOrgBlocked = errors.some(e => /blocked at the organization level/i.test(e));
  const orgNote = isOrgBlocked ? "\n\n⚠️ Note: Groq organization model restriction detected (HTTP 403). Ensure models (qwen/qwen3.8-27b) are enabled at https://console.groq.com/settings/limits." : "";

  const first = errors.slice(0, 4).join("\n");
  console.warn("[hs] All fallbacks failed:\n" + errors.join("\n"));
  showAnswerOverlay(
    "All Groq API key fallbacks failed.\n\nTried:\n" + first +
    (errors.length > 4 ? `\n...and ${errors.length - 4} more` : "") +
    orgNote +
    "\n\nCheck your Groq API keys, model names, and network. Full details in the console (F12)."
  );
}

function rescueAnswerFromText(text) {
  if (!text) return "";
  // Strip opening/closing tag tokens so we can read the raw words
  const raw = text.replace(/<\/?\s*(?:think|scratchpad|thought|reasoning)[^>]*>/gi, "");
  const lines = raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return "";

  // 1. Check if the model actually wrote Why / Correct Option / Final Answer inside the block
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (/^(?:correct\s+)?(?:option|answer)\s*:/i.test(l) || /^final\s+answer\s*:/i.test(l)) {
      const whyLine = lines.slice(0, i).reverse().find(x => /^why\s*:/i.test(x));
      if (whyLine) {
        return `${whyLine}\n${l}`;
      }
      return `Why: Deduced from step-by-step reasoning.\n${l}`;
    }
  }

  // 2. Search for explicit conclusion patterns near the end of text
  // e.g., "Option (B)", "Option B is correct", "correct answer is B", "choose C"
  const concludingMatch = raw.match(/(?:therefore|thus|hence|conclude|conclusion|correct\s+option|correct\s+answer|answer\s+is|choose|select)\s*(?:is|:)?\s*(?:\(?([A-D])\)?|\b([A-D])\b)(?:\s*[\:\—\-]\s*(.+))?/i);
  if (concludingMatch) {
    const letter = (concludingMatch[1] || concludingMatch[2]).toUpperCase();
    const detail = concludingMatch[3] ? concludingMatch[3].trim() : "";
    const optText = detail ? `Option ${letter} — ${detail}` : `Option ${letter}`;
    return `Why: Deduced from problem steps.\nCorrect Option: ${optText}`;
  }

  // 3. Look for standalone "Option [A-D]" in the last 5 lines
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const m = lines[i].match(/\b(?:Option|Ans)\s*[\(\[]?([A-D])[\)\]]?\b/i);
    if (m) {
      return `Why: Deduced from calculations.\nCorrect Option: Option ${m[1].toUpperCase()}`;
    }
  }

  // 4. Return the last 3 meaningful calculation/deduction lines so the user sees the solution
  return lines.slice(-3).join("\n");
}

function stripThinkTags(text) {
  if (!text) return "";
  // 1. Remove cleanly closed <think>...</think> blocks
  let clean = text.replace(/<\s*(?:think|scratchpad|thought|reasoning)[^>]*>[\s\S]*?<\/\s*(?:think|scratchpad|thought|reasoning)\s*>/gi, "");

  // 2. Check for an unclosed <think> tag (e.g. if cut off mid-thought)
  if (/<\s*(?:think|scratchpad|thought|reasoning)[^>]*>/i.test(clean)) {
    const beforeUnclosed = clean.replace(/<\s*(?:think|scratchpad|thought|reasoning)[^>]*>[\s\S]*/gi, "").trim();
    if (beforeUnclosed.length > 0) {
      return beforeUnclosed;
    }
    // If output started with <think> and was cut off without closing, rescue the answer from inside the block
    return rescueAnswerFromText(text);
  }

  return clean.trim();
}

// Pull the required lines (Why / Correct Option / Final Answer) out of a model
// response, tolerating wording variations, hanging headers, and markdown formatting.
function parseAnswer(text) {
  const parts = { why: "", correct: "", final: "", extra: [] };
  const rawLines = String(text || "").split("\n");

  let currentSection = null;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].trim();
    if (!raw) continue;

    // Flexible regex matching:
    // 1. Why / Explanation / Reasoning
    const whyMatch = raw.match(/^(?:[#*\-\d.]+\s*)?(?:\*{0,2})(?:why|explanation|reasoning|rationale|justification)\s*(?:\*{0,2})\s*[:\-—]\s*(.*)$/i);
    // 2. Correct Option / Choice / Correct Answer
    const correctMatch = raw.match(/^(?:[#*\-\d.]+\s*)?(?:\*{0,2})(?:the\s+)?(?:correct\s+)?(?:options?|answers?|choice|correct)\s*(?:\([sS]\))?\s*(?:\*{0,2})\s*(?::|is|\—|\-)\s*(.*)$/i);
    // 3. Final Answer / Result
    const finalMatch = raw.match(/^(?:[#*\-\d.]+\s*)?(?:\*{0,2})(?:final\s+answer|final\s+result|result)\s*(?:\*{0,2})\s*(?::|is|\—|\-)\s*(.*)$/i);

    if (whyMatch) {
      currentSection = "why";
      const val = whyMatch[1].replace(/^\*\*|\*\*$/g, "").trim();
      if (val) parts.why = parts.why ? `${parts.why} ${val}` : val;
    } else if (correctMatch) {
      currentSection = "correct";
      const val = correctMatch[1].replace(/^\*\*|\*\*$/g, "").trim();
      if (val) parts.correct = parts.correct ? `${parts.correct} ${val}` : val;
    } else if (finalMatch) {
      currentSection = "final";
      const val = finalMatch[1].replace(/^\*\*|\*\*$/g, "").trim();
      if (val) parts.final = parts.final ? `${parts.final} ${val}` : val;
    } else {
      // Continuation lines for hanging headers or multi-line values
      const unbold = raw.replace(/^[\s#*>\-\d.]+\s*/, "").replace(/^\*\*|\*\*$/g, "").trim();
      if (currentSection === "why" && !parts.why) {
        parts.why = unbold;
      } else if (currentSection === "why" && parts.why && !raw.startsWith("#")) {
        parts.why += " " + unbold;
      } else if (currentSection === "correct" && !parts.correct) {
        parts.correct = unbold;
      } else if (currentSection === "final" && !parts.final) {
        parts.final = unbold;
      } else {
        currentSection = null;
        parts.extra.push(raw);
      }
    }
  }

  // Fallback: If correct option is missing from parsed lines, scan text for explicit option markers
  if (!parts.correct) {
    const optMatch = text.match(/(?:(?:option|choice|answer)\s+([A-D1-4])\b|^([A-D])[\.\)]\s+)/im);
    if (optMatch) {
      parts.correct = (optMatch[1] || optMatch[2] || "").toUpperCase();
    }
  }

  return parts;
}

// ── Overlay Position & Dragging Helpers ────────────
function saveCurrentOverlayPosition(el) {
  const target = el || document.getElementById("hs-answer-overlay");
  if (!target) return;
  const rect = target.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    savedOverlayPos = {
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    };
    try {
      if (isContextValid() && chrome.storage?.local) {
        chrome.storage.local.set({ hsOverlayPos: savedOverlayPos });
      }
    } catch (e) {}
  }
}

function getOverlayPosition(overlayEl) {
  const defaultWidth = 340;
  const defaultHeight = 240;
  const margin = 20;

  let left = margin;
  let top = window.innerHeight - defaultHeight - margin;

  if (savedOverlayPos && typeof savedOverlayPos.left === "number" && typeof savedOverlayPos.top === "number") {
    left = savedOverlayPos.left;
    top = savedOverlayPos.top;
  }

  const elWidth = (overlayEl && overlayEl.offsetWidth) || defaultWidth;
  const elHeight = (overlayEl && overlayEl.offsetHeight) || defaultHeight;

  const maxLeft = Math.max(10, window.innerWidth - elWidth - 10);
  const maxTop = Math.max(10, window.innerHeight - elHeight - 10);

  left = Math.max(10, Math.min(left, maxLeft));
  top = Math.max(10, Math.min(top, maxTop));

  return { left, top };
}

function applyOverlayPosition(box) {
  if (!box) return;
  const pos = getOverlayPosition(box);
  box.style.left = `${pos.left}px`;
  box.style.top = `${pos.top}px`;
  box.style.bottom = "auto";
  box.style.right = "auto";
}

function makeDraggable(box) {
  if (!box) return;

  const onMouseDown = (e) => {
    if (e.target.closest("button, input, select, textarea, a")) return;

    const rect = box.getBoundingClientRect();
    const isTopHead = (e.clientY - rect.top <= 28);
    const isNearEdge = (
      e.clientX - rect.left <= 12 ||
      rect.right - e.clientX <= 12 ||
      rect.bottom - e.clientY <= 12
    );
    const isDragHandle = !!e.target.closest("#hs-drag-bar, .hs-drag-handle");

    // Only allow drag when cursor is on head, corners, or drag bar
    if (!isTopHead && !isNearEdge && !isDragHandle) {
      return; // Allows full text selection inside the content!
    }

    e.preventDefault();

    box.style.cursor = "grabbing";
    box.style.willChange = "left, top";
    document.body.style.userSelect = "none";

    const startBoxX = rect.left;
    const startBoxY = rect.top;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const boxW = box.offsetWidth || rect.width;
    const boxH = box.offsetHeight || rect.height;
    const maxLeft = Math.max(0, window.innerWidth - boxW);
    const maxTop = Math.max(0, window.innerHeight - boxH);

    let dragRaf = null;
    let pendingLeft = startBoxX;
    let pendingTop = startBoxY;

    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;

      pendingLeft = Math.max(0, Math.min(startBoxX + deltaX, maxLeft));
      pendingTop = Math.max(0, Math.min(startBoxY + deltaY, maxTop));

      if (!dragRaf) {
        dragRaf = requestAnimationFrame(() => {
          dragRaf = null;
          box.style.left = `${pendingLeft}px`;
          box.style.top = `${pendingTop}px`;
          box.style.bottom = "auto";
          box.style.right = "auto";
        });
      }
    };

    const onMouseUp = () => {
      if (dragRaf) {
        cancelAnimationFrame(dragRaf);
        dragRaf = null;
        box.style.left = `${pendingLeft}px`;
        box.style.top = `${pendingTop}px`;
      }
      box.style.cursor = "";
      box.style.willChange = "auto";
      document.body.style.userSelect = "";
      saveCurrentOverlayPosition(box);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove, { passive: false });
    document.addEventListener("mouseup", onMouseUp);
  };

  box.addEventListener("mousemove", (e) => {
    if (e.target.closest("button, input, select, textarea, a")) {
      box.style.cursor = "default";
      return;
    }
    const rect = box.getBoundingClientRect();
    const isTopHead = (e.clientY - rect.top <= 28);
    const isNearEdge = (
      e.clientX - rect.left <= 12 ||
      rect.right - e.clientX <= 12 ||
      rect.bottom - e.clientY <= 12
    );
    const isDragHandle = !!e.target.closest("#hs-drag-bar, .hs-drag-handle");

    if (isTopHead || isNearEdge || isDragHandle) {
      box.style.cursor = "grab";
    } else {
      box.style.cursor = "text";
    }
  }, { passive: true });

  box.addEventListener("mousedown", onMouseDown);
}

// ── Clipboard & Answer Extraction Helpers ──────────
function copyToClipboard(text) {
  if (!text) return Promise.resolve(false);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => {
      return fallbackCopyText(text);
    });
  } else {
    return Promise.resolve(fallbackCopyText(text));
  }
}

function fallbackCopyText(text) {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    return false;
  }
}

function extractPureCode(text) {
  if (!text) return "";
  let clean = stripThinkTags(text).trim();

  // If wrapped in markdown code fence (```lang ... ```), extract the inner content
  const codeBlockMatch = clean.match(/```(?:[a-zA-Z0-9_\-\+]*\s*\n)?([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    clean = codeBlockMatch[1];
  }

  // Remove any remaining stray leading/trailing fences
  clean = clean.replace(/^```[a-zA-Z0-9_\-\+]*\n?/, "").replace(/\n?```$/, "");

  // Strip conversational intros if the model started with "Here is the code:"
  clean = clean.replace(/^(?:Here\s+(?:is|are)\s+(?:the\s+)?(?:complete\s+|pure\s+)?code\b[^\n]*\n*|Solution\s*:|Code\s*:)\s*/i, "");

  // Strip conversational outro if present (e.g. "Hope this helps!", "Complexity: O(N)")
  clean = clean.replace(/\n+(?:Complexity|Time Complexity|Space Complexity|Explanation|Notes?):[\s\S]*$/i, "");

  return clean.trim();
}

function sanitizeCodeFormatting(text) {
  if (!text) return "";
  // Strip think tags preserving code indentation
  let code = text.replace(/<\s*(?:think|scratchpad|thought|reasoning)[^>]*>[\s\S]*?<\/\s*(?:think|scratchpad|thought|reasoning)\s*>/gi, "");
  if (/<\s*(?:think|scratchpad|thought|reasoning)[^>]*>/i.test(code)) {
    code = code.replace(/<\s*(?:think|scratchpad|thought|reasoning)[^>]*>[\s\S]*/gi, "");
  }

  // 1. Normalize Windows CRLF to clean LF
  code = code.replace(/\r\n/g, "\n");

  // If wrapped in markdown code fence (```lang ... ```), extract the inner content
  const codeBlockMatch = code.match(/```(?:[a-zA-Z0-9_\-\+]*\s*\n)?([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    code = codeBlockMatch[1];
  }

  // Remove any remaining stray leading/trailing fences
  code = code.replace(/^```[a-zA-Z0-9_\-\+]*\n?/, "").replace(/\n?```$/, "");

  // Strip conversational intros if the model started with "Here is the code:"
  code = code.replace(/^(?:[ \t]*(?:Here\s+(?:is|are)\s+(?:the\s+)?(?:complete\s+|pure\s+)?code\b[^\n]*\n*|Solution\s*:|Code\s*:)\s*)/i, "");

  // Strip conversational outro if present (e.g. "Hope this helps!", "Complexity: O(N)")
  code = code.replace(/\n+(?:Complexity|Time Complexity|Space Complexity|Explanation|Notes?):[\s\S]*$/i, "");

  // Remove leading blank lines
  code = code.replace(/^\n+/, "");

  // 2. Expand all tabs to 4 spaces to eliminate tab/space collision
  code = code.replace(/\t/g, "    ");

  // 3. Automated Dedent: find minimum indentation across non-empty lines
  const lines = code.split("\n");
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const leading = line.match(/^ */)[0].length;
    if (leading < minIndent) minIndent = leading;
  }

  // Strip common baseline indentation
  const cleanLines = (minIndent > 0 && minIndent !== Infinity)
    ? lines.map(line => line.length >= minIndent ? line.slice(minIndent) : line)
    : lines;

  // 4. Trim trailing whitespace from each line
  return cleanLines.map(line => line.trimEnd()).join("\n").trim();
}

// ── Dynamic Multi-File Backend Architecture Parser ──
function parseMultiFiles(text) {
  if (!text) return [];
  const clean = stripThinkTags(text);
  const files = [];
  const seenPaths = new Set();

  // Pattern 1: Delimited file blocks with markdown code blocks:
  // e.g., ### FILE: src/app.js ```javascript ... ``` or ## File: ... or // File: ...
  const fileBlockRegex = /(?:^|\n)(?:#{1,4}\s*(?:FILE|File)|(?:\/\/|#)\s*(?:FILE|File)):\s*`?([^\n`]+)`?\s*\n+```(?:[a-zA-Z0-9_\-\+]*\s*\n)?([\s\S]*?)```/g;
  let match;
  while ((match = fileBlockRegex.exec(clean)) !== null) {
    const rawPath = match[1].trim().replace(/^['"]|['"]$/g, "");
    const rawCode = match[2];
    const sanitizedCode = sanitizeCodeFormatting(rawCode);
    if (rawPath && sanitizedCode && !seenPaths.has(rawPath)) {
      seenPaths.add(rawPath);
      files.push({
        path: rawPath,
        code: sanitizedCode
      });
    }
  }

  // Pattern 2: Bash cat << 'EOF' > path/to/file blocks (if model outputs raw bash commands)
  if (files.length === 0) {
    const bashCatRegex = /cat\s+<<\s*['"]?([A-Za-z0-9_-]+)['"]?\s*>\s*["']?([^"'\n\r]+)["']?\s*\n([\s\S]*?)\n\1/g;
    while ((match = bashCatRegex.exec(clean)) !== null) {
      const rawPath = match[2].trim().replace(/^['"]|['"]$/g, "");
      const rawCode = match[3];
      const sanitizedCode = sanitizeCodeFormatting(rawCode);
      if (rawPath && sanitizedCode && !seenPaths.has(rawPath)) {
        seenPaths.add(rawPath);
        files.push({
          path: rawPath,
          code: sanitizedCode
        });
      }
    }
  }

  return files;
}

function generateTerminalScript(files) {
  if (!files || files.length === 0) return "";
  let script = "#!/usr/bin/env bash\n# Generated by Homework Solver — 1-Shot Project File Generator\nset -e\n\n";

  // 1. Auto-navigate to project root from any subdirectory
  script += "# 1. Auto-navigate to project root from any subdirectory\n";
  script += "if git rev-parse --show-toplevel >/dev/null 2>&1; then\n";
  script += "  cd \"$(git rev-parse --show-toplevel)\"\n";
  script += "elif [ -f \"../package.json\" ] || [ -f \"../../package.json\" ] || [ -f \"../requirements.txt\" ] || [ -f \"../../requirements.txt\" ]; then\n";
  script += "  while [ ! -f \"package.json\" ] && [ ! -f \"requirements.txt\" ] && [ ! -f \"go.mod\" ] && [ ! -f \"Cargo.toml\" ] && [ \"$PWD\" != \"/\" ]; do\n";
  script += "    cd ..\n";
  script += "  done\n";
  script += "fi\n\n";

  const dirs = new Set();
  for (const f of files) {
    const parts = f.path.split("/");
    if (parts.length > 1) {
      parts.pop();
      dirs.add(parts.join("/"));
    }
  }
  if (dirs.size > 0) {
    script += `mkdir -p ${Array.from(dirs).map(d => `"${d}"`).join(" ")}\n\n`;
  }
  for (const f of files) {
    script += `cat << 'EOF' > "${f.path}"\n${f.code}\nEOF\n\n`;
  }
  script += `echo "✅ Successfully created and updated all ${files.length} project files!"\n`;
  return script.trim();
}

function getCleanAnswerOnly(rawText, parts, answerStyle) {
  if (answerStyle === "detailed") {
    return extractPureCode(rawText);
  }
  let target = "";
  if (parts) {
    if (parts.correct) {
      target = parts.correct;
    } else if (parts.final) {
      target = parts.final;
    }
  }

  if (!target && rawText) {
    const p = parseAnswer(rawText);
    if (p.correct) target = p.correct;
    else if (p.final) target = p.final;
    else target = rawText;
  }

  if (!target) return "";

  let clean = target.trim();

  // Strip markdown code block wrapper if present
  const codeBlockMatch = clean.match(/^```[a-zA-Z0-9_\-\+]*\s*\n([\s\S]*?)\n```$/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // Strip option prefixes like: "Option B — Photosynthesis", "B) 42 kg", "(C) Mitochondria", "1. Glucose", "Option A: Red", "[B] London"
  const optionWithTextMatch = clean.match(/^(?:(?:Option|Ans|Answer)\s*)?[\(\[]?([A-Za-z0-9])[\)\]\:\.\—\-\s]+(.+)$/i);
  if (optionWithTextMatch && optionWithTextMatch[2] && optionWithTextMatch[2].trim().length > 0) {
    return optionWithTextMatch[2].trim();
  }

  // Handle single option letter cases like "Option B", "Answer: C", "(A)", "[B]"
  const letterOnlyMatch = clean.match(/^(?:(?:Option|Ans|Answer)\s*[\:\—\-]?\s*)?[\(\[]?([A-Za-z0-9])[\)\]]?$/i);
  if (letterOnlyMatch && letterOnlyMatch[1]) {
    return letterOnlyMatch[1].trim();
  }

  return clean;
}

// ── Streaming Live Overlay Painter ─────────────────
function updateStreamingOverlay(partialText, style) {
  if (currentDotMode && !currentDotExpanded) {
    return;
  }
  let box = document.getElementById("hs-answer-overlay");
  // GUARD: If the overlay has already transitioned to a final solution view,
  // NEVER allow lingering streaming chunks to overwrite it!
  if (box && (box.querySelector("#hs-solution-view") || box.querySelector(".hs-card") || box.querySelector(".hs-backend-suite") || box.querySelector("#hs-search-input"))) {
    return;
  }
  let isNew = false;
  if (!box) {
    box = document.createElement("div");
    box.id = "hs-answer-overlay";
    isNew = true;
  }

  const cleanPartial = stripThinkTags(partialText);

  let liveBody;
  if (style === "mcq" || style === "short") {
    const parts = parseAnswer(cleanPartial);
    const found = [];
    if (parts.why) found.push(`Why: ${parts.why}`);
    if (parts.correct) found.push(`Correct Option: ${parts.correct}`);
    if (parts.final) found.push(`Final Answer: ${parts.final}`);

    if (found.length) {
      liveBody = escapeHtml(found.join("\n\n"));
    } else {
      const lower = partialText.toLowerCase();
      if (lower.includes("step 2") || lower.includes("verif")) {
        liveBody = "⚡ Step 2: Verifying options & eliminating distractors…";
      } else if (lower.includes("<think") || lower.includes("step 1") || lower.includes("deconstruct") || lower.includes("reason")) {
        liveBody = "⚡ Step 1: Deconstructing question & solving from first principles…";
      } else {
        liveBody = "Reading question & solving…";
      }
    }
  } else if (style === "detailed") {
    if (cleanPartial) {
      const pureCode = extractPureCode(cleanPartial);
      liveBody = `<pre style="margin: 0; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-all;">${escapeHtml(pureCode || cleanPartial)}</pre>`;
    } else {
      liveBody = "⚡ Writing optimized code…";
    }
  } else {
    if (cleanPartial) {
      liveBody = escapeHtml(cleanPartial);
    } else {
      const lower = partialText.toLowerCase();
      if (lower.includes("step 2") || lower.includes("verif")) {
        liveBody = "⚡ Step 2: Verifying solution…";
      } else {
        liveBody = "⚡ Step 1: Solving problem step-by-step…";
      }
    }
  }

  const inp = getAnswerEffectiveInp();
  const currentLeft = box.style.left;
  const currentTop = box.style.top;
  const blurVal = getAnswerBoxBlurCss();

  if (currentAnswerStealthMode) {
    box.classList.add("hs-stealth-mode");
  } else {
    box.classList.remove("hs-stealth-mode");
  }

  box.style.cssText = `
    position: fixed;
    ${currentLeft ? `left: ${currentLeft};` : ''}
    ${currentTop ? `top: ${currentTop};` : ''}
    bottom: auto;
    right: auto;
    width: ${currentAnswerWidth}px;
    max-height: 420px;
    z-index: 9999999;
    background: ${getAnswerBoxBg(inp)};
    backdrop-filter: ${blurVal};
    -webkit-backdrop-filter: ${blurVal};
    border: ${getAnswerBoxBorderCss(inp)};
    border-radius: ${currentAnswerBorderRadius}px;
    box-shadow: ${inp.overlayShadow};
    padding: 10px 14px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: ${inp.overlayTextPrimary};
    overflow-y: auto;
    box-sizing: border-box;
    scrollbar-width: none;
    -ms-overflow-style: none;
    user-select: text;
    -webkit-user-select: text;
    transform: translateZ(0);
    contain: layout style;
  `;

  if (isNew || !currentLeft || !currentTop) {
    document.body.appendChild(box);
    applyOverlayPosition(box);
  }

  const hasHistory = answerHistory && answerHistory.length > 0;
  const backBtnHtml = hasHistory ? `
    <button id="hs-stream-back-btn" title="Back to Previous Answer" style="
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 7px; font-size: 10px; font-weight: 600; font-family: inherit;
      border-radius: 4px; border: 1px solid ${inp.cardBorder};
      background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer;
      margin-right: 4px; transition: opacity 0.12s ease;
    ">← Back</button>
  ` : "";

  box.innerHTML = `
    <div id="hs-popup-header" style="
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 6px; padding-bottom: 4px;
      border-bottom: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)};
      user-select: none; gap: 6px;
    ">
      <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
        <div id="hs-drag-bar" style="
          display: ${currentAnswerDragBar ? 'flex' : 'none'};
          align-items: center; gap: 4px; cursor: grab; padding: 2px 6px; border-radius: 4px;
          background: ${colorWithAlpha(inp.cardBg, 0.6)}; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.4)};
          font-size: 10px; font-weight: 700; color: ${inp.cardLabel}; letter-spacing: 0.3px;
        ">
          <span style="opacity: 0.6; font-size: 11px;">⠿</span>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${style === 'detailed' ? '💻 Generating Code Solution…' : '⚡ Solving…'}</span>
        </div>
        ${backBtnHtml}
      </div>
      <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
        <button id="hs-close" title="Close" style="
          width: 24px; height: 24px;
          background: transparent; color: ${inp.overlayTextMuted}; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)};
          border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'};
          transition: opacity 0.12s ease, transform 0.1s ease;
        ">✕</button>
      </div>
    </div>
    <div style="padding-top: 2px; white-space: pre-wrap; line-height: 1.45; font-size: ${currentAnswerFontSize}px; color: ${inp.overlayTextPrimary}; user-select: text; -webkit-user-select: text; cursor: text;">${liveBody}</div>
    <style>
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
      #hs-close:hover, #hs-stream-back-btn:hover { opacity: 1 !important; }
      #hs-close:active, #hs-stream-back-btn:active { transform: scale(0.92); }
    </style>
  `;

  makeDraggable(box);
  const streamCloseBtn = document.getElementById("hs-close");
  if (streamCloseBtn) streamCloseBtn.onclick = removeExistingOverlay;
  const streamBackBtn = document.getElementById("hs-stream-back-btn");
  if (streamBackBtn) {
    streamBackBtn.onclick = (e) => {
      e.stopPropagation();
      const prev = answerHistory.pop();
      if (prev) {
        showAnswerOverlay(prev.answer, prev.options);
      }
    };
  }
}

// ── Discreet Floating Dot Engine ───────────────────
function applyDotOptics(dotEl) {
  if (!dotEl) return;
  const size = typeof currentDotSize === "number" ? Math.max(0, currentDotSize) : 11;
  const op = typeof currentDotOpacity === "number" ? Math.max(0, Math.min(100, currentDotOpacity)) : 50;
  dotEl.style.setProperty("--hs-dot-size", `${size}px`);
  dotEl.style.setProperty("--hs-dot-opacity", `${op / 100}`);
}

function showDotOverlay({ state = "solving", status = "Solving question...", pendingAnswer = null } = {}) {
  // Save position of existing box if any, and remove it
  const oldBox = document.getElementById("hs-answer-overlay");
  if (oldBox) {
    saveCurrentOverlayPosition(oldBox);
    oldBox.remove();
  }

  if (pendingAnswer) {
    pendingAnswerPayload = pendingAnswer;
    lastAnswerPayload = pendingAnswer;
  }
  isDotHidden = false;

  let dot = document.getElementById("hs-dot-trigger");
  if (dot) {
    dot.style.display = "block";
  } else {
    dot = document.createElement("div");
    dot.id = "hs-dot-trigger";

    if (!document.getElementById("hs-dot-styles")) {
      const styleEl = document.createElement("style");
      styleEl.id = "hs-dot-styles";
      styleEl.textContent = `
        #hs-dot-trigger {
          --hs-dot-size: 11px;
          --hs-dot-opacity: 0.5;
          position: fixed;
          width: var(--hs-dot-size);
          height: var(--hs-dot-size);
          border-radius: 50%;
          background: #1e293b;
          opacity: var(--hs-dot-opacity);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 1px 2px rgba(0, 0, 0, 0.2);
          z-index: 2147483647;
          cursor: pointer;
          display: block;
          box-sizing: border-box;
          user-select: none;
          -webkit-user-select: none;
          transform: translateZ(0);
          transition: opacity 0.2s ease, transform 0.15s ease, width 0.15s ease, height 0.15s ease;
        }
        #hs-dot-trigger::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 22px;
          height: 22px;
          min-width: 22px;
          min-height: 22px;
          border-radius: 50%;
        }
        #hs-dot-trigger:hover {
          transform: scale(1.3);
          opacity: calc(var(--hs-dot-opacity) + 0.35) !important;
        }
        #hs-dot-trigger:active {
          transform: scale(0.9);
          opacity: calc(var(--hs-dot-opacity) + 0.4) !important;
        }
        #hs-dot-trigger.hs-dot-solving {
          background: #1e293b;
          animation: hsDotSolvingPulse 1.4s infinite ease-in-out;
        }
        @keyframes hsDotSolvingPulse {
          0%, 100% { opacity: calc(var(--hs-dot-opacity) * 0.45); }
          50% { opacity: var(--hs-dot-opacity); }
        }
        #hs-dot-trigger.hs-dot-ready {
          background: #1e293b;
          opacity: var(--hs-dot-opacity);
        }
        #hs-dot-trigger.hs-dot-error {
          background: #1e293b;
          opacity: calc(var(--hs-dot-opacity) * 0.8);
          animation: hsDotErrorShake 0.3s ease;
        }
        @keyframes hsDotErrorShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        #hs-dot-trigger.hs-dot-stealth {
          background: #1e293b !important;
          opacity: calc(var(--hs-dot-opacity) * 0.5) !important;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
          animation: none !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    let left = 24;
    let top = window.innerHeight - 30;
    if (savedDotPos && typeof savedDotPos.left === "number" && typeof savedDotPos.top === "number") {
      left = Math.max(6, Math.min(savedDotPos.left, window.innerWidth - 18));
      top = Math.max(6, Math.min(savedDotPos.top, window.innerHeight - 18));
    } else if (savedOverlayPos && typeof savedOverlayPos.left === "number" && typeof savedOverlayPos.top === "number") {
      left = Math.max(6, Math.min(savedOverlayPos.left, window.innerWidth - 18));
      top = Math.max(6, Math.min(savedOverlayPos.top, window.innerHeight - 18));
    }

    dot.style.left = `${left}px`;
    dot.style.top = `${top}px`;
    dot.innerHTML = "";

    // ── Mouse Drag & Click Handling ──
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = left;
    let initialTop = top;

    const onMouseMove = (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (!isDragging && Math.hypot(dx, dy) > 4) {
        isDragging = true;
      }
      if (isDragging) {
        const curLeft = Math.max(6, Math.min(initialLeft + dx, window.innerWidth - 18));
        const curTop = Math.max(6, Math.min(initialTop + dy, window.innerHeight - 18));
        dot.style.left = `${curLeft}px`;
        dot.style.top = `${curTop}px`;
      }
    };

    const onMouseUp = (e) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (isDragging) {
        const rect = dot.getBoundingClientRect();
        savedDotPos = { left: Math.round(rect.left), top: Math.round(rect.top) };
        try {
          if (isContextValid() && chrome.storage?.local) {
            chrome.storage.local.set({ hsDotPos: savedDotPos });
          }
        } catch (err) {}
      } else {
        // Genuine click -> expand answer pop-up
        expandAnswerFromDot();
      }
    };

    dot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // left click only
      isDragging = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = dot.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    // Right-click dismisses dot
    dot.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeExistingOverlay();
    });

    document.body.appendChild(dot);
  }

  // Apply current size & opacity CSS custom properties
  applyDotOptics(dot);

  // Update status and styling
  dot.className = "";
  if (currentAnswerStealthMode) {
    dot.classList.add("hs-dot-stealth");
  }

  if (state === "ready") {
    dot.classList.add("hs-dot-ready");
    dot.title = "Answer ready! Click to pop up (Right-click or Alt+D to dismiss)";
  } else if (state === "error") {
    dot.classList.add("hs-dot-error");
    dot.title = `⚠️ ${status} (Click to pop up)`;
  } else {
    dot.classList.add("hs-dot-solving");
    dot.title = `${status} (Click to pop up)`;
  }
}

function expandAnswerFromDot() {
  currentDotExpanded = true;
  isDotHidden = false;
  const dot = document.getElementById("hs-dot-trigger");
  if (dot) {
    const rect = dot.getBoundingClientRect();
    savedOverlayPos = {
      left: Math.max(10, Math.min(Math.round(rect.left), window.innerWidth - currentAnswerWidth - 10)),
      top: Math.max(10, Math.min(Math.round(rect.top), window.innerHeight - 300))
    };
    dot.remove();
  }

  const payload = pendingAnswerPayload || lastAnswerPayload;
  if (payload) {
    showAnswerOverlay(payload.answer, payload.options);
  } else {
    showLoadingOverlay(lastLoadingStatus || "Solving question...");
  }
}

// ── Toggle / Minimize & Restore via Alt+D Shortcut ──
function toggleOverlayAndDot() {
  const overlay = document.getElementById("hs-answer-overlay");
  const dot = document.getElementById("hs-dot-trigger");

  // State 1: Answer Overlay is currently visible -> Minimize to floating dot
  if (overlay && overlay.style.display !== "none") {
    saveCurrentOverlayPosition(overlay);
    overlay.remove();
    currentDotExpanded = false;
    isDotHidden = false;
    const payloadToKeep = lastAnswerPayload || pendingAnswerPayload;
    showDotOverlay({
      state: "ready",
      status: "Answer minimized (Click or Alt+D to expand)",
      pendingAnswer: payloadToKeep
    });
    return;
  }

  // State 2: Dot exists and is visible -> Hide dot completely
  if (dot && dot.style.display !== "none" && !isDotHidden) {
    dot.style.display = "none";
    isDotHidden = true;
    return;
  }

  // State 3: Dot exists and is hidden -> Reshow dot
  if (dot && isDotHidden) {
    dot.style.display = "block";
    applyDotOptics(dot);
    isDotHidden = false;
    return;
  }

  // State 4: Neither overlay nor dot in DOM -> Recreate dot with last known answer
  if (lastAnswerPayload || pendingAnswerPayload) {
    isDotHidden = false;
    currentDotExpanded = false;
    showDotOverlay({
      state: "ready",
      status: "Answer ready (Click or Alt+D to expand)",
      pendingAnswer: lastAnswerPayload || pendingAnswerPayload
    });
    return;
  }

  // State 5: Fallback idle dot
  isDotHidden = false;
  showDotOverlay({
    state: "ready",
    status: "Homework Solver (Alt+C to snip)",
    pendingAnswer: null
  });
}

// ── Loading overlay ────────────────────────────────
function showLoadingOverlay(statusText = "Solving question...") {
  lastLoadingStatus = statusText;
  if (currentDotMode && !currentDotExpanded) {
    showDotOverlay({ state: "solving", status: statusText });
    return;
  }
  removeExistingOverlay();
  const inp = getAnswerEffectiveInp();
  const box = document.createElement("div");
  box.id = "hs-answer-overlay";
  if (currentAnswerStealthMode) {
    box.classList.add("hs-stealth-mode");
  }
  const blurVal = getAnswerBoxBlurCss();
  box.style.cssText = `
    position: fixed;
    width: ${Math.min(currentAnswerWidth, 310)}px;
    z-index: 9999999;
    background: ${getAnswerBoxBg(inp)};
    backdrop-filter: ${blurVal};
    -webkit-backdrop-filter: ${blurVal};
    border: ${getAnswerBoxBorderCss(inp)};
    border-radius: ${currentAnswerBorderRadius}px;
    box-shadow: ${inp.overlayShadow};
    padding: 10px 14px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: ${currentAnswerFontSize}px;
    color: ${inp.overlayTextPrimary};
    box-sizing: border-box;
    scrollbar-width: none;
    -ms-overflow-style: none;
    user-select: text;
    -webkit-user-select: text;
    transform: translateZ(0);
    contain: layout style;
  `;
  const hasHistory = answerHistory && answerHistory.length > 0;
  const backBtnHtml = hasHistory ? `
    <button id="hs-loading-back-btn" title="Back to Previous Answer" style="
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 7px; font-size: 10px; font-weight: 600; font-family: inherit;
      border-radius: 4px; border: 1px solid ${inp.cardBorder};
      background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer;
      margin-right: 4px; transition: opacity 0.12s ease;
    ">← Back</button>
  ` : "";

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)};">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div id="hs-drag-bar" style="display: ${currentAnswerDragBar ? 'block' : 'none'}; cursor: grab; font-size: 10px; font-weight: 700; color: ${inp.cardLabel};">⠿ Drag</div>
        ${backBtnHtml}
      </div>
      <button id="hs-close" title="Close" style="
        width: 24px; height: 24px;
        background: transparent; color: ${inp.overlayTextMuted}; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)};
        border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'};
        transition: opacity 0.12s ease, transform 0.1s ease;
      ">✕</button>
    </div>
    <div style="display: flex; align-items: center; gap: 9px; padding-right: 4px; user-select: text; -webkit-user-select: text; cursor: text;">
      <div style="width: 14px; height: 14px; border: 2px solid ${inp.spinnerColor}; border-top-color: transparent; border-radius: 50%; animation: hsSpin 0.8s linear infinite; flex-shrink: 0;"></div>
      <span style="font-size: ${currentAnswerFontSize}px; font-weight: 600; color: ${inp.overlayTextPrimary};">${escapeHtml(statusText)}</span>
    </div>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600;1,700&family=Playfair+Display:ital,wght@1,600;1,700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap');
      @keyframes hsSpin { to { transform: rotate(360deg); } }
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
      #hs-close:hover, #hs-loading-back-btn:hover { opacity: 1 !important; }
      #hs-close:active, #hs-loading-back-btn:active { transform: scale(0.88); }
    </style>
  `;
  document.body.appendChild(box);
  applyOverlayPosition(box);
  makeDraggable(box);
  const loadingCloseBtn = document.getElementById("hs-close");
  if (loadingCloseBtn) loadingCloseBtn.onclick = removeExistingOverlay;
  const loadingBackBtn = document.getElementById("hs-loading-back-btn");
  if (loadingBackBtn) {
    loadingBackBtn.onclick = (e) => {
      e.stopPropagation();
      const prev = answerHistory.pop();
      if (prev) {
        showAnswerOverlay(prev.answer, prev.options);
      }
    };
  }
}

// ── Auto-select MCQ / MSQ option on webpage DOM ───────────
function extractOptionTargets(rawText) {
  if (!rawText) return [];
  const targets = [];
  const lines = rawText.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    // Check if line contains multiple letters like "Options B, C — ...", "Options B and C", "B, C"
    const multiLetterMatch = line.match(/(?:Options?|Ans(?:wer)?s?)\s*[:\—\-]?\s*([A-D1-4](?:\s*[,&/and]+\s*[A-D1-4])+)/i);
    if (multiLetterMatch) {
      const letters = multiLetterMatch[1].match(/[A-D1-4]/gi) || [];
      const remainder = line.slice(multiLetterMatch[0].length).replace(/^[\s\:\—\-]+/, "").trim();
      const contentParts = remainder.split(/[\/|;]+/).map(s => s.trim());
      letters.forEach((l, idx) => {
        targets.push({
          letter: l.toUpperCase(),
          content: (contentParts[idx] || remainder || "").toLowerCase()
        });
      });
      continue;
    }

    // Try single option pattern: "Option B — some text"
    const singleMatch = line.match(/^(?:Options?\s*)?([A-D1-4])\b[\s\)\.\:\—\-]*([\s\S]*)$/i);
    if (singleMatch) {
      targets.push({
        letter: singleMatch[1].toUpperCase(),
        content: (singleMatch[2] || "").trim().toLowerCase()
      });
    } else {
      targets.push({
        letter: "",
        content: line.toLowerCase()
      });
    }
  }

  // Deduplicate
  const unique = [];
  const seen = new Set();
  for (const t of targets) {
    const key = t.letter ? `letter_${t.letter}` : `content_${t.content}`;
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  }
  return unique.length ? unique : [{ letter: "", content: rawText.trim().toLowerCase() }];
}

function selectOptionOnPage(optionText) {
  if (!optionText) return { success: false, total: 0, count: 0 };
  
  const targets = extractOptionTargets(optionText);
  if (!targets.length) return { success: false, total: 0, count: 0 };

  const triggerClick = (el) => {
    try {
      // Do not re-click already checked checkboxes to avoid unchecking them!
      if (el.tagName === "INPUT" && el.type === "checkbox") {
        if (el.checked) return true;
      } else if (el.getAttribute("aria-checked") === "true") {
        return true;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.click();
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch(e) {
      return false;
    }
  };

  let successCount = 0;
  const clickedElements = new Set();

  for (const target of targets) {
    const letter = target.letter;
    const answerContent = target.content;

    const isMatch = (txt) => {
      txt = (txt || "").trim().toLowerCase();
      if (!txt) return false;
      
      // Match by content
      if (answerContent && answerContent.length > 2) {
        if (txt.includes(answerContent) || answerContent.includes(txt)) {
          return true;
        }
      }
      
      // Match by letter
      if (letter) {
        if (txt.startsWith(`(${letter.toLowerCase()})`) || 
            txt.startsWith(`${letter.toLowerCase()})`) || 
            txt.startsWith(`${letter.toLowerCase()}.`) || 
            (txt.split(/[\s\)\.\-]/)[0] === letter.toLowerCase())) {
          return true;
        }
      }
      return false;
    };

    let matched = false;

    // 1. Search radio/checkbox inputs on page
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]'));
    for (const input of inputs) {
      if (clickedElements.has(input)) continue;
      let contextText = "";
      if (input.labels && input.labels.length > 0) {
        contextText = Array.from(input.labels).map(l => l.innerText || l.textContent).join(" ");
      } else if (input.parentElement) {
        contextText = input.parentElement.innerText || input.parentElement.textContent || "";
        if (contextText.length > 150 && input.nextSibling) {
          contextText = input.nextSibling.textContent || "";
        }
      }

      if (contextText.length < 250 && isMatch(contextText)) {
        triggerClick(input);
        clickedElements.add(input);
        matched = true;
        break;
      }
    }

    if (matched) {
      successCount++;
      continue;
    }

    // 2. Search clickable option containers
    const clickables = Array.from(document.querySelectorAll('label, button, li, div[class*="option"], div[class*="choice"], div[class*="answer"], div[class*="mcq"], div[class*="radio"], div[class*="checkbox"], [role="button"]'));
    for (const el of clickables) {
      if (el.closest('#hs-answer-overlay') || clickedElements.has(el)) continue;
      const txt = (el.innerText || el.textContent || "").trim();
      if (!txt || txt.length > 250) continue;

      if (isMatch(txt)) {
        triggerClick(el);
        clickedElements.add(el);
        matched = true;
        break;
      }
    }

    if (matched) {
      successCount++;
      continue;
    }

    // 3. Aggressive fallback: find any matching text element and look for a control nearby
    const allTags = Array.from(document.querySelectorAll('span, div, p, td'));
    for (const tag of allTags) {
      if (tag.closest('#hs-answer-overlay') || clickedElements.has(tag)) continue;
      const t = (tag.innerText || tag.textContent || "").trim();
      if (t.length > 0 && t.length < 150 && isMatch(t)) {
        let control = tag.parentElement?.querySelector('input[type="radio"], input[type="checkbox"]') ||
                      tag.parentElement?.parentElement?.querySelector('input[type="radio"], input[type="checkbox"]') ||
                      tag.closest('li, tr, .option, .choice')?.querySelector('input[type="radio"], input[type="checkbox"]');
        
        if (control && !clickedElements.has(control)) {
          triggerClick(control);
          clickedElements.add(control);
          matched = true;
          break;
        } else if (!clickedElements.has(tag)) {
          triggerClick(tag);
          clickedElements.add(tag);
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      successCount++;
    }
  }

  return {
    success: successCount > 0,
    total: targets.length,
    count: successCount
  };
}

// ── Answer overlay — bottom left ───────────────────
function showAnswerOverlay(answer, { style, truncated, autoSelect, meta, isDerivation } = {}) {
  if (currentDotMode && !currentDotExpanded) {
    pendingAnswerPayload = { answer, options: { style, truncated, autoSelect, meta, isDerivation } };

    // If auto-select is enabled, trigger page selection silently in the background
    if (autoSelect) {
      const cleanAnswer = stripThinkTags(answer);
      const parts = parseAnswer(cleanAnswer);
      if (parts.correct) {
        selectOptionOnPage(parts.correct);
      }
    }

    const isErr = answer && (answer.startsWith("⚠️") || answer.startsWith("Error:") || answer.startsWith("No Groq API key") || answer.startsWith("Extension"));
    showDotOverlay({
      state: isErr ? "error" : "ready",
      status: isErr ? answer : "Answer ready! Click to pop up",
      pendingAnswer: pendingAnswerPayload
    });
    return;
  }

  const existing = document.getElementById("hs-answer-overlay");
  if (existing) {
    saveCurrentOverlayPosition(existing);
  }
  removeExistingOverlay();

  const cleanAnswer = stripThinkTags(answer);
  const answerStyle = style || "detailed";
  lastAnswerPayload = { answer, options: { style: answerStyle, truncated, autoSelect, meta, isDerivation } };
  pendingAnswerPayload = { answer, options: { style: answerStyle, truncated, autoSelect, meta, isDerivation } };
  isDotHidden = false;

  const inp = getAnswerEffectiveInp();
  const box = document.createElement("div");
  box.id = "hs-answer-overlay";
  if (currentAnswerStealthMode) {
    box.classList.add("hs-stealth-mode");
  }
  const blurVal = getAnswerBoxBlurCss();
  box.style.cssText = `
    position: fixed;
    width: ${currentAnswerWidth}px;
    min-width: 350px;
    max-width: 95vw;
    max-height: 480px;
    resize: horizontal;
    overflow-x: auto;
    overflow-y: auto;
    z-index: 9999999;
    background: ${getAnswerBoxBg(inp)};
    backdrop-filter: ${blurVal};
    -webkit-backdrop-filter: ${blurVal};
    border: ${getAnswerBoxBorderCss(inp)};
    border-radius: ${currentAnswerBorderRadius}px;
    box-shadow: ${inp.overlayShadow};
    padding: 10px 14px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: ${inp.overlayTextPrimary};
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: ${colorWithAlpha(inp.overlayTextMuted, 0.4)} transparent;
    user-select: text;
    -webkit-user-select: text;
    transform: translateZ(0);
  `;

  // ENFORCE the selected style. The model may ignore the 2-line contract, so we
  // parse the response and, in MCQ/Short mode, render ONLY the required lines —
  // any reasoning the model added is dropped instead of shown as a full answer.
  const parts = parseAnswer(cleanAnswer);
  const strictMode = answerStyle === "mcq" || answerStyle === "short";
  const keyLineCaptured = answerStyle === "mcq" ? !!parts.correct
                        : answerStyle === "short" ? !!parts.final
                        : true;

  let formattedHtml = "";

  const multiFiles = parseMultiFiles(cleanAnswer);
  if (multiFiles.length > 0) {
    const termScript = generateTerminalScript(multiFiles);
    formattedHtml = `
      <div class="hs-backend-suite" style="margin-bottom: 9px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; flex-wrap: wrap; gap: 4px;">
          <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: ${inp.cardLabel}; text-transform: uppercase; letter-spacing: 0.5px;">📁 Backend Project (${multiFiles.length} Files)</span>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button id="hs-copy-all-terminal-quick" data-script="${escapeHtml(termScript)}" title="Copy all-in-one terminal command to create and update all files" style="padding: 2px 8px; font-size: 10px; font-weight: 700; border-radius: 4px; border: 1px solid ${inp.buttonBorder}; background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer; font-family: inherit;">⚡ 1-Shot Cmd</button>
            <button class="hs-view-toggle active" id="hs-btn-view-files" style="padding: 2px 7px; font-size: 10px; border-radius: 4px; border: 1px solid ${inp.cardBorder}; background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer; font-family: inherit;">📑 Files</button>
            <button class="hs-view-toggle" id="hs-btn-view-terminal" style="padding: 2px 7px; font-size: 10px; border-radius: 4px; border: 1px solid ${inp.cardBorder}; background: transparent; color: ${inp.overlayTextMuted}; cursor: pointer; font-family: inherit;">💻 Terminal</button>
          </div>
        </div>

        <div id="hs-files-container">
          ${multiFiles.map((f, idx) => `
            <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; border-radius: 0 8px 8px 0; padding: 7px 10px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 600; color: ${inp.cardLabel}; word-break: break-all;">📁 ${idx + 1}. ${escapeHtml(f.path)}</span>
                <button class="hs-copy-single-file" data-code="${escapeHtml(f.code)}" style="background: transparent; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.5)}; border-radius: 4px; padding: 2px 6px; font-size: 9.5px; cursor: pointer; color: ${inp.cardLabel}; font-family: inherit;">📋 Copy File</button>
              </div>
              <pre style="margin: 0; font-family: 'JetBrains Mono', Consolas, monospace; font-size: ${currentAnswerFontSize - 1}px; line-height: 1.42; white-space: pre; overflow-x: auto; word-break: normal; color: ${inp.cardValue}; tab-size: 4;">${escapeHtml(f.code)}</pre>
            </div>
          `).join("")}
        </div>

        <div id="hs-terminal-container" style="display: none;">
          <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; border-radius: 0 8px 8px 0; padding: 7px 10px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
              <span style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 600; color: ${inp.cardLabel};">💻 IDE Terminal Script (One-Shot)</span>
              <div style="display: flex; gap: 4px; align-items: center;">
                <button id="hs-terminal-back-btn" style="background: ${colorWithAlpha(inp.cardBg, 0.8)}; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.6)}; border-radius: 4px; padding: 2px 7px; font-size: 9.5px; cursor: pointer; color: ${inp.cardLabel}; font-family: inherit;">← Back to Files</button>
                <button id="hs-copy-terminal-btn" data-script="${escapeHtml(termScript)}" style="background: transparent; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.5)}; border-radius: 4px; padding: 2px 6px; font-size: 9.5px; cursor: pointer; color: ${inp.cardLabel}; font-family: inherit;">📋 Copy Script</button>
              </div>
            </div>
            <pre style="margin: 0; font-family: 'JetBrains Mono', Consolas, monospace; font-size: ${currentAnswerFontSize - 1}px; line-height: 1.38; white-space: pre; overflow-x: auto; word-break: normal; color: ${inp.cardValue}; tab-size: 4;">${escapeHtml(termScript)}</pre>
          </div>
          <div style="font-size: 10.5px; color: ${inp.overlayTextMuted}; padding: 2px 4px;">💡 Paste directly into your VS Code / IDE terminal to generate all files automatically.</div>
        </div>
      </div>
    `;
  } else if (answerStyle === "detailed") {
    // ── Pure Code Mode Layout ──
    const pureCode = sanitizeCodeFormatting(cleanAnswer);
    if (currentAnswerStealthMode) {
      formattedHtml = `
        <div style="font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace; font-size: ${currentAnswerFontSize}px; line-height: 1.45; white-space: pre; overflow-x: auto; word-break: normal; color: ${inp.cardValue}; tab-size: 4;">
          ${escapeHtml(pureCode || cleanAnswer || "No code received.")}
        </div>
      `;
    } else {
      formattedHtml = `
        <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; border-radius: 0 8px 8px 0; padding: 8px 12px; margin-bottom: 9px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <span class="hs-card-label" style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: ${inp.cardLabel}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">💻 Pure Code Solution</span>
            <button class="hs-copy-single-code" style="background: transparent; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.5)}; border-radius: 4px; padding: 2px 7px; font-size: 10.5px; cursor: pointer; color: ${inp.cardLabel}; font-family: inherit;">📋 Copy Code</button>
          </div>
          <pre class="hs-code-block" style="margin: 0; font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace; font-size: ${currentAnswerFontSize}px; line-height: 1.45; white-space: pre; overflow-x: auto; word-break: normal; color: ${inp.cardValue}; tab-size: 4;">${escapeHtml(pureCode || cleanAnswer || "No code received.")}</pre>
        </div>
      `;
    }
  } else if (currentAnswerStealthMode) {
    // ── Ultra-discreet stealth layout ──
    if (parts.why) {
      formattedHtml += `
        <div class="hs-stealth-row" style="margin-bottom: 7px; font-size: ${currentAnswerFontSize}px; line-height: 1.45; color: ${inp.cardValue};">
          <span class="hs-card-label" style="font-weight: 700; color: ${inp.cardLabel}; margin-right: 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px;">Why</span>
          ${escapeHtml(parts.why)}
        </div>
      `;
    }
    if (parts.correct) {
      let autoSelectStatus = "";
      if (autoSelect) {
        const selRes = selectOptionOnPage(parts.correct);
        if (selRes && selRes.success) {
          const detail = (selRes.total > 1) ? ` ${selRes.count}/${selRes.total}` : "";
          autoSelectStatus = ` <span style="font-size: 10px; color: #059669; font-weight: 700;">✓${detail}</span>`;
        } else {
          autoSelectStatus = ` <span style="font-size: 10px; color: #d97706; font-weight: 700;">⚠️</span>`;
        }
      }
      formattedHtml += `
        <div class="hs-stealth-row" style="margin-bottom: 7px; font-size: ${currentAnswerFontSize + 0.5}px; font-weight: 600; line-height: 1.45; color: ${inp.cardValue};">
          <span class="hs-card-label" style="font-weight: 700; color: ${inp.cardLabel}; margin-right: 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px;">Option(s)</span>
          ${escapeHtml(parts.correct)}${autoSelectStatus}
        </div>
      `;
    }
    if (parts.final) {
      formattedHtml += `
        <div class="hs-stealth-row" style="margin-bottom: 7px; font-size: ${currentAnswerFontSize + 0.5}px; font-weight: 600; line-height: 1.45; color: ${inp.cardValue};">
          <span class="hs-card-label" style="font-weight: 700; color: ${inp.cardLabel}; margin-right: 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px;">Ans</span>
          ${escapeHtml(parts.final)}
        </div>
      `;
    }
    if (!parts.why && !parts.correct && !parts.final) {
      formattedHtml = `<div style="white-space: pre-wrap; line-height: 1.45; font-size: ${currentAnswerFontSize}px; color: ${inp.overlayTextPrimary};">${escapeHtml(cleanAnswer || "No answer received.")}</div>`;
    } else if (!strictMode || !keyLineCaptured) {
      for (const line of parts.extra) {
        if (!line) continue;
        formattedHtml += `<div style="font-size: 12px; line-height: 1.45; color: ${inp.overlayTextSecondary}; margin-bottom: 4px;">${escapeHtml(line)}</div>`;
      }
    }
  } else {
    // ── Standard Rich Cards Layout ──
    if (parts.why) {
      formattedHtml += `
        <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; border-radius: 0 8px 8px 0; padding: 7px 12px; margin-bottom: 9px; font-size: ${currentAnswerFontSize}px; line-height: 1.5; color: ${inp.cardValue};">
          <span class="hs-card-label" style="font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 700; color: ${inp.cardLabel}; display: block; font-size: 12.5px; letter-spacing: 0.2px; margin-bottom: 3px;">Motivazione • Why</span>
          ${escapeHtml(parts.why)}
        </div>
      `;
    }
    if (parts.correct) {
      let autoSelectStatus = "";
      if (autoSelect) {
        const selRes = selectOptionOnPage(parts.correct);
        if (selRes && selRes.success) {
          const detail = (selRes.total > 1) ? ` (${selRes.count}/${selRes.total})` : "";
          autoSelectStatus = `<span style="color: ${inp.badgeSuccess}; font-size: 11px; margin-left: 8px; font-weight: 700; font-style: normal; font-family: 'Plus Jakarta Sans', sans-serif;">(⚡ Selected${detail} on Page)</span>`;
        } else {
          autoSelectStatus = `<span style="color: ${inp.badgeWarning}; font-size: 11px; margin-left: 8px; font-weight: 700; font-style: normal; font-family: 'Plus Jakarta Sans', sans-serif;">(⚠️ Verify manually)</span>`;
        }
      }

      formattedHtml += `
        <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; border-radius: 0 8px 8px 0; padding: 7px 12px; margin-bottom: 9px;">
          <span class="hs-card-label" style="font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 700; color: ${inp.cardLabel}; display: block; font-size: 12.5px; letter-spacing: 0.2px; margin-bottom: 3px;">Opzione Corretta • Correct Option(s)</span>
          <div style="font-size: ${currentAnswerFontSize + 1}px; font-weight: 600; color: ${inp.cardValue}; margin-bottom: 2px;">
            ${escapeHtml(parts.correct)}
            ${autoSelectStatus}
          </div>
        </div>
      `;
    }
    if (parts.final) {
      formattedHtml += `
        <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; border-radius: 0 8px 8px 0; padding: 7px 12px; margin-bottom: 9px; font-size: ${currentAnswerFontSize + 0.5}px; font-weight: 600; color: ${inp.cardValue};">
          <span class="hs-card-label" style="font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 700; color: ${inp.cardLabel}; display: block; font-size: 12.5px; letter-spacing: 0.2px; margin-bottom: 3px;">Risultato Finale • Final Answer</span>
          ${escapeHtml(parts.final)}
        </div>
      `;
    }

    const hasCards = parts.why || parts.correct || parts.final;

    if (!hasCards) {
      if (strictMode) {
        formattedHtml = `
          <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.badgeWarning}; border-radius: 0 8px 8px 0; padding: 6px 12px; font-size: 11px; color: ${inp.badgeWarning}; margin-bottom: 8px;">
            ⚠️ Response:
          </div>
          <div style="white-space: pre-wrap; line-height: 1.5; font-size: 12.5px; color: ${inp.overlayTextPrimary};">${escapeHtml(cleanAnswer || "No answer received.")}</div>
        `;
      } else {
        formattedHtml = `<div style="white-space: pre-wrap; line-height: 1.5; font-size: 12.5px; color: ${inp.overlayTextPrimary};">${escapeHtml(cleanAnswer || "No answer received.")}</div>`;
      }
    } else if (!strictMode || !keyLineCaptured) {
      for (const line of parts.extra) {
        if (!line) continue;
        formattedHtml += `<div style="font-size: 12.5px; line-height: 1.5; color: ${inp.overlayTextSecondary}; margin-bottom: 6px;">${escapeHtml(line)}</div>`;
      }
    }
  }

  const activeCrop = lastCroppedBase64 || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("hs_last_crop") : null);
  let expandStepBtnHtml = "";
  if (answerStyle !== "detailed" && !isDerivation && activeCrop) {
    if (currentAnswerStealthMode) {
      expandStepBtnHtml = `
        <div style="margin-top: 6px; padding-top: 4px;">
          <button id="hs-expand-step" style="
            background: transparent; color: ${inp.cardLabel || inp.overlayTextPrimary || '#111111'};
            border: 1px dashed ${colorWithAlpha(inp.cardLabel || inp.overlayTextMuted, 0.45)}; border-radius: 4px; padding: 2px 6px; font-size: 11px;
            cursor: pointer; opacity: 0.85; font-family: inherit;
          ">[💻 Code Solution]</button>
        </div>
      `;
    } else {
      expandStepBtnHtml = `
        <div style="margin-top: 10px; padding-top: 7px; border-top: 1px dashed ${inp.overlayBorder};">
          <button id="hs-expand-step" style="
            display: inline-flex; align-items: center; gap: 5px;
            padding: 6px 13px;
            background: ${inp.buttonBg};
            color: ${inp.buttonText};
            border: 1px solid ${inp.buttonBorder};
            border-radius: 8px;
            font-family: inherit;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
            transition: all 0.12s ease;
          ">
            <span>💻</span> Code Solution
          </button>
        </div>
      `;
    }
  } else if (answerHistory.length > 0) {
    if (currentAnswerStealthMode) {
      expandStepBtnHtml = `
        <div style="margin-top: 6px; padding-top: 4px;">
          <button id="hs-btn-bottom-back-history" style="
            background: transparent; color: ${inp.cardLabel || inp.overlayTextPrimary || '#111111'};
            border: 1px dashed ${colorWithAlpha(inp.cardLabel || inp.overlayTextMuted, 0.45)}; border-radius: 4px; padding: 2px 6px; font-size: 11px;
            cursor: pointer; opacity: 0.85; font-family: inherit;
          ">[← Back to Previous Solution]</button>
        </div>
      `;
    } else {
      expandStepBtnHtml = `
        <div style="margin-top: 10px; padding-top: 7px; border-top: 1px dashed ${inp.overlayBorder};">
          <button id="hs-btn-bottom-back-history" style="
            display: inline-flex; align-items: center; gap: 5px;
            padding: 6px 13px;
            background: ${inp.buttonBg};
            color: ${inp.buttonText};
            border: 1px solid ${inp.buttonBorder};
            border-radius: 8px;
            font-family: inherit;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
            transition: all 0.12s ease;
          ">
            <span>←</span> Back to Previous Solution
          </button>
        </div>
      `;
    }
  }

  const truncNote = (truncated && !currentAnswerStealthMode)
    ? `<div style="margin-top: 8px; padding: 6px 12px; background: ${inp.cardBg}; border-left: 2.5px solid ${inp.badgeWarning}; border-radius: 0 8px 8px 0; font-size: 11px; color: ${inp.badgeWarning};">⚠️ Output hit token limit.</div>`
    : "";

  let keyBadge = "";
  if (meta && meta.provider && !currentAnswerStealthMode) {
    const keyNum = typeof meta.keyIndex === "number" ? meta.keyIndex + 1 : 1;
    const total = meta.totalKeys || 1;
    const fbText = meta.fallback ? " • fallback" : "";
    keyBadge = `<div style="font-size: 9.5px; color: ${inp.overlayTextMuted}; margin-top: 6px; text-align: right; opacity: 0.85; font-family: 'JetBrains Mono', monospace;">⚡ ${escapeHtml(meta.provider)}: Key ${keyNum}/${total}${fbText}</div>`;
  }

  box.innerHTML = `
    <!-- HEADER BAR: Drag Handle, Title, Back Button, & Action Controls -->
    <div id="hs-popup-header" style="
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px; padding-bottom: 6px;
      border-bottom: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)};
      user-select: none; gap: 6px;
    ">
      <div id="hs-header-left" style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
        <div id="hs-drag-bar" style="
          display: ${currentAnswerDragBar ? 'flex' : 'none'};
          align-items: center; gap: 4px; cursor: grab; padding: 2px 6px; border-radius: 4px;
          background: ${colorWithAlpha(inp.cardBg, 0.6)}; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.4)};
          font-size: 10px; font-weight: 700; color: ${inp.cardLabel}; letter-spacing: 0.3px;
        ">
          <span style="opacity: 0.6; font-size: 11px;">⠿</span>
          <span id="hs-header-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${multiFiles.length > 0 ? '📁 Backend Suite' : answerStyle === 'detailed' ? '💻 Code Solution' : '⚡ Homework Solver'}</span>
        </div>
        <button id="hs-header-back-btn" title="Back" style="
          display: ${answerHistory.length > 0 ? 'inline-flex' : 'none'}; align-items: center; gap: 3px;
          padding: 2px 8px; font-size: 10.5px; font-weight: 600; font-family: inherit;
          border-radius: 4px; border: 1px solid ${inp.cardBorder};
          background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer;
        ">← Previous Answer</button>
      </div>

      <div id="hs-header-controls" style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
        <button id="hs-settings-btn" title="Quick Settings (Operational Only)" style="
          width: 26px; height: 26px; background: transparent; color: ${inp.overlayTextMuted};
          border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)}; border-radius: 5px;
          cursor: pointer; font-size: 12.5px; display: flex; align-items: center; justify-content: center;
          padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'}; transition: all 0.12s ease;
        ">⚙</button>
        <button id="hs-copy" title="Copy clean answer" style="
          width: 26px; height: 26px; background: transparent; color: ${inp.overlayTextMuted};
          border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)}; border-radius: 5px;
          cursor: pointer; font-size: 12.5px; display: flex; align-items: center; justify-content: center;
          padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'}; transition: all 0.12s ease;
        ">⎘</button>
        <button id="hs-minimize" title="Minimize to Floating Dot (Alt+D)" style="
          width: 26px; height: 26px; background: transparent; color: ${inp.overlayTextMuted};
          border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)}; border-radius: 5px;
          cursor: pointer; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;
          padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'}; transition: all 0.12s ease;
        ">—</button>
        <button id="hs-close" title="Close" style="
          width: 26px; height: 26px; background: transparent; color: ${inp.overlayTextMuted};
          border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)}; border-radius: 5px;
          cursor: pointer; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;
          padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'}; transition: all 0.12s ease;
        ">✕</button>
      </div>
    </div>

    <!-- NORMAL SOLUTION VIEW -->
    <div id="hs-solution-view" style="user-select: text; -webkit-user-select: text;">
      <!-- TOP-ANCHORED MULTIMODAL SEARCH BAR (Clean full width row) -->
      <div id="hs-top-search-bar" style="margin-bottom: 8px; display: flex; gap: 6px; align-items: center; width: 100%; box-sizing: border-box;">
        <textarea id="hs-search-input" rows="1" placeholder="Ask follow-up or paste README context... (Enter to send)" style="
          flex: 1; min-height: 34px; height: 34px; max-height: 120px; resize: none; overflow-y: auto;
          padding: 6px 9px; font-family: inherit; font-size: 11.5px; line-height: 1.4;
          background: ${colorWithAlpha(inp.cardBg, 0.85)}; color: ${inp.overlayTextPrimary};
          border: 1px solid ${inp.cardBorder}; border-radius: 6px; outline: none; box-sizing: border-box;
        "></textarea>
        <button id="hs-search-submit" title="Send query with last crop (Enter)" style="
          height: 34px; padding: 0 11px; background: ${inp.buttonBg}; color: ${inp.buttonText};
          border: 1px solid ${inp.buttonBorder}; border-radius: 6px; font-size: 12px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          transition: opacity 0.12s ease;
        ">➔</button>
      </div>

      <!-- History Back Navigation (if user previously had another answer) -->
      ${answerHistory.length > 0 ? `
        <div id="hs-history-nav" style="margin-bottom: 7px; display: flex; align-items: center; justify-content: space-between; background: ${colorWithAlpha(inp.cardBg, 0.7)}; border: 1px solid ${colorWithAlpha(inp.cardBorder, 0.5)}; border-radius: 5px; padding: 3px 8px;">
          <span style="font-size: 10px; color: ${inp.cardLabel}; font-weight: 600;">↩ Follow-up view</span>
          <button id="hs-btn-back-history" style="
            display: inline-flex; align-items: center; gap: 3px;
            padding: 2px 7px; font-size: 10px; font-weight: 600; border-radius: 4px;
            border: 1px solid ${inp.cardBorder}; background: ${inp.buttonBg};
            color: ${inp.buttonText}; cursor: pointer; font-family: inherit;
          ">← Back to Previous Answer</button>
        </div>
      ` : ''}

      <!-- SOLUTION CONTENT BODY -->
      <div id="hs-solution-body">
        ${formattedHtml}
        ${expandStepBtnHtml}
        ${truncNote}
        ${keyBadge}
      </div>
    </div>

    <!-- QUICK SETTINGS VIEW (Zero cosmetic fluff, purely operational) -->
    <div id="hs-settings-view" style="display: none; user-select: text; -webkit-user-select: text;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid ${colorWithAlpha(inp.cardBorder, 0.6)}; padding-bottom: 6px;">
        <span style="font-size: 12.5px; font-weight: 700; color: ${inp.cardLabel};">⚙ Quick Settings</span>
        <button id="hs-btn-back-solution" style="padding: 2px 8px; font-size: 11px; border-radius: 4px; border: 1px solid ${inp.cardBorder}; background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer; font-family: inherit;">← Back to Solution</button>
      </div>

      <!-- 1. Answer Style -->
      <div style="margin-bottom: 9px;">
        <label style="display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${inp.cardLabel}; margin-bottom: 4px; letter-spacing: 0.5px;">Answer Style</label>
        <div id="hs-setting-style-group" style="display: flex; gap: 4px;">
          <button type="button" class="hs-setting-style-pill" data-style="mcq" style="flex: 1; padding: 4px 6px; font-size: 11px; border-radius: 4px; border: 1px solid ${inp.cardBorder}; background: ${(answerStyle === 'mcq') ? inp.buttonBg : 'transparent'}; color: ${(answerStyle === 'mcq') ? inp.buttonText : inp.overlayTextMuted}; cursor: pointer; font-family: inherit;">MCQ</button>
          <button type="button" class="hs-setting-style-pill" data-style="short" style="flex: 1; padding: 4px 6px; font-size: 11px; border-radius: 4px; border: 1px solid ${inp.cardBorder}; background: ${(answerStyle === 'short') ? inp.buttonBg : 'transparent'}; color: ${(answerStyle === 'short') ? inp.buttonText : inp.overlayTextMuted}; cursor: pointer; font-family: inherit;">Short</button>
          <button type="button" class="hs-setting-style-pill" data-style="detailed" style="flex: 1; padding: 4px 6px; font-size: 11px; border-radius: 4px; border: 1px solid ${inp.cardBorder}; background: ${(answerStyle === 'detailed') ? inp.buttonBg : 'transparent'}; color: ${(answerStyle === 'detailed') ? inp.buttonText : inp.overlayTextMuted}; cursor: pointer; font-family: inherit;">💻 Code Only</button>
        </div>
      </div>

      <!-- 2. Subject Persona -->
      <div style="margin-bottom: 9px;">
        <label style="display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${inp.cardLabel}; margin-bottom: 4px; letter-spacing: 0.5px;">Subject Domain</label>
        <select id="hs-setting-subject" style="width: 100%; padding: 4px 7px; font-size: 11.5px; border-radius: 5px; background: ${inp.cardBg}; color: ${inp.cardValue}; border: 1px solid ${inp.cardBorder}; outline: none; font-family: inherit;">
          <option value="auto" ${currentQuickSettings.subject === 'auto' ? 'selected' : ''}>Auto / Academic General</option>
          <option value="dsa" ${currentQuickSettings.subject === 'dsa' ? 'selected' : ''}>DSA & Algorithms</option>
          <option value="backend-dev" ${currentQuickSettings.subject === 'backend-dev' ? 'selected' : ''}>Backend Systems & Multi-File</option>
          <option value="aptitude-reasoning" ${(currentQuickSettings.subject === 'aptitude-reasoning' || currentQuickSettings.subject === 'logical-reasoning') ? 'selected' : ''}>Quantitative Aptitude & Reasoning</option>
          <option value="prob-stats" ${currentQuickSettings.subject === 'prob-stats' ? 'selected' : ''}>Probability & Statistics</option>
          <option value="ai-finance" ${currentQuickSettings.subject === 'ai-finance' ? 'selected' : ''}>Quantitative AI & Finance</option>
          <option value="communication" ${currentQuickSettings.subject === 'communication' ? 'selected' : ''}>Verbal & Linguistic</option>
        </select>
      </div>

      <!-- 3. Dynamic Subject Context Card -->
      <div id="hs-dynamic-subject-card" style="margin-bottom: 9px; padding: 8px 10px; border-radius: 6px; background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; display: none;"></div>

      <!-- 4. Reasoning Engine (Approach) -->
      <div style="margin-bottom: 9px;">
        <label style="display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${inp.cardLabel}; margin-bottom: 4px; letter-spacing: 0.5px;">Reasoning Engine</label>
        <select id="hs-setting-approach" style="width: 100%; padding: 4px 7px; font-size: 11.5px; border-radius: 5px; background: ${inp.cardBg}; color: ${inp.cardValue}; border: 1px solid ${inp.cardBorder}; outline: none; font-family: inherit;">
          <option value="normal" ${currentQuickSettings.globalApproach === 'normal' ? 'selected' : ''}>Normal Single-Pass (~1.2s)</option>
          <option value="parallel-dual" ${currentQuickSettings.globalApproach === 'parallel-dual' ? 'selected' : ''}>⚡ Parallel Dual-Key Consensus (~1.5s)</option>
          <option value="sequential-3stage" ${currentQuickSettings.globalApproach === 'sequential-3stage' ? 'selected' : ''}>🧠 Deep Sequential 3-Stage Pipeline</option>
        </select>
      </div>

      <!-- 5. Auto-Select on Webpage DOM -->
      <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 7px;">
        <input type="checkbox" id="hs-setting-autoselect" ${currentQuickSettings.autoSelect ? 'checked' : ''} style="cursor: pointer; width: 14px; height: 14px;">
        <label for="hs-setting-autoselect" style="font-size: 11.5px; cursor: pointer; color: ${inp.cardValue}; user-select: none;">Auto-click detected MCQ/MSQ option on page</label>
      </div>

      <!-- Actions -->
      <div style="display: flex; gap: 6px; margin-top: 12px; align-items: center;">
        <button id="hs-setting-back-bottom-btn" style="padding: 6px 10px; font-size: 11.5px; font-weight: 600; border-radius: 6px; border: 1px solid ${inp.cardBorder}; background: transparent; color: ${inp.overlayTextMuted}; cursor: pointer; font-family: inherit;">← Back</button>
        <button id="hs-setting-save-btn" style="flex: 1; padding: 6px 10px; font-size: 11.5px; font-weight: 600; border-radius: 6px; border: 1px solid ${inp.buttonBorder}; background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer; font-family: inherit;">💾 Save Settings</button>
        <button id="hs-setting-resolve-btn" style="flex: 1; padding: 6px 10px; font-size: 11.5px; font-weight: 600; border-radius: 6px; border: 1px solid ${inp.buttonBorder}; background: ${inp.buttonBg}; color: ${inp.buttonText}; cursor: pointer; font-family: inherit;">🔄 Save & Re-Solve</button>
      </div>
      <div id="hs-setting-status" style="font-size: 10.5px; color: ${inp.badgeSuccess}; margin-top: 6px; text-align: center; min-height: 16px;"></div>
    </div>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600;1,700&family=Playfair+Display:ital,wght@1,600;1,700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap');
      #hs-answer-overlay::-webkit-scrollbar { width: 4px !important; background: transparent !important; }
      #hs-answer-overlay::-webkit-scrollbar-thumb { background: ${colorWithAlpha(inp.overlayTextMuted, 0.4)} !important; border-radius: 4px !important; }
      #hs-answer-overlay::-webkit-scrollbar-thumb:hover { background: ${colorWithAlpha(inp.overlayTextMuted, 0.7)} !important; }
      #hs-settings-btn:hover, #hs-copy:hover, #hs-minimize:hover, #hs-close:hover {
        background: ${colorWithAlpha(inp.cardBorder, 0.25)} !important;
        color: ${inp.overlayTextPrimary} !important;
        opacity: 1 !important;
      }
      #hs-settings-btn:active, #hs-copy:active, #hs-minimize:active, #hs-close:active { transform: scale(0.92); }
      #hs-expand-step:hover { filter: brightness(1.08); }
      #hs-expand-step:active { transform: scale(0.96); }
    </style>
  `;

  document.body.appendChild(box);
  applyOverlayPosition(box);
  makeDraggable(box);

  const closeBtn = document.getElementById("hs-close");
  if (closeBtn) {
    closeBtn.onclick = removeExistingOverlay;
  }

  const minBtn = document.getElementById("hs-minimize");
  if (minBtn) {
    minBtn.onclick = (e) => {
      e.stopPropagation();
      toggleOverlayAndDot();
    };
  }

  const expandBtn = document.getElementById("hs-expand-step");
  if (expandBtn) {
    if (!currentAnswerStealthMode) {
      expandBtn.onmouseenter = () => {
        expandBtn.style.background = inp.buttonHoverBg;
        expandBtn.style.borderColor = inp.buttonHoverBorder;
        expandBtn.style.color = inp.buttonHoverText;
        expandBtn.style.transform = "translateY(-1px)";
      };
      expandBtn.onmouseleave = () => {
        expandBtn.style.background = inp.buttonBg;
        expandBtn.style.borderColor = inp.buttonBorder;
        expandBtn.style.color = inp.buttonText;
        expandBtn.style.transform = "none";
      };
    }
    expandBtn.onclick = () => {
      const cropToUse = lastCroppedBase64 || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("hs_last_crop") : null);
      if (!cropToUse) return;
      answerHistory.push({
        answer: cleanAnswer,
        options: { style: answerStyle, truncated, autoSelect, meta, isDerivation: false }
      });
      showLoadingOverlay("Generating pure code solution...");
      callAPI(cropToUse, { forceStyle: "detailed" });
    };
  }

  const bottomHistBackBtn = box.querySelector("#hs-btn-bottom-back-history");
  if (bottomHistBackBtn) {
    bottomHistBackBtn.onclick = (e) => {
      e.stopPropagation();
      const prev = answerHistory.pop();
      if (prev) {
        showAnswerOverlay(prev.answer, prev.options);
      }
    };
  }

  const onlyAnswerText = (answerStyle === "detailed")
    ? sanitizeCodeFormatting(cleanAnswer)
    : getCleanAnswerOnly(cleanAnswer, parts, answerStyle);

  // Wire single code card copy button
  const singleCodeBtn = box.querySelector(".hs-copy-single-code");
  if (singleCodeBtn) {
    singleCodeBtn.onclick = (e) => {
      e.stopPropagation();
      copyToClipboard(onlyAnswerText).then((ok) => {
        if (ok) {
          singleCodeBtn.innerText = "✅ Copied!";
          setTimeout(() => { singleCodeBtn.innerText = "📋 Copy Code"; }, 1500);
        }
      });
    };
  }

  // Multi-file backend view toggle handlers
  const btnViewFiles = box.querySelector("#hs-btn-view-files");
  const btnViewTerm = box.querySelector("#hs-btn-view-terminal");
  const filesContainer = box.querySelector("#hs-files-container");
  const termContainer = box.querySelector("#hs-terminal-container");

  if (btnViewFiles && btnViewTerm && filesContainer && termContainer) {
    btnViewFiles.onclick = () => {
      btnViewFiles.style.background = inp.buttonBg;
      btnViewFiles.style.color = inp.buttonText;
      btnViewTerm.style.background = "transparent";
      btnViewTerm.style.color = inp.overlayTextMuted;
      filesContainer.style.display = "block";
      termContainer.style.display = "none";
    };
    btnViewTerm.onclick = () => {
      btnViewTerm.style.background = inp.buttonBg;
      btnViewTerm.style.color = inp.buttonText;
      btnViewFiles.style.background = "transparent";
      btnViewFiles.style.color = inp.overlayTextMuted;
      filesContainer.style.display = "none";
      termContainer.style.display = "block";
    };
  }

  // Copy buttons for individual files
  box.querySelectorAll(".hs-copy-single-file").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const code = btn.getAttribute("data-code") || "";
      copyToClipboard(code).then((ok) => {
        if (ok) {
          btn.innerText = "✅ Copied";
          setTimeout(() => { btn.innerText = "📋 Copy File"; }, 1500);
        }
      });
    };
  });

  // Copy button for quick terminal command in files header
  const quickTermBtn = box.querySelector("#hs-copy-all-terminal-quick");
  if (quickTermBtn) {
    quickTermBtn.onclick = (e) => {
      e.stopPropagation();
      const script = quickTermBtn.getAttribute("data-script") || "";
      copyToClipboard(script).then((ok) => {
        if (ok) {
          quickTermBtn.innerText = "✅ Command Copied!";
          setTimeout(() => { quickTermBtn.innerText = "⚡ 1-Shot Cmd"; }, 1500);
        }
      });
    };
  }

  // Copy button for terminal script
  const copyTermBtn = box.querySelector("#hs-copy-terminal-btn");
  if (copyTermBtn) {
    copyTermBtn.onclick = (e) => {
      e.stopPropagation();
      const script = copyTermBtn.getAttribute("data-script") || "";
      copyToClipboard(script).then((ok) => {
        if (ok) {
          copyTermBtn.innerText = "✅ Script Copied!";
          setTimeout(() => { copyTermBtn.innerText = "📋 Copy Script"; }, 1500);
        }
      });
    };
  }

  // Back to Files button inside terminal view
  const termBackBtn = box.querySelector("#hs-terminal-back-btn");
  if (termBackBtn && btnViewFiles) {
    termBackBtn.onclick = (e) => {
      e.stopPropagation();
      btnViewFiles.click();
    };
  }

  // Persistent horizontal resize observer
  if (typeof ResizeObserver !== "undefined") {
    let roTimer = null;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width + 28);
        if (w >= 320 && Math.abs(w - currentAnswerWidth) > 6) {
          currentAnswerWidth = w;
          clearTimeout(roTimer);
          roTimer = setTimeout(() => {
            chrome.storage.local.set({ answerWidth: currentAnswerWidth }).catch(() => {});
          }, 400);
        }
      }
    });
    ro.observe(box);
  }

  // Auto-copy the clean answer text immediately if enabled
  if (currentAnswerAutoCopy && onlyAnswerText) {
    copyToClipboard(onlyAnswerText).then((ok) => {
      const copyBtn = document.getElementById("hs-copy");
      if (copyBtn && ok) {
        copyBtn.textContent = "✓";
        copyBtn.style.color = inp.copySuccess;
        copyBtn.style.opacity = "1";
        setTimeout(() => {
          if (copyBtn) {
            copyBtn.textContent = "⎘";
            copyBtn.style.color = inp.overlayTextMuted;
            copyBtn.style.opacity = currentAnswerStealthMode ? "0.4" : "0.75";
          }
        }, 1500);
      }
    });
  }

  // Manual copy button click
  const manualCopyBtn = document.getElementById("hs-copy");
  if (manualCopyBtn) {
    manualCopyBtn.onclick = () => {
      const toCopy = (answerStyle === "detailed")
        ? extractPureCode(cleanAnswer)
        : (getCleanAnswerOnly(cleanAnswer, parts, answerStyle) || cleanAnswer);
      copyToClipboard(toCopy).then((ok) => {
        const copyBtn = document.getElementById("hs-copy");
        if (copyBtn && ok) {
          copyBtn.textContent = "✓";
          copyBtn.style.color = inp.copySuccess;
          copyBtn.style.opacity = "1";
          setTimeout(() => {
            if (copyBtn) {
              copyBtn.textContent = "⎘";
              copyBtn.style.color = inp.overlayTextMuted;
              copyBtn.style.opacity = currentAnswerStealthMode ? "0.4" : "0.75";
            }
          }, 1500);
        }
      });
    };
  }

  // ── Top-Anchored Search Input & Execution ──
  const searchInput = box.querySelector("#hs-search-input");
  const searchSubmit = box.querySelector("#hs-search-submit");

  const runSearch = () => {
    const query = searchInput ? searchInput.value.trim() : "";
    if (!query) return;
    const activeCrop = lastCroppedBase64 || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("hs_last_crop") : null);
    if (!activeCrop) {
      showAnswerOverlay("⚠️ No image crop found in memory to combine with this query. Please capture an image first.");
      return;
    }
    answerHistory.push({
      answer: cleanAnswer,
      options: { style: answerStyle, truncated, autoSelect, meta, isDerivation }
    });
    showLoadingOverlay("Refining with README / custom query…");
    callAPI(activeCrop, { customQuery: query });
  };

  // Wire History Back Button (Return to previous answer before follow-up/code expansion)
  const histBackBtn = box.querySelector("#hs-btn-back-history");
  if (histBackBtn) {
    histBackBtn.onclick = (e) => {
      e.stopPropagation();
      const prev = answerHistory.pop();
      if (prev) {
        showAnswerOverlay(prev.answer, prev.options);
      }
    };
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchInput.style.height = "auto";
      searchInput.style.height = `${Math.max(34, Math.min(searchInput.scrollHeight, 120))}px`;
    });
    searchInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runSearch();
      }
    });
    searchInput.addEventListener("keyup", (e) => e.stopPropagation());
    searchInput.addEventListener("keypress", (e) => e.stopPropagation());
  }

  if (searchSubmit) {
    searchSubmit.onclick = (e) => {
      e.stopPropagation();
      runSearch();
    };
  }

  // ── Quick Settings Controls & Dynamic Context Card ──
  const settingsBtn = box.querySelector("#hs-settings-btn");
  const backBtn = box.querySelector("#hs-btn-back-solution");
  const solView = box.querySelector("#hs-solution-view");
  const setView = box.querySelector("#hs-settings-view");
  const subjSelect = box.querySelector("#hs-setting-subject");
  const approachSelect = box.querySelector("#hs-setting-approach");
  const autoselectCb = box.querySelector("#hs-setting-autoselect");
  const stylePills = box.querySelectorAll(".hs-setting-style-pill");

  const renderDynamicSubjectCard = (subjVal) => {
    const card = box.querySelector("#hs-dynamic-subject-card");
    if (!card) return;
    if (subjVal === "dsa") {
      card.style.display = "block";
      card.innerHTML = `
        <div style="font-size: 11px; font-weight: 700; color: ${inp.cardLabel}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px;">⚡ DSA Configuration</div>
        <div style="margin-bottom: 6px;">
          <label style="display: block; font-size: 10px; color: ${inp.overlayTextMuted}; margin-bottom: 2px;">Target Language</label>
          <select id="hs-dsa-lang" style="width: 100%; padding: 3px 6px; font-size: 11px; border-radius: 4px; background: ${colorWithAlpha(inp.cardBg, 0.9)}; color: ${inp.cardValue}; border: 1px solid ${inp.cardBorder}; outline: none;">
            <option value="Python" ${currentQuickSettings.dsaLanguage === "Python" ? "selected" : ""}>Python</option>
            <option value="C++" ${currentQuickSettings.dsaLanguage === "C++" ? "selected" : ""}>C++</option>
            <option value="Java" ${currentQuickSettings.dsaLanguage === "Java" ? "selected" : ""}>Java</option>
            <option value="JavaScript" ${currentQuickSettings.dsaLanguage === "JavaScript" ? "selected" : ""}>JavaScript</option>
            <option value="TypeScript" ${currentQuickSettings.dsaLanguage === "TypeScript" ? "selected" : ""}>TypeScript</option>
            <option value="Go" ${currentQuickSettings.dsaLanguage === "Go" ? "selected" : ""}>Go</option>
            <option value="Rust" ${currentQuickSettings.dsaLanguage === "Rust" ? "selected" : ""}>Rust</option>
          </select>
        </div>
        <div style="margin-bottom: 6px;">
          <label style="display: block; font-size: 10px; color: ${inp.overlayTextMuted}; margin-bottom: 2px;">Optimization Target</label>
          <select id="hs-dsa-opt" style="width: 100%; padding: 3px 6px; font-size: 11px; border-radius: 4px; background: ${colorWithAlpha(inp.cardBg, 0.9)}; color: ${inp.cardValue}; border: 1px solid ${inp.cardBorder}; outline: none;">
            <option value="Optimal Time & Space" ${currentQuickSettings.dsaOptimize === "Optimal Time & Space" ? "selected" : ""}>Optimal Time & Space</option>
            <option value="Minimal Code / Clean" ${currentQuickSettings.dsaOptimize === "Minimal Code / Clean" ? "selected" : ""}>Minimal Code / Clean</option>
            <option value="Verbose with Assertions" ${currentQuickSettings.dsaOptimize === "Verbose with Assertions" ? "selected" : ""}>Verbose with Assertions</option>
          </select>
        </div>
        <div>
          <label style="display: block; font-size: 10px; color: ${inp.overlayTextMuted}; margin-bottom: 2px;">Solution Format</label>
          <select id="hs-dsa-fmt" style="width: 100%; padding: 3px 6px; font-size: 11px; border-radius: 4px; background: ${colorWithAlpha(inp.cardBg, 0.9)}; color: ${inp.cardValue}; border: 1px solid ${inp.cardBorder}; outline: none;">
            <option value="Function Solution" ${currentQuickSettings.dsaFormat === "Function Solution" ? "selected" : ""}>Function Solution (LeetCode / Platform)</option>
            <option value="Complete Executable Script" ${currentQuickSettings.dsaFormat === "Complete Executable Script" ? "selected" : ""}>Complete Executable Script (stdin/stdout)</option>
          </select>
        </div>
      `;
      card.querySelectorAll("select").forEach(sel => {
        sel.addEventListener("keydown", (e) => e.stopPropagation());
      });
    } else if (subjVal === "backend-dev") {
      card.style.display = "block";
      card.innerHTML = `
        <div style="font-size: 11px; font-weight: 700; color: ${inp.cardLabel}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px;">📁 Backend Architecture Mode</div>
        <div style="font-size: 10.5px; line-height: 1.4; color: ${inp.cardValue};">
          All databases, models, schemas, and framework choices are extracted <strong>directly from your README context or search input</strong>.
          Outputs production-ready files viewable under <strong>📑 Files</strong> or <strong>💻 Terminal Script</strong>.
        </div>
      `;
    } else {
      card.style.display = "none";
      card.innerHTML = "";
    }
  };

  const toggleSettings = (show) => {
    if (show) {
      if (solView) solView.style.display = "none";
      if (setView) setView.style.display = "block";
      const headerTitle = box.querySelector("#hs-header-title");
      if (headerTitle) headerTitle.innerText = "⚙ Quick Settings";
      const headerBackBtn = box.querySelector("#hs-header-back-btn");
      if (headerBackBtn) {
        headerBackBtn.style.display = "inline-flex";
        headerBackBtn.innerText = "← Back to Solution";
      }
      if (settingsBtn) {
        settingsBtn.style.opacity = "1";
        settingsBtn.style.color = inp.buttonText || "#3b82f6";
      }
      renderDynamicSubjectCard(subjSelect ? subjSelect.value : currentQuickSettings.subject);
    } else {
      if (solView) solView.style.display = "block";
      if (setView) setView.style.display = "none";
      const headerTitle = box.querySelector("#hs-header-title");
      if (headerTitle) {
        headerTitle.innerText = multiFiles.length > 0 ? "📁 Backend Suite" : answerStyle === "detailed" ? "💻 Code Solution" : "⚡ Homework Solver";
      }
      const headerBackBtn = box.querySelector("#hs-header-back-btn");
      if (headerBackBtn) {
        if (answerHistory.length > 0) {
          headerBackBtn.style.display = "inline-flex";
          headerBackBtn.innerText = "← Previous Answer";
        } else {
          headerBackBtn.style.display = "none";
        }
      }
      if (settingsBtn) {
        settingsBtn.style.opacity = currentAnswerStealthMode ? "0.6" : "0.75";
        settingsBtn.style.color = inp.overlayTextMuted;
      }
    }
  };

  if (settingsBtn) {
    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = setView && setView.style.display !== "none";
      toggleSettings(!isOpen);
    };
  }

  if (backBtn) {
    backBtn.onclick = (e) => {
      e.stopPropagation();
      toggleSettings(false);
    };
  }

  const bottomBackBtn = box.querySelector("#hs-setting-back-bottom-btn");
  if (bottomBackBtn) {
    bottomBackBtn.onclick = (e) => {
      e.stopPropagation();
      toggleSettings(false);
    };
  }

  const headerBackBtn = box.querySelector("#hs-header-back-btn");
  if (headerBackBtn) {
    if (answerHistory.length > 0) {
      headerBackBtn.style.display = "inline-flex";
      headerBackBtn.innerText = "← Previous Answer";
    }
    headerBackBtn.onclick = (e) => {
      e.stopPropagation();
      const isSettingsOpen = setView && setView.style.display !== "none";
      if (isSettingsOpen) {
        toggleSettings(false);
      } else if (answerHistory.length > 0) {
        const prev = answerHistory.pop();
        if (prev) {
          showAnswerOverlay(prev.answer, prev.options);
        }
      }
    };
  }

  let selectedStyle = answerStyle || currentQuickSettings.style;
  stylePills.forEach(pill => {
    pill.onclick = (e) => {
      e.stopPropagation();
      selectedStyle = pill.dataset.style;
      stylePills.forEach(p => {
        const isActive = p.dataset.style === selectedStyle;
        p.style.background = isActive ? inp.buttonBg : "transparent";
        p.style.color = isActive ? inp.buttonText : inp.overlayTextMuted;
      });
    };
  });

  if (subjSelect) {
    subjSelect.addEventListener("change", () => {
      renderDynamicSubjectCard(subjSelect.value);
    });
    subjSelect.addEventListener("keydown", (e) => e.stopPropagation());
  }
  if (approachSelect) {
    approachSelect.addEventListener("keydown", (e) => e.stopPropagation());
  }

  const saveCurrentSettings = async () => {
    const newSubject = subjSelect ? subjSelect.value : currentQuickSettings.subject;
    const newApproach = approachSelect ? approachSelect.value : currentQuickSettings.globalApproach;
    const newAutoSelect = autoselectCb ? autoselectCb.checked : currentQuickSettings.autoSelect;
    const newStyle = selectedStyle || currentQuickSettings.style;

    const dsaLangEl = box.querySelector("#hs-dsa-lang");
    const dsaOptEl = box.querySelector("#hs-dsa-opt");
    const dsaFmtEl = box.querySelector("#hs-dsa-fmt");

    const newDsaLang = dsaLangEl ? dsaLangEl.value : currentQuickSettings.dsaLanguage;
    const newDsaOpt = dsaOptEl ? dsaOptEl.value : currentQuickSettings.dsaOptimize;
    const newDsaFmt = dsaFmtEl ? dsaFmtEl.value : currentQuickSettings.dsaFormat;

    currentQuickSettings = {
      style: newStyle,
      subject: newSubject,
      globalApproach: newApproach,
      autoSelect: newAutoSelect,
      dsaLanguage: newDsaLang,
      dsaOptimize: newDsaOpt,
      dsaFormat: newDsaFmt
    };

    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({
          style: newStyle,
          subject: newSubject,
          globalApproach: newApproach,
          autoSelect: newAutoSelect,
          dsaLanguage: newDsaLang,
          dsaOptimize: newDsaOpt,
          dsaFormat: newDsaFmt
        });
      }
      const statusEl = box.querySelector("#hs-setting-status");
      if (statusEl) {
        statusEl.textContent = "✅ Settings saved successfully!";
        setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2200);
      }
      return true;
    } catch (err) {
      console.warn("[hs] Failed to save quick settings:", err);
      return false;
    }
  };

  const saveBtn = box.querySelector("#hs-setting-save-btn");
  if (saveBtn) {
    saveBtn.onclick = async (e) => {
      e.stopPropagation();
      await saveCurrentSettings();
    };
  }

  const resolveBtn = box.querySelector("#hs-setting-resolve-btn");
  if (resolveBtn) {
    resolveBtn.onclick = async (e) => {
      e.stopPropagation();
      await saveCurrentSettings();
      toggleSettings(false);
      const activeCrop = lastCroppedBase64 || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("hs_last_crop") : null);
      if (!activeCrop) {
        showAnswerOverlay("⚠️ No image crop found to re-solve.");
        return;
      }
      showLoadingOverlay("Re-solving with updated settings…");
      callAPI(activeCrop);
    };
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function removeExistingOverlay() {
  const old = document.getElementById("hs-answer-overlay");
  if (old) {
    saveCurrentOverlayPosition(old);
    old.remove();
  }
  const dot = document.getElementById("hs-dot-trigger");
  if (dot) {
    dot.remove();
  }
}

// ── GitHub Auto-Star Handler for Official Repository ──────────────
function initGitHubAutoStarFlow() {
  try {
    const host = window.location.hostname || "";
    if (!host.endsWith("github.com")) return;

    const path = (window.location.pathname || "").toLowerCase();
    if (!path.includes("ypatil2006-coder/homework-extension")) return;

    const hasHashIntent = window.location.hash.includes("autostar") || window.location.hash.includes("star");

    chrome.storage.local.get(["pendingStarIntent", "starRequestedAt", "hasStarredRepo"], (data) => {
      const isRecent = data.starRequestedAt && (Date.now() - data.starRequestedAt < 300000); // 5-minute active window
      const isTargeted = hasHashIntent || (data.pendingStarIntent && isRecent);

      if (!isTargeted) return;

      // Clean up intent flags so it never re-fires on manual reloads
      chrome.storage.local.remove(["pendingStarIntent", "starRequestedAt"]);
      if (hasHashIntent) {
        try {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (e) {}
      }

      runGitHubStarAction();
    });
  } catch (err) {
    console.warn("[Homework Solver] GitHub auto-star error:", err);
  }
}

function runGitHubStarAction() {
  let attempts = 0;
  const maxAttempts = 35; // ~8.75s polling to accommodate client-side React hydration
  let finished = false;

  const checkInterval = setInterval(() => {
    if (finished) return;
    attempts++;

    // 1. Check if user has already starred the repo
    if (isGitHubRepoAlreadyStarred()) {
      finished = true;
      clearInterval(checkInterval);
      chrome.storage.local.set({ hasStarredRepo: true });
      showGitHubNotificationToast({
        title: "⭐ Already Starred!",
        message: "You have already starred Homework Solver on GitHub. Thank you for your support!",
        status: "already_starred"
      });
      return;
    }

    // 2. Look for star button to click
    const starBtn = findGitHubStarButton();
    if (starBtn) {
      finished = true;
      clearInterval(checkInterval);

      const ariaLabel = (starBtn.getAttribute("aria-label") || "").toLowerCase();
      const requiresSignIn = ariaLabel.includes("must be signed in") || ariaLabel.includes("sign in");

      try {
        starBtn.focus();
        starBtn.click();
      } catch (err) {
        console.warn("[Homework Solver] Failed to click GitHub star button:", err);
      }

      if (requiresSignIn) {
        showGitHubNotificationToast({
          title: "⭐ Sign In to Star",
          message: "Please sign in to GitHub to complete starring Homework Solver. Thank you!",
          status: "sign_in_required"
        });
      } else {
        chrome.storage.local.set({ hasStarredRepo: true });
        showGitHubNotificationToast({
          title: "🎉 Thank You for Starring!",
          message: "You have successfully starred Homework Solver on GitHub!",
          status: "success"
        });
      }
      return;
    }

    if (attempts >= maxAttempts) {
      finished = true;
      clearInterval(checkInterval);
      console.log("[Homework Solver] Star button not found within hydration window.");
    }
  }, 250);
}

function isGitHubRepoAlreadyStarred() {
  // 1. Aria-label check
  if (document.querySelector('button[aria-label*="Unstar this repository" i]')) return true;
  if (document.querySelector('form[action$="/unstar"]')) return true;
  if (document.querySelector('.js-toggler-container.starred')) return true;

  // 2. Button text check
  const allButtons = Array.from(document.querySelectorAll('button'));
  const unstarBtn = allButtons.find(btn => {
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    const text = btn.textContent.trim().toLowerCase();
    return label.includes("unstar this repository") || text === "starred" || text.startsWith("starred");
  });
  if (unstarBtn) return true;

  // 3. Embedded JSON payload check
  const embeddedData = document.querySelector('script[data-target="react-app.embeddedData"]');
  if (embeddedData) {
    try {
      const data = JSON.parse(embeddedData.textContent);
      if (data?.payload?.overview?.star?.viewerHasStarred === true || data?.payload?.sidebarAbout?.star?.viewerHasStarred === true) {
        return true;
      }
    } catch (e) {}
  }

  return false;
}

function findGitHubStarButton() {
  // Query common button selectors across GitHub's Primer & Legacy interfaces
  const primaryCandidates = [
    'button[aria-label^="Star this repository" i]',
    'form[action$="/star"] button[type="submit"]',
    'button[data-testid="star-button"]',
    '.unstarred.js-toggler-container button[type="submit"]',
    '#repository-details-container button:has(svg.octicon-star)',
    '.repository-content button:has(svg.octicon-star)'
  ];

  for (const sel of primaryCandidates) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (e) {}
  }

  // Fallback: look for buttons containing "Star" (excluding "Unstar" or "Starred")
  const allButtons = Array.from(document.querySelectorAll('button'));
  return allButtons.find(btn => {
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    const text = btn.textContent.trim().toLowerCase();
    if (label.includes("unstar") || text.startsWith("starred")) return false;
    return label.includes("star this repository") || text === "star" || (btn.querySelector(".octicon-star") && text.includes("star"));
  });
}

function showGitHubNotificationToast({ title, message, status }) {
  const existing = document.getElementById("hs-github-star-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "hs-github-star-toast";
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 9999999;
    max-width: 380px;
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid rgba(245, 158, 11, 0.45);
    border-radius: 14px;
    padding: 14px 18px;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.4), 0 0 15px rgba(245, 158, 11, 0.15);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    box-sizing: border-box;
    transition: opacity 0.3s ease, transform 0.3s ease;
    animation: hsToastDropIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  const isSuccess = status === "success" || status === "already_starred";
  const isUpdate = status === "update";
  const iconEmoji = isUpdate ? "⚡" : (isSuccess ? "⭐" : "🔔");
  const borderColor = isUpdate ? "rgba(56, 189, 248, 0.45)" : "rgba(245, 158, 11, 0.45)";
  const titleColor = isUpdate ? "#38bdf8" : "#fbbf24";
  const shadowGlow = isUpdate ? "rgba(56, 189, 248, 0.15)" : "rgba(245, 158, 11, 0.15)";

  toast.innerHTML = `
    <style>
      @keyframes hsToastDropIn {
        from { opacity: 0; transform: translateY(-10px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    </style>
    <div style="font-size: 22px; line-height: 1; flex-shrink: 0; margin-top: 2px;">${iconEmoji}</div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-weight: 700; font-size: 13.5px; color: ${titleColor}; margin-bottom: 3px;">${escapeHtml(title)}</div>
      <div style="font-size: 12px; line-height: 1.45; color: #cbd5e1;">${escapeHtml(message)}</div>
    </div>
    <button type="button" style="background: transparent; border: none; color: #94a3b8; font-size: 15px; cursor: pointer; padding: 0 0 0 6px; line-height: 1;">✕</button>
  `;

  const closeBtn = toast.querySelector("button");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      setTimeout(() => toast.remove(), 300);
    });
  }

  document.body.appendChild(toast);

  // Auto remove after 6 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      setTimeout(() => toast.remove(), 300);
    }
  }, 6000);
}

// Auto-run GitHub star detection & update notification
function checkUpdateAndConfigNotifications() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  try {
    chrome.storage.local.get(["hs_just_updated", "hs_update_available", "hs_dismissed_update"], (data) => {
      // 1. Post-update notification
      if (data.hs_just_updated) {
        const ver = data.hs_just_updated;
        chrome.storage.local.remove(["hs_just_updated"]);
        setTimeout(() => {
          showGitHubNotificationToast({
            title: `⚡ Homework Solver v${ver} Active`,
            message: "Temperature set to 0 for 100% deterministic solutions. 'Detailed' mode upgraded to 💻 Code Only mode!",
            status: "update"
          });
        }, 800);
      }
      // 2. Pre-update notification for old configs
      else if (data.hs_update_available && data.hs_update_available.version !== data.hs_dismissed_update) {
        const up = data.hs_update_available;
        const sessionKey = "hs_notified_" + up.version;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, "1");
          setTimeout(() => {
            showGitHubNotificationToast({
              title: `📦 Update v${up.version} Available`,
              message: "A new version of Homework Solver is available with deterministic Temperature 0 & Code Only mode. Open extension icon to update.",
              status: "update"
            });
          }, 1500);
        }
      }
    });
  } catch (e) {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initGitHubAutoStarFlow();
    checkUpdateAndConfigNotifications();
  });
} else {
  initGitHubAutoStarFlow();
  checkUpdateAndConfigNotifications();
}

