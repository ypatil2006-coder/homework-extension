const assert = require("assert");

console.log("Running TDD tests for Stealth Mode Quick Settings UI & Selection States...");

// Test helper: simulate style pill styling computation
function getPillStyles(styleKey, selectedStyle, isStealth, inp) {
  const isActive = (styleKey === selectedStyle);
  if (isStealth) {
    return {
      background: isActive ? "#111111" : "rgba(0, 0, 0, 0.03)",
      color: isActive ? "#ffffff" : "#555555",
      borderColor: isActive ? "#111111" : "rgba(0, 0, 0, 0.22)",
      fontWeight: isActive ? "700" : "500",
      boxShadow: isActive ? "0 1px 3px rgba(0, 0, 0, 0.2)" : "none"
    };
  } else {
    return {
      background: isActive ? inp.buttonBg : "transparent",
      color: isActive ? inp.buttonText : inp.overlayTextMuted,
      borderColor: isActive ? inp.cardBorder : "rgba(184, 158, 134, 0.45)",
      fontWeight: isActive ? "700" : "500",
      boxShadow: isActive ? "0 1px 3px rgba(0, 0, 0, 0.08)" : "none"
    };
  }
}

// Mock effective inp in stealth mode
const stealthInp = {
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
  buttonText: "#000000"
};

// Mock effective inp in normal theme mode (Atelier Sand)
const normalInp = {
  overlayBg: "rgba(246, 241, 235, 0.90)",
  overlayBorder: "rgba(184, 158, 134, 0.45)",
  cardBg: "rgba(255, 255, 255, 0.5)",
  cardBorder: "#b85d19",
  cardLabel: "#87431b",
  cardValue: "#3b2210",
  buttonBg: "rgba(255, 255, 255, 0.75)",
  buttonBorder: "rgba(184, 158, 134, 0.55)",
  buttonText: "#87431b",
  overlayTextMuted: "#786959"
};

// 1. In Stealth Mode: Active pill MUST have high-contrast background and white text
const activeStealth = getPillStyles("detailed", "detailed", true, stealthInp);
const inactiveStealth = getPillStyles("mcq", "detailed", true, stealthInp);

assert.strictEqual(activeStealth.background, "#111111", "Failed: Active pill in stealth mode must have solid dark background");
assert.strictEqual(activeStealth.color, "#ffffff", "Failed: Active pill in stealth mode must have crisp white text");
assert.strictEqual(activeStealth.fontWeight, "700", "Failed: Active pill in stealth mode must be bold");
assert.notStrictEqual(activeStealth.background, inactiveStealth.background, "Failed: Active and inactive pills must have different backgrounds");
assert.notStrictEqual(activeStealth.color, inactiveStealth.color, "Failed: Active and inactive pills must have different text colors");
assert.notStrictEqual(activeStealth.borderColor, "transparent", "Failed: Active pill border must not be transparent in stealth mode");

// 2. In Normal Mode: Active pill uses theme values
const activeNormal = getPillStyles("detailed", "detailed", false, normalInp);
const inactiveNormal = getPillStyles("mcq", "detailed", false, normalInp);

assert.strictEqual(activeNormal.background, normalInp.buttonBg, "Failed: Active pill in normal mode should use theme buttonBg");
assert.strictEqual(activeNormal.color, normalInp.buttonText, "Failed: Active pill in normal mode should use theme buttonText");
assert.strictEqual(inactiveNormal.color, normalInp.overlayTextMuted, "Failed: Inactive pill in normal mode should use theme overlayTextMuted");

// 3. Dropdown Select styles in Stealth Mode
function getSelectStyles(isStealth, inp) {
  if (isStealth) {
    return {
      border: "1px solid rgba(0, 0, 0, 0.28)",
      background: "rgba(0, 0, 0, 0.04)",
      color: "#111111",
      fontWeight: "600"
    };
  } else {
    return {
      border: `1px solid ${inp.cardBorder}`,
      background: inp.cardBg,
      color: inp.cardValue,
      fontWeight: "normal"
    };
  }
}

const selectStealth = getSelectStyles(true, stealthInp);
assert(!selectStealth.border.includes("transparent"), "Failed: Stealth select border must not be transparent");
assert(selectStealth.border.includes("rgba(0, 0, 0,"), "Failed: Stealth select must have visible border");
assert.strictEqual(selectStealth.color, "#111111", "Failed: Stealth select text must be dark and readable");

// 4. Action Button styles in Stealth Mode
function getActionButtonStyles(type, isStealth, inp) {
  if (isStealth) {
    if (type === "resolve") {
      return { border: "1px solid #111111", background: "#111111", color: "#ffffff", fontWeight: "700" };
    } else if (type === "save") {
      return { border: "1px solid #111111", background: "rgba(0, 0, 0, 0.06)", color: "#111111", fontWeight: "700" };
    } else {
      return { border: "1px solid rgba(0, 0, 0, 0.25)", background: "transparent", color: "#333333", fontWeight: "600" };
    }
  } else {
    return { border: `1px solid ${inp.buttonBorder}`, background: inp.buttonBg, color: inp.buttonText, fontWeight: "600" };
  }
}

const resolveBtnStealth = getActionButtonStyles("resolve", true, stealthInp);
const saveBtnStealth = getActionButtonStyles("save", true, stealthInp);
const backBtnStealth = getActionButtonStyles("back", true, stealthInp);

assert.strictEqual(resolveBtnStealth.background, "#111111", "Failed: Resolve button in stealth mode must be primary solid dark");
assert.strictEqual(resolveBtnStealth.color, "#ffffff", "Failed: Resolve button in stealth mode must have white text");
assert.notStrictEqual(saveBtnStealth.background, resolveBtnStealth.background, "Failed: Save button must be visually distinct from Resolve button");
assert(!saveBtnStealth.border.includes("transparent"), "Failed: Save button must have visible border in stealth mode");
assert(!backBtnStealth.border.includes("transparent"), "Failed: Back button must have visible border in stealth mode");

console.log("✅ All Stealth Mode Quick Settings UI tests passed!");
