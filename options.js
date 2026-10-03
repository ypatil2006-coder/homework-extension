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

// ── Independent Theme Settings State ────────────────
let snipThemeMode = "default"; // "default" or "customized"
let snipCustomTheme = "catppuccin-mocha";
let answerThemeMode = "default"; // "default" or "customized"
let answerCustomTheme = "catppuccin-mocha";
let splitAnswerTheme = false;

let tabThemeMode = "default"; // "default" or "customized"
let tabCustomTheme = "catppuccin-mocha";

// ── Snipping Optics & Geometry State ────────────────
let snipDimming = 15;
let snipBorderThickness = 2; // Supports 0px absolute zero
let snipFillOpacity = 12;
let snipBorderStyle = "dashed";
let snipBorderGlow = true;
let snipShowHint = true;

// ── Answer Pop-up Optics & Geometry State ───────────
let answerStealthMode = false;
let answerBorderThickness = 1; // Supports 0px absolute zero
let answerBorderRadius = 14;
let answerWidth = 350;
let answerOpacity = 98;
let answerBlur = 14;
let answerFontSize = 13;
let answerBorderStyle = "solid";
let answerDragBar = true;
let answerAutoCopy = false;

// Custom Window Colors
let answerCustomColorEnabled = false;
let answerCustomBgColor = "#181825";
let answerCustomTextColor = "#cdd6f4";
let answerCustomBorderColor = "#89b4fa";

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

function renderThemeGrid(containerId, activeThemeId, onSelectCallback) {
  const grid = document.getElementById(containerId);
  if (!grid || typeof HS_THEMES === "undefined") return;

  grid.innerHTML = "";
  const themeEntries = Object.entries(HS_THEMES).filter(([id]) => id !== "default");

  themeEntries.forEach(([id, theme]) => {
    const item = document.createElement("div");
    const isActive = (id === activeThemeId);
    item.className = `theme-flow-entry ${isActive ? "active" : ""}`;
    item.dataset.themeId = id;

    const gradient = theme.silkGradient || 
      `linear-gradient(90deg, ${(theme.swatches || []).join(', ')})`;

    item.innerHTML = `
      <div class="theme-flow-main">
        <div class="theme-flow-header">
          <span class="theme-flow-indicator">${isActive ? '✦' : '•'}</span>
          <span class="theme-flow-name">${theme.name}</span>
          ${theme.italianMood ? `<span class="theme-flow-mood">${theme.italianMood}</span>` : ''}
          <span class="theme-flow-tag ${theme.type}">${theme.type.toUpperCase()}</span>
        </div>
        <div class="theme-flow-sub">${theme.subtitle || ""}</div>
      </div>
      <div class="theme-flow-aside">
        <div class="theme-silk-bar" style="background: ${gradient};" title="${theme.name} Silk Ribbon"></div>
      </div>
    `;

    item.addEventListener("click", () => {
      onSelectCallback(id);
    });

    grid.appendChild(item);
  });
}

function renderAllThemeGrids() {
  renderThemeGrid("snipThemeGrid", snipCustomTheme, (id) => {
    snipCustomTheme = id;
    if (answerThemeMode !== "customized") {
      answerCustomTheme = id;
    }
    updateThemeUI();
    persistThemeSettings();
  });

  renderThemeGrid("answerTabThemeGrid", answerCustomTheme, (id) => {
    answerCustomTheme = id;
    updateThemeUI();
    persistThemeSettings();
  });

  renderThemeGrid("tabThemeGrid", tabCustomTheme, (id) => {
    tabCustomTheme = id;
    updateThemeUI();
    persistThemeSettings();
  });
}

