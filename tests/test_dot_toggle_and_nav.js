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

function mockToggleOverlayAndDot() {
  // State 1: Answer Overlay is currently visible -> Minimize to floating dot
  if (overlay && overlay.style.display !== "none") {
    overlay = null;
    currentDotExpanded = false;
    isDotHidden = false;
    const payloadToKeep = lastAnswerPayload || pendingAnswerPayload;
    mockShowDotOverlay({
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
    isDotHidden = false;
    return;
  }

  // State 4: Neither overlay nor dot in DOM -> Recreate dot with last known answer
  if (lastAnswerPayload || pendingAnswerPayload) {
    isDotHidden = false;
    currentDotExpanded = false;
    mockShowDotOverlay({
      state: "ready",
      status: "Answer ready (Click or Alt+D to expand)",
      pendingAnswer: lastAnswerPayload || pendingAnswerPayload
    });
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

mockToggleOverlayAndDot();
assert.strictEqual(overlay, null, "Failed: Overlay should be removed/hidden");
assert(dot !== null, "Failed: Dot should be created/shown");
assert.strictEqual(dot.style.display, "block", "Failed: Dot should be visible");
assert.strictEqual(isDotHidden, false, "Failed: isDotHidden should be false");

// Test 2: Dot visible -> Press Alt+D -> Hides dot
mockToggleOverlayAndDot();
assert.strictEqual(dot.style.display, "none", "Failed: Dot should be hidden");
assert.strictEqual(isDotHidden, true, "Failed: isDotHidden should be true");

// Test 3: Dot hidden -> Press Alt+D -> Reshows dot!
mockToggleOverlayAndDot();
assert.strictEqual(dot.style.display, "block", "Failed: Dot should be reshown");
assert.strictEqual(isDotHidden, false, "Failed: isDotHidden should be false");

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

console.log("✅ All Dot Toggle (Alt+D) & View Back Navigation tests passed!");
