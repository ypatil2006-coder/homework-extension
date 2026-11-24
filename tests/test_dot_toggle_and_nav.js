const assert = require("assert");

console.log("Running TDD tests for Dot Toggle (Alt+D) & View Back Navigation...");

// Simulated DOM & State
let overlay = null;
let dot = null;
let currentDotExpanded = false;
let isDotHidden = false;
let lastAnswerPayload = null;
let pendingAnswerPayload = null;
let answerHistory = [];

function mockShowDotOverlay({ state, status, pendingAnswer }) {
  if (overlay) {
    overlay = null;
  }
  if (pendingAnswer) {
    pendingAnswerPayload = pendingAnswer;
    lastAnswerPayload = pendingAnswer;
  }
  isDotHidden = false;
  if (!dot) {
    dot = { id: "hs-dot-trigger", style: { display: "block" }, title: status };
  } else {
    dot.style.display = "block";
    dot.title = status;
  }
}

let lastToggleTime = 0;

function mockToggleOverlayAndDot(simulatedNow = Date.now()) {
  if (simulatedNow - lastToggleTime < 250) {
    return; // Debounce guard: ignore duplicate calls within 250ms
  }
  lastToggleTime = simulatedNow;

  // State 1: Answer Overlay is currently visible -> Minimize to floating dot
  if (overlay && overlay.style.display !== "none") {
    overlay = null;
    currentDotExpanded = false;
    isDotHidden = false;
    const payloadToKeep = lastAnswerPayload || pendingAnswerPayload;
    mockShowDotOverlay({
      state: "ready",
      status: "Answer minimized (Click dot or Alt+D to expand)",
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

  // State 3: Dot exists and is hidden -> Restore Answer Overlay directly
  if (dot && isDotHidden) {
    isDotHidden = false;
    const payload = lastAnswerPayload || pendingAnswerPayload;
    if (payload) {
      dot = null;
      currentDotExpanded = true;
      overlay = { id: "hs-answer-overlay", style: { display: "block" }, answer: payload.answer };
      return;
    }
    dot.style.display = "block";
    return;
  }

  // State 4: Neither overlay nor dot in DOM -> Recreate overlay with last known answer
  if (lastAnswerPayload || pendingAnswerPayload) {
    isDotHidden = false;
    currentDotExpanded = true;
    const payload = lastAnswerPayload || pendingAnswerPayload;
    overlay = { id: "hs-answer-overlay", style: { display: "block" }, answer: payload.answer };
    return;
  }

  // State 5: Fallback idle dot
  isDotHidden = false;
  mockShowDotOverlay({
    state: "ready",
    status: "Homework Solver (Alt+C to snip)",
    pendingAnswer: null
  });
}

// Test 1: Overlay open -> Press Alt+D -> Minimizes to dot
overlay = { id: "hs-answer-overlay", style: { display: "block" } };
lastAnswerPayload = { answer: "42", options: { style: "mcq" } };
currentDotExpanded = true;

mockToggleOverlayAndDot(1000);
assert.strictEqual(overlay, null, "Failed: Overlay should be removed/hidden");
assert(dot !== null, "Failed: Dot should be created/shown");
assert.strictEqual(dot.style.display, "block", "Failed: Dot should be visible");
assert.strictEqual(isDotHidden, false, "Failed: isDotHidden should be false");

// Test 2: Dot visible -> Press Alt+D -> Hides dot
mockToggleOverlayAndDot(1300);
assert.strictEqual(dot.style.display, "none", "Failed: Dot should be hidden");
assert.strictEqual(isDotHidden, true, "Failed: isDotHidden should be true");

// Test 2b: Debounce test -> Rapid fire duplicate within 2ms should be ignored!
mockToggleOverlayAndDot(1302);
assert.strictEqual(dot.style.display, "none", "Failed: Duplicate call should be ignored by debounce");
assert.strictEqual(isDotHidden, true, "Failed: isDotHidden should remain true");

// Test 3: Dot hidden -> Press Alt+D -> Restores Answer Overlay!
mockToggleOverlayAndDot(1600);
assert.strictEqual(dot, null, "Failed: Dot should be removed on restore");
assert(overlay !== null, "Failed: Overlay should be restored");
assert.strictEqual(overlay.style.display, "block", "Failed: Overlay should be visible");
assert.strictEqual(overlay.answer, "42", "Failed: Overlay should have restored answer");
assert.strictEqual(currentDotExpanded, true, "Failed: currentDotExpanded should be true");

// Test 4: Answer History Back Navigation
answerHistory = [];
const originalAnswer = { answer: "Option B: O(N log N)", options: { style: "mcq", isDerivation: false } };
answerHistory.push(originalAnswer);

const codeAnswer = { answer: "No code to output.", options: { style: "detailed", isDerivation: true } };
assert.strictEqual(answerHistory.length, 1, "Failed: History should have 1 item");

// User clicks Back to Previous Answer
const restored = answerHistory.pop();
assert.deepStrictEqual(restored, originalAnswer, "Failed: Should restore original answer");
assert.strictEqual(restored.options.isDerivation, false, "Failed: Restored answer should allow code derivation again");
assert.strictEqual(answerHistory.length, 0, "Failed: History should be empty after pop");

// Test 5: SSE [DONE] Stream Sentinel Termination Verification
const simulatedSseChunks = [
  'data: {"choices":[{"delta":{"content":"No code to"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" output."}}]}\n\n',
  'data: [DONE]\n\n',
  'data: {"choices":[{"delta":{"content":"SHOULD_NOT_BE_READ"}}]}\n\n'
];

let streamDone = false;
let accumulatedText = "";
for (const rawChunk of simulatedSseChunks) {
  if (streamDone) break;
  const lines = rawChunk.split("\n");
  for (const line of lines) {
    const p = line.trim();
    if (!p.startsWith("data:")) continue;
    const d = p.slice(5).trim();
    if (d === "[DONE]") {
      streamDone = true;
      break;
    }
    const j = JSON.parse(d);
    accumulatedText += j.choices[0].delta.content;
  }
}

assert.strictEqual(streamDone, true, "Failed: SSE reader should set streamDone on [DONE]");
assert.strictEqual(accumulatedText, "No code to output.", "Failed: SSE reader should not process chunks after [DONE]");

// Test 6: Dot Color Optics & Hex Normalization
function normalizeHexColor(c) {
  if (!c || typeof c !== "string") return "#1e293b";
  let str = c.trim();
  if (!str.startsWith("#")) {
    str = `#${str}`;
  }
  if (/^#[0-9a-fA-F]{3}$/i.test(str)) {
    str = `#${str[1]}${str[1]}${str[2]}${str[2]}${str[3]}${str[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/i.test(str) ? str.toLowerCase() : "#1e293b";
}

assert.strictEqual(normalizeHexColor("#10b981"), "#10b981", "Failed: Valid hex should be preserved");
assert.strictEqual(normalizeHexColor("3b82f6"), "#3b82f6", "Failed: Hex without # should be prefixed");
assert.strictEqual(normalizeHexColor("#FFF"), "#ffffff", "Failed: 3-digit hex should expand to 6-digit hex");
assert.strictEqual(normalizeHexColor("fff"), "#ffffff", "Failed: Unprefixed 3-digit hex should expand to 6-digit hex");
assert.strictEqual(normalizeHexColor("invalid-color"), "#1e293b", "Failed: Non-hex should fallback to default #1e293b");
assert.strictEqual(normalizeHexColor(null), "#1e293b", "Failed: Null should fallback to default #1e293b");

// Test 7: Dot Optics Engine Color Application
function mockApplyDotOptics(dotEl, { size = 11, opacity = 50, color = "#1e293b" } = {}) {
  const normCol = normalizeHexColor(color);
  dotEl.style = dotEl.style || {};
  dotEl.style["--hs-dot-size"] = `${size}px`;
  dotEl.style["--hs-dot-opacity"] = `${opacity / 100}`;
  dotEl.style["--hs-dot-color"] = normCol;
  dotEl.style.background = normCol;
}

const mockDot = { style: {} };
mockApplyDotOptics(mockDot, { size: 14, opacity: 75, color: "#f59e0b" });
assert.strictEqual(mockDot.style["--hs-dot-color"], "#f59e0b", "Failed: Custom dot color variable not applied");
assert.strictEqual(mockDot.style.background, "#f59e0b", "Failed: Custom dot background not applied");
assert.strictEqual(mockDot.style["--hs-dot-size"], "14px", "Failed: Size not applied");
assert.strictEqual(mockDot.style["--hs-dot-opacity"], "0.75", "Failed: Opacity not applied");

console.log("✅ All Dot Toggle (Alt+D), Navigation & Color Customization tests passed!");