function updateThemeUI() {
  const isSnipCustom = (snipThemeMode === "customized");
  const isAnswerCustom = (answerThemeMode === "customized");
  const isTabCustom = (tabThemeMode === "customized");

  // 1. Snipping Tool UI elements
  const snipToggle = document.getElementById("snipThemeToggle");
  const snipSection = document.getElementById("snipThemeSection");
  const snipBadge = document.getElementById("snipThemeBadge");

  if (snipToggle) snipToggle.checked = isSnipCustom;
  if (snipSection) snipSection.style.display = isSnipCustom ? "flex" : "none";

  const activeSnipTheme = (isSnipCustom && typeof HS_THEMES !== "undefined" && HS_THEMES[snipCustomTheme])
    ? HS_THEMES[snipCustomTheme]
    : ((typeof HS_THEMES !== "undefined" && HS_THEMES["default"]) ? HS_THEMES["default"] : null);

  if (snipBadge && activeSnipTheme) {
    snipBadge.innerText = isSnipCustom ? `${activeSnipTheme.name} ✦` : "Atelier Sand (Default)";
  }

  // Update active entries in snip flow
  document.querySelectorAll("#snipThemeGrid .theme-flow-entry, #snipThemeGrid .theme-card").forEach(c => {
    const isAct = (c.dataset.themeId === snipCustomTheme);
    c.classList.toggle("active", isAct);
    const ind = c.querySelector(".theme-flow-indicator");
    if (ind) ind.innerText = isAct ? '✦' : '•';
  });

  // 2. Answer Pop-up UI elements
  const answerToggle = document.getElementById("answerThemeToggle");
  const answerSection = document.getElementById("answerThemeSection");
  const answerBadge = document.getElementById("answerThemeBadge");

  if (answerToggle) answerToggle.checked = isAnswerCustom;
  if (answerSection) answerSection.style.display = isAnswerCustom ? "flex" : "none";

  const activeAnswerTheme = (isAnswerCustom && typeof HS_THEMES !== "undefined" && HS_THEMES[answerCustomTheme])
    ? HS_THEMES[answerCustomTheme]
    : ((isSnipCustom && activeSnipTheme) ? activeSnipTheme : ((typeof HS_THEMES !== "undefined" && HS_THEMES["default"]) ? HS_THEMES["default"] : null));

  if (answerBadge && activeAnswerTheme) {
    answerBadge.innerText = isAnswerCustom ? `${activeAnswerTheme.name} ✦` : "Atelier Sand (Default)";
  }

  // Update active entries in answer flow
  document.querySelectorAll("#answerTabThemeGrid .theme-flow-entry, #answerTabThemeGrid .theme-card").forEach(c => {
    const isAct = (c.dataset.themeId === answerCustomTheme);
    c.classList.toggle("active", isAct);
    const ind = c.querySelector(".theme-flow-indicator");
    if (ind) ind.innerText = isAct ? '✦' : '•';
  });

  // Stealth Mode controls in UI
  const stealthToggle = document.getElementById("answerStealthToggle");
  const stealthNotice = document.getElementById("stealthNotice");
  const stealthBadge = document.getElementById("stealthActiveBadge");
  const customWrapper = document.getElementById("answerCustomizationWrapper");

  if (stealthToggle) stealthToggle.checked = answerStealthMode;
  if (stealthNotice) stealthNotice.style.display = answerStealthMode ? "block" : "none";
  if (stealthBadge) stealthBadge.innerText = answerStealthMode ? "Ghost Active 🥷" : "Ghost Watermark";
  if (customWrapper) {
    customWrapper.style.opacity = answerStealthMode ? "0.4" : "1";
    customWrapper.style.pointerEvents = answerStealthMode ? "none" : "auto";
  }

  // Custom Window Colors in UI
  const custColorToggle = document.getElementById("answerCustomColorToggle");
  const custColorPickers = document.getElementById("answerCustomColorPickers");
  if (custColorToggle) custColorToggle.checked = answerCustomColorEnabled;
  if (custColorPickers) custColorPickers.style.display = answerCustomColorEnabled ? "grid" : "none";

  const bgPick = document.getElementById("answerCustomBgColorPicker");
  const bgTxt = document.getElementById("answerCustomBgColorText");
  if (bgPick) bgPick.value = answerCustomBgColor;
  if (bgTxt) bgTxt.value = answerCustomBgColor;

  const txtPick = document.getElementById("answerCustomTextColorPicker");
  const txtTxt = document.getElementById("answerCustomTextColorText");
  if (txtPick) txtPick.value = answerCustomTextColor;
  if (txtTxt) txtTxt.value = answerCustomTextColor;

  const bdrPick = document.getElementById("answerCustomBorderColorPicker");
  const bdrTxt = document.getElementById("answerCustomBorderColorText");
  if (bdrPick) bdrPick.value = answerCustomBorderColor;
  if (bdrTxt) bdrTxt.value = answerCustomBorderColor;

  // Blur and Opacity slider text updates
  const ansBlurSliderEl = document.getElementById("answerBlurSlider");
  const ansBlurValEl = document.getElementById("answerBlurVal");
  if (ansBlurSliderEl) ansBlurSliderEl.value = answerBlur;
  if (ansBlurValEl) ansBlurValEl.innerText = (answerBlur === 0) ? "0px (Off)" : `${answerBlur}px`;

  const ansOpacitySliderEl = document.getElementById("answerOpacitySlider");
  const ansOpacityValEl = document.getElementById("answerOpacityVal");
  if (ansOpacitySliderEl) ansOpacitySliderEl.value = answerOpacity;
  if (ansOpacityValEl) ansOpacityValEl.innerText = `${answerOpacity}%`;

  // 3. Settings Tab & Popup UI elements
  const tabToggle = document.getElementById("tabThemeToggle");
  const tabSection = document.getElementById("tabThemeSection");
  const tabBadge = document.getElementById("tabThemeBadge");

  if (tabToggle) tabToggle.checked = isTabCustom;
  if (tabSection) tabSection.style.display = isTabCustom ? "flex" : "none";

  const activeTabTheme = (isTabCustom && typeof HS_THEMES !== "undefined" && HS_THEMES[tabCustomTheme])
    ? HS_THEMES[tabCustomTheme]
    : ((typeof HS_THEMES !== "undefined" && HS_THEMES["default"]) ? HS_THEMES["default"] : null);

  if (tabBadge && activeTabTheme) {
    tabBadge.innerText = isTabCustom ? `${activeTabTheme.name} ✦` : "Atelier Sand (Default)";
  }

  // Update active entries in tab flow
  document.querySelectorAll("#tabThemeGrid .theme-flow-entry, #tabThemeGrid .theme-card").forEach(c => {
    const isAct = (c.dataset.themeId === tabCustomTheme);
    c.classList.toggle("active", isAct);
    const ind = c.querySelector(".theme-flow-indicator");
    if (ind) ind.innerText = isAct ? '✦' : '•';
  });

  // Apply tab theme variables immediately to this settings tab!
  if (typeof HS_applyThemeVariables === "function" && typeof HS_THEMES !== "undefined") {
    if (isTabCustom && activeTabTheme) {
      HS_applyThemeVariables(document.documentElement, activeTabTheme);
    } else {
      HS_applyThemeVariables(document.documentElement, HS_THEMES["default"]);
    }
  }

  // Update in-page live preview boxes
  updateLiveThemePreview(activeSnipTheme, activeAnswerTheme);
}

