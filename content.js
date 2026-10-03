window.addEventListener("hs-start-snip", () => startSnipping());
window.addEventListener("hs-close-overlay-and-dot", () => removeExistingOverlay());

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "startSnip") {
      startSnipping();
    } else if (msg.action === "closeOverlayAndDot") {
      removeExistingOverlay();
    }
  });
}

let isSnipping = false;
let startX, startY, selectionBox;
let screenshotDataUrl = null;
let lastCroppedBase64 = null;
let savedOverlayPos = null;

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

if (typeof chrome !== "undefined" && chrome.storage?.local) {
  try {
    chrome.storage.local.get([
      "hsOverlayPos", "snipCursor", "customCursorUrl",
      "snipThemeMode", "snipCustomTheme", "answerThemeMode", "answerCustomTheme", "splitAnswerTheme",
      "themeMode", "customTheme",
      "snipDimming", "snipBorderThickness", "snipFillOpacity", "snipBorderStyle", "snipBorderGlow", "snipShowHint",
      "answerStealthMode", "answerBorderThickness", "answerBorderRadius", "answerWidth", "answerOpacity", "answerBlur", "answerFontSize", "answerBorderStyle", "answerDragBar", "answerAutoCopy",
      "answerCustomColorEnabled", "answerCustomBgColor", "answerCustomTextColor", "answerCustomBorderColor"
    ], (res) => {
      if (res) {
        if (res.hsOverlayPos) savedOverlayPos = res.hsOverlayPos;
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

  try {
    chrome.runtime.sendMessage({ action: "captureScreen" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.dataUrl) {
        screenshotDataUrl = res.dataUrl;
      }
    });
  } catch (e) {
    alert("Extension context invalidated. Please refresh this page (F5).");
    isSnipping = false;
    return;
  }

  const inp = activeSnipConfig.inpage;

  const dimAlpha = Math.max(0, Math.min(100, currentSnipDimming)) / 100;
  const overlayBg = (dimAlpha > 0) ? `rgba(0, 0, 0, ${dimAlpha})` : "transparent";

  const overlay = document.createElement("div");
  overlay.id = "hs-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: ${overlayBg};
    z-index: 999999; cursor: ${getSnipCursorCss()} !important;
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
    z-index: 9999999; pointer-events: none;
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
    z-index: 9999998; pointer-events: none;
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
      try {
        chrome.runtime.sendMessage({ action: "captureScreen" }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res && res.dataUrl) {
            screenshotDataUrl = res.dataUrl;
          }
        });
      } catch (err) {}
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
function cropAndSolve(x1, y1, x2, y2) {
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
    callAPI(croppedBase64);
  };
  img.src = screenshotDataUrl;
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

// ── Call AI API (Two-Phase Streaming Orchestrator) ─
async function callAPI(b64, { forceStyle } = {}) {
  const loadingStatus = forceStyle === "detailed" ? "Generating step-by-step derivation..." : "Solving question...";
  showLoadingOverlay(loadingStatus);

  if (!isContextValid()) {
    showAnswerOverlay("Extension reloaded. Please refresh this page (F5) to continue.");
    return;
  }

  let keys, style, models, subject, lastGood, autoSelect;
  try {
    const data = await chrome.storage.local.get(["keys", "style", "models", "subject", "lastGood", "autoSelect"]);
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
  } catch (e) {
    showAnswerOverlay("Extension context invalidated. Please refresh this page (F5).");
    return;
  }

  let customModel = (models || {})["Groq"] || "";
  if (DEPRECATED_GROQ_MODELS.has(customModel)) {
    customModel = "";
  }
  const answerStyle = forceStyle || style || "detailed";

  const aptitudePersona = "You are an Elite Quantitative Aptitude, Logical Reasoning & Mathematics Specialist. You master both numerical aptitude and logical deduction:\n" +
    "- Quantitative Aptitude: Exact calculations for percentages, ratios, profit & loss, work & time, speed-time-distance, averages, mixtures, number series, simple/compound interest, geometry, mensuration, and algebraic equations. Pay strict attention to units and dimensional consistency.\n" +
    "- Logical Reasoning & Puzzles: Formal deductions for linear/circular seating arrangements, family trees & blood relations, syllogisms (strict Venn logic), direction sense, input-output machines, coding-decoding, and matrix elimination grids. Never make unstated assumptions.";

  const subjectPersona = {
    auto: "You are an Expert Academic Tutor & Multi-Disciplinary Problem Solver. Rigorously analyze problems across sciences, engineering, mathematics, and humanities from first principles. Extract given parameters, verify step-by-step logic, and check for negative constraints (NOT, EXCEPT, LEAST).",
    "aptitude-reasoning": aptitudePersona,
    "logical-reasoning": aptitudePersona,
    "prob-stats": "You are a Senior Probability & Mathematical Statistics Specialist. Rigorously analyze discrete and continuous probability distributions (Binomial, Poisson, Normal, Exponential), conditional probability, Bayes' Theorem, expected value, variance, hypothesis testing, p-values, regression, and combinatorics (permutations & combinations). Verify sample spaces and independence assumptions before calculating.",
    "ai-finance": "You are a Senior Quantitative Finance & AI for Finance Specialist. Rigorously analyze financial mathematics, options pricing, Sharpe/Sortino ratios, risk models (VaR), portfolio optimization, time value of money, trading logic, and ML/RAG evaluation metrics with financial and algorithmic precision.",
    "dsa": "You are a Principal Algorithms Engineer & Competitive Programming Specialist. Rigorously analyze data structures (trees, graphs, heaps, hash maps, tries) and algorithmic techniques (DP, two pointers, sliding window, binary search, DFS/BFS). Trace invariants, time/space complexity, and boundary edge cases (null, empty, single element, cycles, integer overflow).",
    "backend-dev": "You are a Staff Backend Systems Engineer. Rigorously analyze code logic, HTTP specifications, REST/GraphQL APIs, database queries (SQL/NoSQL transactions, indexing), authentication/JWT, concurrency, race conditions, and error-handling semantics.",
    "communication": "You are an Expert in Linguistic Analysis, English Grammar, and Verbal Ability. Rigorously analyze grammatical correctness (subject-verb agreement, modifiers, tense, parallelism), vocabulary in context, reading comprehension logic, sentence completion, and argument structures."
  };

  const domainIntro = subjectPersona[subject || "auto"] || subjectPersona["auto"];

  const reasoningProtocol = `
TWO-STEP REASONING PROTOCOL:
Solve the problem in two disciplined steps inside <think>...</think> tags:
<think>
Step 1 (Deconstruct & Solve): Parse parameters, constraints (NOT/EXCEPT), and compute the exact solution from first principles.
Step 2 (Verify & Finalize): Sanity check against all options, eliminate wrong options, and confirm the singular correct choice.
</think>
CRITICAL CONSTRAINT: Keep internal reasoning CONCISE (under 120 words). Do NOT ramble. Conclude with </think> immediately upon verifying the answer, then output the final answer outside <think>.
`;

  const systemPrompts = {
    detailed: `${domainIntro}\n${reasoningProtocol}\nCODING INSTRUCTION: If this is a coding question or asks for a program, function, method, query, or algorithm, output ONLY the pure functional code in the language specified or implied outside <think> tags. Absolutely NO explanations, NO markdown intro/outro, NO plan, and NO comments inside or outside the code. For non-coding questions, provide a clear, direct, structured step-by-step breakdown outside <think> tags.`,
    short: `${domainIntro}\n${reasoningProtocol}\nCODING INSTRUCTION: If this is a coding question, output ONLY the pure code outside <think> tags with zero comments and zero explanations. Otherwise, outside <think> tags, respond with EXACTLY two lines and nothing else:\nWhy: <one short line explaining why this answer is correct>\nFinal Answer: <the direct final answer>`,
    mcq: `${domainIntro}\n${reasoningProtocol}\nMCQ INSTRUCTION: Execute Step 1 and Step 2 inside <think> tags to determine and verify the correct option. Then, OUTSIDE <think> tags, respond with EXACTLY two lines and nothing else:\nWhy: <one short line summarizing why this option is correct>\nCorrect Option: <Option Letter> — <full option text>`
  };

  const userPrompts = {
    detailed: "Solve the question in this screenshot. Follow the Two-Step Reasoning protocol internally in <think>...</think> concisely. If this is a coding problem, output ONLY the complete code outside <think> with NO comments, NO explanations, and NO surrounding text. Otherwise output the clean step-by-step solution.",
    short: "Solve the question in this screenshot. Follow the Two-Step Reasoning protocol internally in <think>...</think> concisely. If this is a coding problem, output ONLY the code without comments or text. Otherwise outside <think>, output exactly two lines: Why: <explanation> and Final Answer: <the answer>.",
    mcq: "Solve the MCQ in this screenshot. Follow the Two-Step Reasoning protocol internally in <think>...</think> concisely. Outside <think>, output exactly two lines: Why: <explanation> and Correct Option: <Letter> — <full option text>."
  };

  // Output token budget: 750 tokens gives more than 3x headroom for concise
  // internal reasoning (<think>...) while keeping Groq rate-limiter reservation low.
  const maxTokensMap = {
    mcq: 750,
    short: 750,
    detailed: 1500
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
  let rafPending = false;
  let latestStreamText = "";
  const paintChunk = (partialText) => {
    latestStreamText = partialText;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (latestStreamText) {
          updateStreamingOverlay(latestStreamText, answerStyle);
        }
      });
    }
  };
  const flushChunk = () => {
    if (rafPending) {
      rafPending = false;
      if (latestStreamText) {
        updateStreamingOverlay(latestStreamText, answerStyle);
      }
    }
  };

  // Phase 1: Try primary rotated key with a 10s first-token deadline
  const primaryCfg = candidateConfigs[0];
  console.log(`[hs] Requesting Groq using Key #${(primaryCfg.keyIndex ?? 0) + 1}/${primaryCfg.totalKeys}`);
  const phase1 = await callStream({ ...primaryCfg, deadlineMs: 10000, onChunk: paintChunk });
  flushChunk();

  if (phase1.ok) {
    chrome.storage.local.set({ lastGood: { GroqModel: primaryCfg.model } });
    showAnswerOverlay(phase1.text, {
      style: answerStyle,
      truncated: phase1.truncated,
      autoSelect,
      meta: { provider: "Groq", keyIndex: primaryCfg.keyIndex, totalKeys: primaryCfg.totalKeys }
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
        meta: { provider: "Groq", keyIndex: fallbackCfg.keyIndex, totalKeys: fallbackCfg.totalKeys, fallback: true }
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
// response, tolerating small wording variations and markdown formatting.
function parseAnswer(text) {
  const parts = { why: "", correct: "", final: "", extra: [] };
  const lines = String(text || "").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const unbold = line.replace(/^\*\*|\*\*$/g, "").trim();
    if (/^(?:\*{0,2})why\s*:/i.test(unbold)) {
      parts.why = unbold.replace(/^(?:\*{0,2})why\s*:\s*(?:\*\*)?/i, "").trim();
    } else if (/^(?:\*{0,2})(?:the\s+)?(?:correct\s+)?(?:option|answer)\s*(?::|is)\s*/i.test(unbold)) {
      parts.correct = unbold.replace(/^(?:\*{0,2})(?:the\s+)?(?:correct\s+)?(?:option|answer)\s*(?::|is)\s*(?:\*\*)?/i, "").trim();
    } else if (/^(?:\*{0,2})final\s+answer\s*(?::|is)\s*/i.test(unbold)) {
      parts.final = unbold.replace(/^(?:\*{0,2})final\s+answer\s*(?::|is)\s*(?:\*\*)?/i, "").trim();
    } else {
      parts.extra.push(line);
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

function getCleanAnswerOnly(rawText, parts) {
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
  let box = document.getElementById("hs-answer-overlay");
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

  box.innerHTML = `
    <div id="hs-drag-bar" style="position: absolute; top: 0; left: 0; right: 40px; height: 26px; cursor: grab; z-index: 5; display: ${currentAnswerDragBar ? 'block' : 'none'};"></div>
    <button id="hs-close" title="Close" style="
      position: absolute; top: 2px; right: 2px;
      width: 34px; height: 34px;
      background: transparent; color: ${inp.overlayTextMuted}; border: none;
      cursor: pointer; font-size: 13px; font-weight: 600; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      padding: 0; z-index: 10; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'};
      transition: opacity 0.12s ease, transform 0.1s ease;
    ">✕</button>
    <div style="padding-top: 4px; padding-right: 28px; white-space: pre-wrap; line-height: 1.45; font-size: ${currentAnswerFontSize}px; color: ${inp.overlayTextPrimary}; user-select: text; -webkit-user-select: text; cursor: text;">${liveBody}</div>
    <style>
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
      #hs-close:hover { opacity: 1 !important; }
      #hs-close:active { transform: scale(0.88); }
    </style>
  `;

  makeDraggable(box);
  document.getElementById("hs-close").onclick = removeExistingOverlay;
}

// ── Loading overlay ────────────────────────────────
function showLoadingOverlay(statusText = "Solving question...") {
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
  box.innerHTML = `
    <div id="hs-drag-bar" style="position: absolute; top: 0; left: 0; right: 40px; height: 26px; cursor: grab; z-index: 5; display: ${currentAnswerDragBar ? 'block' : 'none'};"></div>
    <button id="hs-close" title="Close" style="
      position: absolute; top: 2px; right: 2px;
      width: 34px; height: 34px;
      background: transparent; color: ${inp.overlayTextMuted}; border: none;
      cursor: pointer; font-size: 13px; font-weight: 600; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      padding: 0; z-index: 10; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'};
      transition: opacity 0.12s ease, transform 0.1s ease;
    ">✕</button>
    <div style="display: flex; align-items: center; gap: 9px; padding-right: 28px; user-select: text; -webkit-user-select: text; cursor: text;">
      <div style="width: 14px; height: 14px; border: 2px solid ${inp.spinnerColor}; border-top-color: transparent; border-radius: 50%; animation: hsSpin 0.8s linear infinite; flex-shrink: 0;"></div>
      <span style="font-size: ${currentAnswerFontSize}px; font-weight: 600; color: ${inp.overlayTextPrimary};">${escapeHtml(statusText)}</span>
    </div>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600;1,700&family=Playfair+Display:ital,wght@1,600;1,700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap');
      @keyframes hsSpin { to { transform: rotate(360deg); } }
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
      #hs-close:hover { opacity: 1 !important; }
      #hs-close:active { transform: scale(0.88); }
    </style>
  `;
  document.body.appendChild(box);
  applyOverlayPosition(box);
  makeDraggable(box);
  document.getElementById("hs-close").onclick = removeExistingOverlay;
}

// ── Auto-select MCQ option on webpage DOM ───────────
function selectOptionOnPage(optionText) {
  if (!optionText) return false;
  
  let letter = "";
  let answerContent = optionText.toLowerCase();

  const match = optionText.match(/^(?:Option\s*)?([A-D1-4])\b[\s\)\.\:\—\-]*([\s\S]*)$/i);
  if (match) {
    letter = match[1].toUpperCase();
    if (match[2]) {
      answerContent = match[2].trim().toLowerCase();
    }
  }

  const triggerClick = (el) => {
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e){}
    el.click();
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };

  const isMatch = (txt) => {
    txt = (txt || "").trim().toLowerCase();
    if (!txt) return false;
    
    // Match by content
    if (answerContent && answerContent.length > 1) {
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

  // 1. Search radio/checkbox inputs on page
  const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]'));
  for (const input of inputs) {
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
      return triggerClick(input);
    }
  }

  // 2. Search clickable option containers
  const clickables = Array.from(document.querySelectorAll('label, button, li, div[class*="option"], div[class*="choice"], div[class*="answer"], div[class*="mcq"], div[class*="radio"], [role="button"]'));
  for (const el of clickables) {
    if (el.closest('#hs-answer-overlay')) continue;
    const txt = (el.innerText || el.textContent || "").trim();
    if (!txt || txt.length > 250) continue;

    if (isMatch(txt)) {
      return triggerClick(el);
    }
  }

  // 3. Aggressive fallback: find any matching text element and look for a radio button nearby
  const allTags = Array.from(document.querySelectorAll('span, div, p, td'));
  for (const tag of allTags) {
    if (tag.closest('#hs-answer-overlay')) continue;
    const t = (tag.innerText || tag.textContent || "").trim();
    if (t.length > 0 && t.length < 150 && isMatch(t)) {
      let radio = tag.parentElement?.querySelector('input[type="radio"], input[type="checkbox"]');
      if (!radio) radio = tag.parentElement?.parentElement?.querySelector('input[type="radio"], input[type="checkbox"]');
      if (!radio) radio = tag.closest('li, tr, .option, .choice')?.querySelector('input[type="radio"], input[type="checkbox"]');
      
      if (radio) return triggerClick(radio);
      return triggerClick(tag);
    }
  }

  return false;
}

// ── Answer overlay — bottom left ───────────────────
function showAnswerOverlay(answer, { style, truncated, autoSelect, meta } = {}) {
  const existing = document.getElementById("hs-answer-overlay");
  if (existing) {
    saveCurrentOverlayPosition(existing);
  }
  removeExistingOverlay();

  const cleanAnswer = stripThinkTags(answer);
  const answerStyle = style || "detailed";

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
    max-height: 440px;
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

  // ENFORCE the selected style. The model may ignore the 2-line contract, so we
  // parse the response and, in MCQ/Short mode, render ONLY the required lines —
  // any reasoning the model added is dropped instead of shown as a full answer.
  const parts = parseAnswer(cleanAnswer);
  const strictMode = answerStyle === "mcq" || answerStyle === "short";
  const keyLineCaptured = answerStyle === "mcq" ? !!parts.correct
                        : answerStyle === "short" ? !!parts.final
                        : true;

  let formattedHtml = "";

  if (currentAnswerStealthMode) {
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
        const success = selectOptionOnPage(parts.correct);
        autoSelectStatus = success ? ` <span style="font-size: 10px; color: #059669; font-weight: 700;">✓</span>` : "";
      }
      formattedHtml += `
        <div class="hs-stealth-row" style="margin-bottom: 7px; font-size: ${currentAnswerFontSize + 0.5}px; font-weight: 600; line-height: 1.45; color: ${inp.cardValue};">
          <span class="hs-card-label" style="font-weight: 700; color: ${inp.cardLabel}; margin-right: 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px;">Option</span>
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
        const success = selectOptionOnPage(parts.correct);
        autoSelectStatus = success 
          ? `<span style="color: ${inp.badgeSuccess}; font-size: 11px; margin-left: 8px; font-weight: 700; font-style: normal; font-family: 'Plus Jakarta Sans', sans-serif;">(⚡ Selected on Page)</span>`
          : `<span style="color: ${inp.badgeWarning}; font-size: 11px; margin-left: 8px; font-weight: 700; font-style: normal; font-family: 'Plus Jakarta Sans', sans-serif;">(⚠️ Verify manually)</span>`;
      }

      formattedHtml += `
        <div class="hs-card" style="background: ${inp.cardBg}; border-left: 2.5px solid ${inp.cardBorder}; border-radius: 0 8px 8px 0; padding: 7px 12px; margin-bottom: 9px;">
          <span class="hs-card-label" style="font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 700; color: ${inp.cardLabel}; display: block; font-size: 12.5px; letter-spacing: 0.2px; margin-bottom: 3px;">Opzione Corretta • Correct Option</span>
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

  let expandStepBtnHtml = "";
  if (strictMode && lastCroppedBase64) {
    if (currentAnswerStealthMode) {
      expandStepBtnHtml = `
        <div style="margin-top: 6px; padding-top: 4px;">
          <button id="hs-expand-step" style="
            background: transparent; color: ${inp.buttonText};
            border: none; padding: 2px 4px; font-size: 11px;
            cursor: pointer; opacity: 0.75; font-family: inherit;
          ">[+ explain step-by-step]</button>
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
            <span>🔍</span> Explain Step-by-Step
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
    <div id="hs-drag-bar" style="position: absolute; top: 0; left: 0; right: 70px; height: 26px; cursor: grab; z-index: 5; display: ${currentAnswerDragBar ? 'block' : 'none'};"></div>
    <div style="position: absolute; top: 2px; right: 2px; display: flex; align-items: center; gap: 2px; z-index: 10;">
      <button id="hs-copy" title="Copy clean answer" style="
        width: 32px; height: 32px;
        background: transparent; color: ${inp.overlayTextMuted}; border: none;
        cursor: pointer; font-size: 14px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'}; transition: opacity 0.12s ease, transform 0.1s ease;
      ">⎘</button>
      <button id="hs-close" title="Close" style="
        width: 32px; height: 32px;
        background: transparent; color: ${inp.overlayTextMuted}; border: none;
        cursor: pointer; font-size: 13px; font-weight: 600; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 0; opacity: ${currentAnswerStealthMode ? '0.6' : '0.75'}; transition: opacity 0.12s ease, transform 0.1s ease;
      ">✕</button>
    </div>
    <div style="padding-top: 4px; padding-right: 28px; user-select: text; -webkit-user-select: text; cursor: text;">
      ${formattedHtml}
      ${expandStepBtnHtml}
      ${truncNote}
      ${keyBadge}
    </div>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600;1,700&family=Playfair+Display:ital,wght@1,600;1,700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap');
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
      #hs-copy:hover, #hs-close:hover { opacity: 1 !important; }
      #hs-copy:active, #hs-close:active { transform: scale(0.88); }
      #hs-expand-step:hover { filter: brightness(1.08); }
      #hs-expand-step:active { transform: scale(0.96); }
    </style>
  `;

  document.body.appendChild(box);
  applyOverlayPosition(box);
  makeDraggable(box);

  document.getElementById("hs-close").onclick = removeExistingOverlay;

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
      if (!lastCroppedBase64) return;
      showLoadingOverlay("Generating step-by-step derivation...");
      callAPI(lastCroppedBase64, { forceStyle: "detailed" });
    };
  }

  const onlyAnswerText = getCleanAnswerOnly(cleanAnswer, parts);

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
  document.getElementById("hs-copy").onclick = () => {
    const toCopy = getCleanAnswerOnly(cleanAnswer, parts) || cleanAnswer;
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
}
