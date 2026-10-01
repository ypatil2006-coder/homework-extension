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

if (typeof chrome !== "undefined" && chrome.storage?.local) {
  try {
    chrome.storage.local.get(["hsOverlayPos", "snipCursor", "customCursorUrl"], (res) => {
      if (res) {
        if (res.hsOverlayPos) savedOverlayPos = res.hsOverlayPos;
        if (res.snipCursor) currentSnipCursor = res.snipCursor;
        if (res.customCursorUrl) currentCustomCursorUrl = res.customCursorUrl;
      }
    });
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === "local") {
        if (changes.snipCursor) currentSnipCursor = changes.snipCursor.newValue;
        if (changes.customCursorUrl) currentCustomCursorUrl = changes.customCursorUrl.newValue;
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

  const overlay = document.createElement("div");
  overlay.id = "hs-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.08);
    z-index: 999999; cursor: ${getSnipCursorCss()} !important;
  `;

  const hint = document.createElement("div");
  hint.innerText = "Drag to snip • Right-click or Esc to cancel";
  hint.style.cssText = `
    position: fixed; top: 14px; left: 50%;
    transform: translateX(-50%);
    background: rgba(254, 250, 245, 0.94);
    border: 1px solid rgba(184, 158, 134, 0.55);
    box-shadow: 0 6px 20px rgba(92, 65, 43, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.9);
    color: #4a2815;
    padding: 7px 20px; border-radius: 30px;
    font-size: 12.5px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-weight: 600;
    z-index: 9999999; pointer-events: none;
    user-select: none;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    letter-spacing: 0.15px;
  `;

  selectionBox = document.createElement("div");
  selectionBox.style.cssText = `
    position: fixed;
    border: 1.5px dashed #9b5329;
    background: rgba(155, 83, 41, 0.1);
    box-shadow: 0 0 14px rgba(155, 83, 41, 0.22);
    z-index: 9999998; pointer-events: none;
    display: none;
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
    selectionBox.style.display = "block";
  });

  overlay.addEventListener("mousemove", (e) => {
    if (!startX) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    selectionBox.style.left = x + "px";
    selectionBox.style.top = y + "px";
    selectionBox.style.width = w + "px";
    selectionBox.style.height = h + "px";
  });

  overlay.addEventListener("mouseup", (e) => {
    if (e.button === 2) {
      e.preventDefault();
      cleanup();
      return;
    }
    if (e.button !== 0 || startX === null || startY === null) return;
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
    document.body.style.userSelect = "none";

    const startBoxX = rect.left;
    const startBoxY = rect.top;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;

    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;

      let newLeft = startBoxX + deltaX;
      let newTop = startBoxY + deltaY;

      const maxLeft = Math.max(0, window.innerWidth - box.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - box.offsetHeight);

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      box.style.left = `${newLeft}px`;
      box.style.top = `${newTop}px`;
      box.style.bottom = "auto";
      box.style.right = "auto";
    };

    const onMouseUp = () => {
      box.style.cursor = "";
      document.body.style.userSelect = "";
      saveCurrentOverlayPosition(box);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
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
  });

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

  const currentLeft = box.style.left;
  const currentTop = box.style.top;

  box.style.cssText = `
    position: fixed;
    ${currentLeft ? `left: ${currentLeft};` : ''}
    ${currentTop ? `top: ${currentTop};` : ''}
    bottom: auto;
    right: auto;
    width: 340px;
    max-height: 420px;
    z-index: 9999999;
    background: rgba(246, 241, 235, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(184, 158, 134, 0.45);
    border-radius: 14px;
    box-shadow: 0 4px 20px 0 rgba(74, 44, 17, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    padding: 10px 14px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #3b2210;
    overflow-y: auto;
    box-sizing: border-box;
    scrollbar-width: none;
    -ms-overflow-style: none;
    user-select: text;
    -webkit-user-select: text;
  `;

  if (isNew || !currentLeft || !currentTop) {
    document.body.appendChild(box);
    applyOverlayPosition(box);
  }

  box.innerHTML = `
    <div id="hs-drag-bar" style="position: absolute; top: 0; left: 0; right: 40px; height: 26px; cursor: grab; z-index: 5;"></div>
    <button id="hs-close" title="Close" style="
      position: absolute; top: 2px; right: 2px;
      width: 34px; height: 34px;
      background: transparent; color: #786959; border: none;
      cursor: pointer; font-size: 13px; font-weight: 600; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      padding: 0; z-index: 10; opacity: 0.75;
    ">✕</button>
    <div style="padding-top: 4px; padding-right: 28px; white-space: pre-wrap; line-height: 1.45; font-size: 12px; color: #3b2210; user-select: text; -webkit-user-select: text; cursor: text;">${liveBody}</div>
    <style>
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
    </style>
  `;

  makeDraggable(box);
  document.getElementById("hs-close").onclick = removeExistingOverlay;
}