function updateLiveThemePreview(snipTheme, answerTheme) {
  if (!snipTheme || !snipTheme.inpage || !answerTheme || !answerTheme.inpage) return;
  const sInp = snipTheme.inpage;
  const aInp = answerTheme.inpage;

  // 1. Snipping Tool Preview
  const previewBox = document.getElementById("themePreviewBox");
  const snipPill = document.getElementById("previewSnipPill");
  const selBox = document.getElementById("previewSelectionBox");

  if (previewBox) {
    previewBox.style.backgroundColor = (snipDimming > 0) ? `rgba(0, 0, 0, ${snipDimming / 100})` : "transparent";
  }

  if (snipPill) {
    snipPill.style.display = snipShowHint ? "inline-flex" : "none";
    snipPill.style.background = sInp.snipHintBg;
    snipPill.style.border = `1px solid ${sInp.snipHintBorder}`;
    snipPill.style.color = sInp.snipHintText;
    snipPill.style.boxShadow = sInp.snipHintShadow;
  }

  if (selBox) {
    if (snipBorderThickness <= 0 || snipBorderStyle === "none") {
      selBox.style.border = "none";
    } else {
      selBox.style.border = `${snipBorderThickness}px ${snipBorderStyle} ${sInp.snipBorder}`;
    }
    selBox.style.background = (snipFillOpacity <= 0) ? "transparent" : colorWithAlpha(sInp.snipBorder, snipFillOpacity / 100);
    selBox.style.boxShadow = (snipBorderGlow && snipBorderThickness > 0)
      ? (sInp.snipBoxShadow || `0 0 14px ${colorWithAlpha(sInp.snipBorder, 0.4)}`)
      : "none";
    selBox.style.color = sInp.snipBorder;
  }

  // 2. Answer Pop-up Live Simulation Preview
  const ansContainer = document.getElementById("answerPreviewContainer");
  const ansDragHead = document.getElementById("answerPreviewDragHead");
  const ansDragTitle = document.getElementById("answerPreviewDragTitle");
  const ansWhyBox = document.getElementById("answerPreviewWhyBox");
  const ansWhyTag = document.getElementById("answerPreviewWhyTag");
  const ansWhyContent = document.getElementById("answerPreviewWhyContent");
  const ansCorrectBox = document.getElementById("answerPreviewCorrectBox");
  const ansCorrectTag = document.getElementById("answerPreviewCorrectTag");
  const ansCorrectVal = document.getElementById("answerPreviewCorrectValue");
  const ansAutoBadge = document.getElementById("answerPreviewAutoBadge");
  const ansCopyBtn = document.getElementById("answerPreviewCopyBtn");

  if (answerStealthMode) {
    if (ansContainer) {
      ansContainer.classList.add("stealth-sim");
      ansContainer.style.width = `${Math.min(answerWidth, 340)}px`;
      ansContainer.style.borderRadius = "8px";
      ansContainer.style.background = "transparent";
      ansContainer.style.backdropFilter = "blur(2px)";
      ansContainer.style.webkitBackdropFilter = "blur(2px)";
      ansContainer.style.border = "none";
      ansContainer.style.boxShadow = "none";
      ansContainer.style.color = "#000000";
    }
    if (ansDragHead) ansDragHead.style.display = "none";
    if (ansWhyBox) {
      ansWhyBox.style.background = "transparent";
      ansWhyBox.style.borderLeft = "none";
      ansWhyBox.style.padding = "4px 0";
    }
    if (ansWhyTag) {
      ansWhyTag.style.color = "#000000";
      ansWhyTag.style.textShadow = "none";
      ansWhyTag.innerText = "Why:";
    }
    if (ansWhyContent) {
      ansWhyContent.style.color = "#000000";
      ansWhyContent.style.textShadow = "none";
      ansWhyContent.style.fontSize = "11.5px";
    }
    if (ansCorrectBox) {
      ansCorrectBox.style.background = "transparent";
      ansCorrectBox.style.borderLeft = "none";
      ansCorrectBox.style.padding = "4px 0";
    }
    if (ansCorrectTag) {
      ansCorrectTag.style.color = "#000000";
      ansCorrectTag.style.textShadow = "none";
      ansCorrectTag.innerText = "Correct:";
    }
    if (ansCorrectVal) {
      ansCorrectVal.style.color = "#000000";
      ansCorrectVal.style.textShadow = "none";
      ansCorrectVal.style.fontSize = "12px";
    }
    if (ansAutoBadge) {
      ansAutoBadge.style.color = "#059669";
      ansAutoBadge.style.textShadow = "none";
      ansAutoBadge.innerText = "(✓)";
    }
    if (ansCopyBtn) {
      ansCopyBtn.style.background = "transparent";
      ansCopyBtn.style.color = "#000000";
      ansCopyBtn.style.border = "none";
    }
  } else {
    let effectiveBg = aInp.overlayBg;
    let effectiveText = aInp.overlayTextPrimary;
    let effectiveBorder = aInp.overlayBorder;
    let effectiveCardBg = aInp.cardBg;
    let effectiveCardBorder = aInp.cardBorder;
    let effectiveCardLabel = aInp.cardLabel;
    let effectiveCardValue = aInp.cardValue;
    let effectiveButtonBg = aInp.buttonBg;
    let effectiveButtonText = aInp.buttonText;
    let effectiveButtonBorder = aInp.buttonBorder;

    if (answerCustomColorEnabled) {
      effectiveBg = answerCustomBgColor;
      effectiveText = answerCustomTextColor;
      effectiveBorder = answerCustomBorderColor;
      effectiveCardBg = colorWithAlpha(answerCustomTextColor, 0.06);
      effectiveCardBorder = answerCustomBorderColor;
      effectiveCardLabel = answerCustomBorderColor;
      effectiveCardValue = answerCustomTextColor;
      effectiveButtonBg = colorWithAlpha(answerCustomTextColor, 0.1);
      effectiveButtonText = answerCustomTextColor;
      effectiveButtonBorder = answerCustomBorderColor;
    }

    if (ansContainer) {
      ansContainer.classList.remove("stealth-sim");
      ansContainer.style.width = `${answerWidth}px`;
      ansContainer.style.borderRadius = `${answerBorderRadius}px`;
      ansContainer.style.background = (answerOpacity < 100) ? colorWithAlpha(effectiveBg, answerOpacity / 100) : effectiveBg;
      ansContainer.style.backdropFilter = (answerBlur > 0) ? `blur(${answerBlur}px)` : "none";
      ansContainer.style.webkitBackdropFilter = (answerBlur > 0) ? `blur(${answerBlur}px)` : "none";
      ansContainer.style.boxShadow = aInp.overlayShadow;
      ansContainer.style.color = effectiveText;
      if (answerBorderThickness <= 0 || answerBorderStyle === "none") {
        ansContainer.style.border = "none";
      } else {
        ansContainer.style.border = `${answerBorderThickness}px ${answerBorderStyle} ${effectiveBorder}`;
      }
    }

    if (ansDragHead) {
      ansDragHead.style.display = answerDragBar ? "flex" : "none";
      ansDragHead.style.borderBottomColor = effectiveCardBorder;
    }
    if (ansDragTitle) {
      ansDragTitle.style.color = effectiveText;
      ansDragTitle.innerText = "🎯 Risposta • Floating Solution";
    }

    if (ansWhyBox) {
      ansWhyBox.style.background = effectiveCardBg;
      ansWhyBox.style.borderLeft = `2.5px solid ${effectiveCardBorder}`;
      ansWhyBox.style.padding = "8px 12px";
    }
    if (ansWhyTag) {
      ansWhyTag.style.color = effectiveCardLabel;
      ansWhyTag.innerText = "MOTIVAZIONE • WHY";
    }
    if (ansWhyContent) {
      ansWhyContent.style.color = effectiveCardValue;
      ansWhyContent.style.fontSize = `${answerFontSize}px`;
    }

    if (ansCorrectBox) {
      ansCorrectBox.style.background = effectiveCardBg;
      ansCorrectBox.style.borderLeft = `2.5px solid ${effectiveCardBorder}`;
      ansCorrectBox.style.padding = "8px 12px";
    }
    if (ansCorrectTag) {
      ansCorrectTag.style.color = effectiveCardLabel;
      ansCorrectTag.innerText = "OPZIONE CORRETTA • CORRECT OPTION";
    }
    if (ansCorrectVal) {
      ansCorrectVal.style.color = effectiveCardValue;
      ansCorrectVal.style.fontSize = `${answerFontSize}px`;
    }
    if (ansAutoBadge) {
      ansAutoBadge.style.color = aInp.badgeSuccess;
      ansAutoBadge.innerText = "(⚡ Selected on Page)";
    }

    if (ansCopyBtn) {
      ansCopyBtn.style.background = effectiveButtonBg;
      ansCopyBtn.style.color = effectiveButtonText;
      ansCopyBtn.style.borderColor = effectiveButtonBorder;
    }
  }
}

let persistTimer = null;
function persistThemeSettings(immediate = false) {
  if (immediate) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    doPersistThemeSettings();
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    doPersistThemeSettings();
  }, 100);
}

function doPersistThemeSettings() {
  chrome.storage.local.set({
    snipThemeMode,
    snipCustomTheme,
    answerThemeMode,
    answerCustomTheme,
    splitAnswerTheme: (answerThemeMode === "customized"),
    tabThemeMode,
    tabCustomTheme,
    snipDimming,
    snipBorderThickness,
    snipFillOpacity,
    snipBorderStyle,
    snipBorderGlow,
    snipShowHint,
    answerStealthMode,
    answerBorderThickness,
    answerBorderRadius,
    answerWidth,
    answerOpacity,
    answerBlur,
    answerFontSize,
    answerBorderStyle,
    answerDragBar,
    answerAutoCopy,
    answerCustomColorEnabled,
    answerCustomBgColor,
    answerCustomTextColor,
    answerCustomBorderColor,
    // Keep backward-compatible keys
    themeMode: snipThemeMode,
    customTheme: snipCustomTheme
  });
}

// Snipping Tool Toggle Handler
const snipToggle = document.getElementById("snipThemeToggle");
if (snipToggle) {
  snipToggle.addEventListener("change", () => {
    snipThemeMode = snipToggle.checked ? "customized" : "default";
    if (answerThemeMode !== "customized") {
      answerCustomTheme = snipCustomTheme;
    }
    updateThemeUI();
    persistThemeSettings(true);
  });
}

// Answer Pop-up Toggle Handler
const answerToggle = document.getElementById("answerThemeToggle");
if (answerToggle) {
  answerToggle.addEventListener("change", () => {
    answerThemeMode = answerToggle.checked ? "customized" : "default";
    splitAnswerTheme = (answerThemeMode === "customized");
    updateThemeUI();
    persistThemeSettings(true);
  });
}