// ── Loading overlay ────────────────────────────────
function showLoadingOverlay(statusText = "Solving question...") {
  removeExistingOverlay();
  const box = document.createElement("div");
  box.id = "hs-answer-overlay";
  box.style.cssText = `
    position: fixed;
    width: 290px;
    z-index: 9999999;
    background: rgba(246, 241, 235, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(184, 158, 134, 0.45);
    border-radius: 14px;
    box-shadow: 0 4px 20px 0 rgba(74, 44, 17, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    padding: 10px 14px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    color: #3b2210;
    box-sizing: border-box;
    scrollbar-width: none;
    -ms-overflow-style: none;
    user-select: text;
    -webkit-user-select: text;
  `;
  box.innerHTML = `
    <div id="hs-drag-bar" style="position: absolute; top: 0; left: 0; right: 40px; height: 26px; cursor: grab; z-index: 5;"></div>
    <button id="hs-close" title="Close" style="
      position: absolute; top: 2px; right: 2px;
      width: 34px; height: 34px;
      background: transparent; color: #786959; border: none;
      cursor: pointer; font-size: 13px; font-weight: 600; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      padding: 0; z-index: 10; opacity: 0.75;
    ">✕</button>
    <div style="display: flex; align-items: center; gap: 9px; padding-right: 28px; user-select: text; -webkit-user-select: text; cursor: text;">
      <div style="width: 14px; height: 14px; border: 2px solid #b85d19; border-top-color: transparent; border-radius: 50%; animation: hsSpin 0.8s linear infinite; flex-shrink: 0;"></div>
      <span style="font-size: 12px; font-weight: 600; color: #4a2c11;">${escapeHtml(statusText)}</span>
    </div>
    <style>
      @keyframes hsSpin { to { transform: rotate(360deg); } }
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
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

  const box = document.createElement("div");
  box.id = "hs-answer-overlay";
  box.style.cssText = `
    position: fixed;
    width: 350px;
    max-height: 440px;
    z-index: 9999999;
    background: rgba(246, 241, 235, 0.90);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(184, 158, 134, 0.45);
    border-radius: 14px;
    box-shadow: 0 4px 20px 0 rgba(74, 44, 17, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    padding: 10px 14px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #3b2210;
    overflow-y: auto;
    box-sizing: border-box;
    scrollbar-width: none;
    -ms-overflow-style: none;
    user-select: text;
    -webkit-user-select: text;
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

  if (parts.why) {
    formattedHtml += `
      <div style="background: rgba(255, 255, 255, 0.5); border-left: 2px solid #b85d19; border-radius: 0 6px 6px 0; padding: 5px 10px; margin-bottom: 8px; font-size: 12px; line-height: 1.4; color: #4a2c11;">
        <strong style="color: #87431b; display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; font-weight: 700;">Why</strong>
        ${escapeHtml(parts.why)}
      </div>
    `;
  }
  if (parts.correct) {
    let autoSelectStatus = "";
    if (autoSelect) {
      const success = selectOptionOnPage(parts.correct);
      autoSelectStatus = success 
        ? `<span style="color: #2e6930; font-size: 11px; margin-left: 8px; font-weight: 700;">(⚡ Selected on Page)</span>`
        : `<span style="color: #b45309; font-size: 11px; margin-left: 8px; font-weight: 700;">(⚠️ Verify manually)</span>`;
    }

    formattedHtml += `
      <div style="background: rgba(255, 255, 255, 0.5); border-left: 2px solid #b85d19; border-radius: 0 6px 6px 0; padding: 5px 10px; margin-bottom: 8px;">
        <span style="display: block; font-size: 10px; color: #87431b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; font-weight: 700;">Correct Option</span>
        <div style="font-size: 13px; font-weight: 600; color: #3b2210; margin-bottom: 4px;">
          ${escapeHtml(parts.correct)}
          ${autoSelectStatus}
        </div>
      </div>
    `;
  }
  if (parts.final) {
    formattedHtml += `
      <div style="background: rgba(255, 255, 255, 0.5); border-left: 2px solid #b85d19; border-radius: 0 6px 6px 0; padding: 5px 10px; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: #3b2210;">
        <span style="display: block; font-size: 10px; color: #87431b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; font-weight: 700;">Final Answer</span>
        ${escapeHtml(parts.final)}
      </div>
    `;
  }

  const hasCards = parts.why || parts.correct || parts.final;

  if (!hasCards) {
    if (strictMode) {
      formattedHtml = `
        <div style="background: rgba(255, 255, 255, 0.45); border-left: 2px solid #b45309; border-radius: 0 6px 6px 0; padding: 4px 10px; font-size: 10px; color: #92400e; margin-bottom: 8px;">
          ⚠️ Response:
        </div>
        <div style="white-space: pre-wrap; line-height: 1.5; font-size: 12px; color: #4a2c11;">${escapeHtml(cleanAnswer || "No answer received.")}</div>
      `;
    } else {
      formattedHtml = `<div style="white-space: pre-wrap; line-height: 1.5; font-size: 12px; color: #3b2210;">${escapeHtml(cleanAnswer || "No answer received.")}</div>`;
    }
  } else if (!strictMode || !keyLineCaptured) {
    for (const line of parts.extra) {
      if (!line) continue;
      formattedHtml += `<div style="font-size: 12px; line-height: 1.5; color: #5a4230; margin-bottom: 6px;">${escapeHtml(line)}</div>`;
    }
  }

  let expandStepBtnHtml = "";
  if (strictMode && lastCroppedBase64) {
    expandStepBtnHtml = `
      <div style="margin-top: 10px; padding-top: 7px; border-top: 1px dashed rgba(184, 158, 134, 0.45);">
        <button id="hs-expand-step" style="
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 11px;
          background: rgba(255, 255, 255, 0.75);
          color: #87431b;
          border: 1px solid rgba(184, 158, 134, 0.55);
          border-radius: 7px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(74, 44, 17, 0.05);
          transition: all 0.15s ease;
        ">
          <span>🔍</span> Explain Step-by-Step
        </button>
      </div>
    `;
  }

  const truncNote = truncated
    ? `<div style="margin-top: 8px; padding: 4px 10px; background: rgba(255, 255, 255, 0.45); border-left: 2px solid #b45309; border-radius: 0 6px 6px 0; font-size: 10px; color: #92400e;">⚠️ Output hit token limit.</div>`
    : "";

  let keyBadge = "";
  if (meta && meta.provider) {
    const keyNum = typeof meta.keyIndex === "number" ? meta.keyIndex + 1 : 1;
    const total = meta.totalKeys || 1;
    const fbText = meta.fallback ? " • fallback" : "";
    keyBadge = `<div style="font-size: 9px; color: #786959; margin-top: 6px; text-align: right; opacity: 0.85;">⚡ ${escapeHtml(meta.provider)}: Key ${keyNum}/${total}${fbText}</div>`;
  }

  box.innerHTML = `
    <div id="hs-drag-bar" style="position: absolute; top: 0; left: 0; right: 70px; height: 26px; cursor: grab; z-index: 5;"></div>
    <div style="position: absolute; top: 2px; right: 2px; display: flex; align-items: center; gap: 2px; z-index: 10;">
      <button id="hs-copy" title="Copy clean answer" style="
        width: 32px; height: 32px;
        background: transparent; color: #786959; border: none;
        cursor: pointer; font-size: 14px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 0; opacity: 0.75; transition: all 0.15s ease;
      ">⎘</button>
      <button id="hs-close" title="Close" style="
        width: 32px; height: 32px;
        background: transparent; color: #786959; border: none;
        cursor: pointer; font-size: 13px; font-weight: 600; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 0; opacity: 0.75; transition: all 0.15s ease;
      ">✕</button>
    </div>
    <div style="padding-top: 4px; padding-right: 28px; user-select: text; -webkit-user-select: text; cursor: text;">
      ${formattedHtml}
      ${expandStepBtnHtml}
      ${truncNote}
      ${keyBadge}
    </div>
    <style>
      #hs-answer-overlay::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
    </style>
  `;

  document.body.appendChild(box);
  applyOverlayPosition(box);
  makeDraggable(box);

  document.getElementById("hs-close").onclick = removeExistingOverlay;

  const expandBtn = document.getElementById("hs-expand-step");
  if (expandBtn) {
    expandBtn.onmouseenter = () => {
      expandBtn.style.background = "rgba(255, 255, 255, 0.95)";
      expandBtn.style.borderColor = "#87431b";
      expandBtn.style.color = "#6d3314";
      expandBtn.style.transform = "translateY(-1px)";
    };
    expandBtn.onmouseleave = () => {
      expandBtn.style.background = "rgba(255, 255, 255, 0.75)";
      expandBtn.style.borderColor = "rgba(184, 158, 134, 0.55)";
      expandBtn.style.color = "#87431b";
      expandBtn.style.transform = "none";
    };
    expandBtn.onclick = () => {
      if (!lastCroppedBase64) return;
      showLoadingOverlay("Generating step-by-step derivation...");
      callAPI(lastCroppedBase64, { forceStyle: "detailed" });
    };
  }

  const onlyAnswerText = getCleanAnswerOnly(cleanAnswer, parts);

  // Auto-copy the clean answer text immediately (only answer, no option letter/number)
  if (onlyAnswerText) {
    copyToClipboard(onlyAnswerText).then((ok) => {
      const copyBtn = document.getElementById("hs-copy");
      if (copyBtn && ok) {
        copyBtn.textContent = "✓";
        copyBtn.style.color = "#2e6930";
        copyBtn.style.opacity = "1";
        setTimeout(() => {
          if (copyBtn) {
            copyBtn.textContent = "⎘";
            copyBtn.style.color = "#786959";
            copyBtn.style.opacity = "0.75";
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
        copyBtn.style.color = "#2e6930";
        copyBtn.style.opacity = "1";
        setTimeout(() => {
          if (copyBtn) {
            copyBtn.textContent = "⎘";
            copyBtn.style.color = "#786959";
            copyBtn.style.opacity = "0.75";
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