// Settings Tab & Extension Popup Toggle Handler
const tabToggle = document.getElementById("tabThemeToggle");
if (tabToggle) {
  tabToggle.addEventListener("change", () => {
    tabThemeMode = tabToggle.checked ? "customized" : "default";
    updateThemeUI();
    persistThemeSettings();
  });
}

// Snipping Optics Controls Event Listeners
const dimSlider = document.getElementById("snipDimmingSlider");
const dimVal = document.getElementById("snipDimmingVal");
if (dimSlider) {
  dimSlider.addEventListener("input", (e) => {
    snipDimming = Number(e.target.value);
    if (dimVal) dimVal.innerText = `${snipDimming}%`;
    updateThemeUI();
    persistThemeSettings();
  });
}

// Snipping Border Thickness Slider (Supports absolute zero 0px)
const thickSlider = document.getElementById("snipBorderThicknessSlider");
const thickVal = document.getElementById("snipBorderThicknessVal");
if (thickSlider) {
  thickSlider.addEventListener("input", (e) => {
    snipBorderThickness = Number(e.target.value);
    if (thickVal) thickVal.innerText = (snipBorderThickness === 0) ? "0px (None)" : `${snipBorderThickness}px`;
    updateThemeUI();
    persistThemeSettings();
  });
}

const fillSlider = document.getElementById("snipFillOpacitySlider");
const fillVal = document.getElementById("snipFillOpacityVal");
if (fillSlider) {
  fillSlider.addEventListener("input", (e) => {
    snipFillOpacity = Number(e.target.value);
    if (fillVal) fillVal.innerText = `${snipFillOpacity}%`;
    updateThemeUI();
    persistThemeSettings();
  });
}

const borderStyleSelect = document.getElementById("snipBorderStyleSelect");
if (borderStyleSelect) {
  borderStyleSelect.addEventListener("change", (e) => {
    snipBorderStyle = e.target.value;
    updateThemeUI();
    persistThemeSettings();
  });
}

const borderGlowToggle = document.getElementById("snipBorderGlowToggle");
if (borderGlowToggle) {
  borderGlowToggle.addEventListener("change", (e) => {
    snipBorderGlow = e.target.checked;
    updateThemeUI();
    persistThemeSettings();
  });
}

const showHintToggle = document.getElementById("snipShowHintToggle");
if (showHintToggle) {
  showHintToggle.addEventListener("change", (e) => {
    snipShowHint = e.target.checked;
    updateThemeUI();
    persistThemeSettings();
  });
}

// Answer Pop-up Optics & Geometry Listeners
const ansThickSlider = document.getElementById("answerBorderThicknessSlider");
const ansThickVal = document.getElementById("answerBorderThicknessVal");
if (ansThickSlider) {
  ansThickSlider.addEventListener("input", (e) => {
    answerBorderThickness = Number(e.target.value);
    if (ansThickVal) ansThickVal.innerText = (answerBorderThickness === 0) ? "0px (None)" : `${answerBorderThickness}px`;
    updateThemeUI();
    persistThemeSettings();
  });
}

const ansRadiusSlider = document.getElementById("answerBorderRadiusSlider");
const ansRadiusVal = document.getElementById("answerBorderRadiusVal");
if (ansRadiusSlider) {
  ansRadiusSlider.addEventListener("input", (e) => {
    answerBorderRadius = Number(e.target.value);
    if (ansRadiusVal) ansRadiusVal.innerText = `${answerBorderRadius}px`;
    updateThemeUI();
    persistThemeSettings();
  });
}

const ansWidthSlider = document.getElementById("answerWidthSlider");
const ansWidthVal = document.getElementById("answerWidthVal");
if (ansWidthSlider) {
  ansWidthSlider.addEventListener("input", (e) => {
    answerWidth = Number(e.target.value);
    if (ansWidthVal) ansWidthVal.innerText = `${answerWidth}px`;
    updateThemeUI();
    persistThemeSettings();
  });
}

const ansOpacitySlider = document.getElementById("answerOpacitySlider");
const ansOpacityVal = document.getElementById("answerOpacityVal");
if (ansOpacitySlider) {
  ansOpacitySlider.addEventListener("input", (e) => {
    answerOpacity = Number(e.target.value);
    if (ansOpacityVal) ansOpacityVal.innerText = `${answerOpacity}%`;
    updateThemeUI();
    persistThemeSettings();
  });
}

const ansFontSlider = document.getElementById("answerFontSizeSlider");
const ansFontVal = document.getElementById("answerFontSizeVal");
if (ansFontSlider) {
  ansFontSlider.addEventListener("input", (e) => {
    answerFontSize = Number(e.target.value);
    if (ansFontVal) ansFontVal.innerText = `${answerFontSize}px`;
    updateThemeUI();
    persistThemeSettings();
  });
}

const ansBorderStyleSelect = document.getElementById("answerBorderStyleSelect");
if (ansBorderStyleSelect) {
  ansBorderStyleSelect.addEventListener("change", (e) => {
    answerBorderStyle = e.target.value;
    updateThemeUI();
    persistThemeSettings();
  });
}

const ansDragBarToggle = document.getElementById("answerDragBarToggle");
if (ansDragBarToggle) {
  ansDragBarToggle.addEventListener("change", (e) => {
    answerDragBar = e.target.checked;
    updateThemeUI();
    persistThemeSettings();
  });
}

const ansAutoCopyToggle = document.getElementById("answerAutoCopyToggle");
if (ansAutoCopyToggle) {
  ansAutoCopyToggle.addEventListener("change", (e) => {
    answerAutoCopy = e.target.checked;
    updateThemeUI();
    persistThemeSettings();
  });
}

// Stealth Mode Toggle
const ansStealthToggle = document.getElementById("answerStealthToggle");
if (ansStealthToggle) {
  ansStealthToggle.addEventListener("change", (e) => {
    answerStealthMode = e.target.checked;
    updateThemeUI();
    persistThemeSettings();
  });
}

// Custom Colors Toggle
const ansCustColorToggle = document.getElementById("answerCustomColorToggle");
if (ansCustColorToggle) {
  ansCustColorToggle.addEventListener("change", (e) => {
    answerCustomColorEnabled = e.target.checked;
    updateThemeUI();
    persistThemeSettings();
  });
}

// Color Sync Helper
function setupColorSync(pickerId, textId, onChange) {
  const picker = document.getElementById(pickerId);
  const text = document.getElementById(textId);
  if (picker && text) {
    picker.addEventListener("input", (e) => {
      text.value = e.target.value;
      onChange(e.target.value);
    });
    text.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(val)) {
        picker.value = val;
        onChange(val);
      }
    });
  }
}

setupColorSync("answerCustomBgColorPicker", "answerCustomBgColorText", (val) => {
  answerCustomBgColor = val;
  updateThemeUI();
  persistThemeSettings();
});

setupColorSync("answerCustomTextColorPicker", "answerCustomTextColorText", (val) => {
  answerCustomTextColor = val;
  updateThemeUI();
  persistThemeSettings();
});

setupColorSync("answerCustomBorderColorPicker", "answerCustomBorderColorText", (val) => {
  answerCustomBorderColor = val;
  updateThemeUI();
  persistThemeSettings();
});

// Blur Slider Listener
const ansBlurSlider = document.getElementById("answerBlurSlider");
const ansBlurVal = document.getElementById("answerBlurVal");
if (ansBlurSlider) {
  ansBlurSlider.addEventListener("input", (e) => {
    answerBlur = Number(e.target.value);
    if (ansBlurVal) ansBlurVal.innerText = (answerBlur === 0) ? "0px (Off)" : `${answerBlur}px`;
    updateThemeUI();
    persistThemeSettings();
  });
}

// Load saved settings from chrome.storage.local
function loadSettings() {
  chrome.storage.local.get([
    "keys", "models", "style", "subject", "autoSelect", "snipCursor", "customCursorUrl",
    "snipThemeMode", "snipCustomTheme", "answerThemeMode", "answerCustomTheme", "splitAnswerTheme",
    "tabThemeMode", "tabCustomTheme", "themeMode", "customTheme", "themeScope",
    "snipDimming", "snipBorderThickness", "snipFillOpacity", "snipBorderStyle", "snipBorderGlow", "snipShowHint",
    "answerStealthMode", "answerBorderThickness", "answerBorderRadius", "answerWidth", "answerOpacity", "answerBlur", "answerFontSize", "answerBorderStyle", "answerDragBar", "answerAutoCopy",
    "answerCustomColorEnabled", "answerCustomBgColor", "answerCustomTextColor", "answerCustomBorderColor"
  ], (data) => {
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

    // Theme loading with seamless backward compatibility
    snipThemeMode = data.snipThemeMode || data.themeMode || "default";
    snipCustomTheme = data.snipCustomTheme || data.customTheme || "catppuccin-mocha";
    answerThemeMode = data.answerThemeMode || (data.splitAnswerTheme ? "customized" : (data.themeMode === "customized" ? "customized" : "default"));
    answerCustomTheme = data.answerCustomTheme || data.customTheme || "catppuccin-mocha";
    splitAnswerTheme = (answerThemeMode === "customized");

    tabThemeMode = data.tabThemeMode || (data.themeScope === "inpage-only" ? "default" : data.themeMode) || "default";
    tabCustomTheme = data.tabCustomTheme || data.customTheme || "catppuccin-mocha";

    // Snipping Optics & Geometry loading
    snipDimming = (data.snipDimming !== undefined) ? Number(data.snipDimming) : 15;
    snipBorderThickness = (data.snipBorderThickness !== undefined) ? Number(data.snipBorderThickness) : 2;
    snipFillOpacity = (data.snipFillOpacity !== undefined) ? Number(data.snipFillOpacity) : 12;
    snipBorderStyle = data.snipBorderStyle || "dashed";
    snipBorderGlow = (data.snipBorderGlow !== undefined) ? !!data.snipBorderGlow : true;
    snipShowHint = (data.snipShowHint !== undefined) ? !!data.snipShowHint : true;

    const dimSliderEl = document.getElementById("snipDimmingSlider");
    const dimValEl = document.getElementById("snipDimmingVal");
    if (dimSliderEl) dimSliderEl.value = snipDimming;
    if (dimValEl) dimValEl.innerText = `${snipDimming}%`;

    const thickSliderEl = document.getElementById("snipBorderThicknessSlider");
    const thickValEl = document.getElementById("snipBorderThicknessVal");
    if (thickSliderEl) thickSliderEl.value = snipBorderThickness;
    if (thickValEl) thickValEl.innerText = (snipBorderThickness === 0) ? "0px (None)" : `${snipBorderThickness}px`;

    const fillSliderEl = document.getElementById("snipFillOpacitySlider");
    const fillValEl = document.getElementById("snipFillOpacityVal");
    if (fillSliderEl) fillSliderEl.value = snipFillOpacity;
    if (fillValEl) fillValEl.innerText = `${snipFillOpacity}%`;

    const borderStyleSelectEl = document.getElementById("snipBorderStyleSelect");
    if (borderStyleSelectEl) borderStyleSelectEl.value = snipBorderStyle;

    const borderGlowToggleEl = document.getElementById("snipBorderGlowToggle");
    if (borderGlowToggleEl) borderGlowToggleEl.checked = snipBorderGlow;

    const showHintToggleEl = document.getElementById("snipShowHintToggle");
    if (showHintToggleEl) showHintToggleEl.checked = snipShowHint;

    // Answer Pop-up Optics & Geometry loading
    answerStealthMode = (data.answerStealthMode !== undefined) ? !!data.answerStealthMode : false;
    answerBorderThickness = (data.answerBorderThickness !== undefined) ? Number(data.answerBorderThickness) : 1;
    answerBorderRadius = (data.answerBorderRadius !== undefined) ? Number(data.answerBorderRadius) : 14;
    answerWidth = (data.answerWidth !== undefined) ? Number(data.answerWidth) : 350;
    answerOpacity = (data.answerOpacity !== undefined) ? Number(data.answerOpacity) : 98;
    answerBlur = (data.answerBlur !== undefined) ? Number(data.answerBlur) : 14;
    answerFontSize = (data.answerFontSize !== undefined) ? Number(data.answerFontSize) : 13;
    answerBorderStyle = data.answerBorderStyle || "solid";
    answerDragBar = (data.answerDragBar !== undefined) ? !!data.answerDragBar : true;
    answerAutoCopy = (data.answerAutoCopy !== undefined) ? !!data.answerAutoCopy : false;

    answerCustomColorEnabled = (data.answerCustomColorEnabled !== undefined) ? !!data.answerCustomColorEnabled : false;
    answerCustomBgColor = data.answerCustomBgColor || "#181825";
    answerCustomTextColor = data.answerCustomTextColor || "#cdd6f4";
    answerCustomBorderColor = data.answerCustomBorderColor || "#89b4fa";

    const ansThickSliderEl = document.getElementById("answerBorderThicknessSlider");
    const ansThickValEl = document.getElementById("answerBorderThicknessVal");
    if (ansThickSliderEl) ansThickSliderEl.value = answerBorderThickness;
    if (ansThickValEl) ansThickValEl.innerText = (answerBorderThickness === 0) ? "0px (None)" : `${answerBorderThickness}px`;

    const ansRadiusSliderEl = document.getElementById("answerBorderRadiusSlider");
    const ansRadiusValEl = document.getElementById("answerBorderRadiusVal");
    if (ansRadiusSliderEl) ansRadiusSliderEl.value = answerBorderRadius;
    if (ansRadiusValEl) ansRadiusValEl.innerText = `${answerBorderRadius}px`;

    const ansWidthSliderEl = document.getElementById("answerWidthSlider");
    const ansWidthValEl = document.getElementById("answerWidthVal");
    if (ansWidthSliderEl) ansWidthSliderEl.value = answerWidth;
    if (ansWidthValEl) ansWidthValEl.innerText = `${answerWidth}px`;

    const ansOpacitySliderEl = document.getElementById("answerOpacitySlider");
    const ansOpacityValEl = document.getElementById("answerOpacityVal");
    if (ansOpacitySliderEl) ansOpacitySliderEl.value = answerOpacity;
    if (ansOpacityValEl) ansOpacityValEl.innerText = `${answerOpacity}%`;

    const ansBlurSliderEl = document.getElementById("answerBlurSlider");
    const ansBlurValEl = document.getElementById("answerBlurVal");
    if (ansBlurSliderEl) ansBlurSliderEl.value = answerBlur;
    if (ansBlurValEl) ansBlurValEl.innerText = (answerBlur === 0) ? "0px (Off)" : `${answerBlur}px`;

    const ansFontSliderEl = document.getElementById("answerFontSizeSlider");
    const ansFontValEl = document.getElementById("answerFontSizeVal");
    if (ansFontSliderEl) ansFontSliderEl.value = answerFontSize;
    if (ansFontValEl) ansFontValEl.innerText = `${answerFontSize}px`;

    const ansBorderStyleSelectEl = document.getElementById("answerBorderStyleSelect");
    if (ansBorderStyleSelectEl) ansBorderStyleSelectEl.value = answerBorderStyle;

    const ansDragBarToggleEl = document.getElementById("answerDragBarToggle");
    if (ansDragBarToggleEl) ansDragBarToggleEl.checked = answerDragBar;

    const ansAutoCopyToggleEl = document.getElementById("answerAutoCopyToggle");
    if (ansAutoCopyToggleEl) ansAutoCopyToggleEl.checked = answerAutoCopy;

    renderAllThemeGrids();
    updateThemeUI();

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
      customCursorUrl,
      snipThemeMode,
      snipCustomTheme,
      answerThemeMode,
      answerCustomTheme,
      splitAnswerTheme: (answerThemeMode === "customized"),
      tabThemeMode,
      tabCustomTheme,
      snipDimming,
      snipBorderThickness,
      snipFillOpacity,
      snipBorderStyle,
      snipBorderGlow,
      snipShowHint,
      answerStealthMode,
      answerBorderThickness,
      answerBorderRadius,
      answerWidth,
      answerOpacity,
      answerBlur,
      answerFontSize,
      answerBorderStyle,
      answerDragBar,
      answerAutoCopy,
      answerCustomColorEnabled,
      answerCustomBgColor,
      answerCustomTextColor,
      answerCustomBorderColor,
      themeMode: snipThemeMode,
      customTheme: snipCustomTheme
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
  if (confirm("Reset all settings and restore defaults?")) {
    chrome.storage.local.get(["keys", "models"], (data) => {
      const keys = data.keys || {};
      const models = data.models || {};
      keys.Groq = DEFAULT_GROQ_KEYS;
      delete models.Groq;

      snipThemeMode = "default";
      snipCustomTheme = "catppuccin-mocha";
      answerThemeMode = "default";
      answerCustomTheme = "catppuccin-mocha";
      splitAnswerTheme = false;
      tabThemeMode = "default";
      tabCustomTheme = "catppuccin-mocha";

      snipDimming = 15;
      snipBorderThickness = 2;
      snipFillOpacity = 12;
      snipBorderStyle = "dashed";
      snipBorderGlow = true;
      snipShowHint = true;

      answerStealthMode = false;
      answerBorderThickness = 1;
      answerBorderRadius = 14;
      answerWidth = 350;
      answerOpacity = 98;
      answerBlur = 14;
      answerFontSize = 13;
      answerBorderStyle = "solid";
      answerDragBar = true;
      answerAutoCopy = false;

      answerCustomColorEnabled = false;
      answerCustomBgColor = "#181825";
      answerCustomTextColor = "#cdd6f4";
      answerCustomBorderColor = "#89b4fa";

      chrome.storage.local.set({
        api: "Groq",
        keys,
        models,
        subject: "auto",
        style: "detailed",
        autoSelect: false,
        snipCursor: "crosshair",
        customCursorUrl: "",
        snipThemeMode: "default",
        snipCustomTheme: "catppuccin-mocha",
        answerThemeMode: "default",
        answerCustomTheme: "catppuccin-mocha",
        splitAnswerTheme: false,
        tabThemeMode: "default",
        tabCustomTheme: "catppuccin-mocha",
        snipDimming: 15,
        snipBorderThickness: 2,
        snipFillOpacity: 12,
        snipBorderStyle: "dashed",
        snipBorderGlow: true,
        snipShowHint: true,
        answerStealthMode: false,
        answerBorderThickness: 1,
        answerBorderRadius: 14,
        answerWidth: 350,
        answerOpacity: 98,
        answerBlur: 14,
        answerFontSize: 13,
        answerBorderStyle: "solid",
        answerDragBar: true,
        answerAutoCopy: false,
        answerCustomColorEnabled: false,
        answerCustomBgColor: "#181825",
        answerCustomTextColor: "#cdd6f4",
        answerCustomBorderColor: "#89b4fa",
        themeMode: "default",
        customTheme: "catppuccin-mocha"
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
  chrome.storage.local.get([
    "keys", "models", "api", "subject", "style", "autoSelect", "snipCursor", "customCursorUrl",
    "snipThemeMode", "snipCustomTheme", "answerThemeMode", "answerCustomTheme", "splitAnswerTheme",
    "tabThemeMode", "tabCustomTheme", "themeMode", "customTheme",
    "snipDimming", "snipBorderThickness", "snipFillOpacity", "snipBorderStyle", "snipBorderGlow", "snipShowHint",
    "answerStealthMode", "answerBorderThickness", "answerBorderRadius", "answerWidth", "answerOpacity", "answerBlur", "answerFontSize", "answerBorderStyle", "answerDragBar", "answerAutoCopy",
    "answerCustomColorEnabled", "answerCustomBgColor", "answerCustomTextColor", "answerCustomBorderColor"
  ], (data) => {
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

// ── Tab Navigation Controller ────────────────
function initTabNavigation() {
  const tabs = document.querySelectorAll(".nav-tab-btn");
  const panes = document.querySelectorAll(".tab-pane");

  function switchTab(tabId, updateHash = true) {
    if (!tabId) return;
    const targetPane = document.getElementById(tabId);
    const targetTab = document.querySelector(`.nav-tab-btn[data-tab="${tabId}"]`);
    if (!targetPane || !targetTab) return;

    tabs.forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    panes.forEach(p => p.classList.remove("active"));

    targetTab.classList.add("active");
    targetTab.setAttribute("aria-selected", "true");
    targetPane.classList.add("active");

    if (updateHash) {
      try {
        sessionStorage.setItem("hs_active_tab", tabId);
        history.replaceState(null, "", `#${tabId.replace("tab-", "")}`);
      } catch (e) {}
    }

    if (tabId === "tab-snipping" || tabId === "tab-answer" || tabId === "tab-interface") {
      updateThemeUI();
      updateCursorPreview();
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabId = tab.dataset.tab;
      switchTab(tabId);
    });
  });

  // Restore active tab from URL hash or sessionStorage
  const hash = window.location.hash ? window.location.hash.replace("#", "") : "";
  const savedTab = sessionStorage.getItem("hs_active_tab");
  let initialTab = "tab-api";

  if (hash) {
    const candidate = hash.startsWith("tab-") ? hash : `tab-${hash}`;
    if (document.getElementById(candidate)) initialTab = candidate;
  } else if (savedTab && document.getElementById(savedTab)) {
    initialTab = savedTab;
  }

  switchTab(initialTab, false);
}

initTabNavigation();

// ── Model Quick Chip Helpers ────────────────
document.querySelectorAll(".chip-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById("modelInput");
    if (input && btn.dataset.model) {
      input.value = btn.dataset.model;
      input.focus();
    }
  });
});
