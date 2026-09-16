# Homework Solver — Latency Optimization Guide

> **Goal:** make the extension return answers **faster** (lower time-to-answer) **without hurting answer quality** (OCR accuracy, reasoning correctness).
>
> **Interpretation note:** "lower speed" is read as *lower latency / quicker response* — the time from pressing Alt+C to seeing an answer. This doc covers both **real** latency (fewer wasted calls, shorter wait) and **perceived** latency (answer appears sooner on screen).

---

## 1. TL;DR — the three changes that matter most

| # | Change | Effect | Quality impact | Effort |
|---|--------|--------|----------------|--------|
| 1 | **Stream responses** (SSE) instead of waiting for the full JSON | Answer starts painting in ~1s, not after full generation | None (same final text) | Medium |
| 2 | **Abort + parallel fallback** instead of serial key×model chains | Worst case drops from N×M×K serial calls to `timeout + fastest fallback` | None (fallback order preserved) | Medium |
| 3 | **Shrink the image pipeline** (1024px, JPEG 0.85) | Faster encode + upload; smaller request payload | None — 1024px is at/near every provider's native vision resize | Low |

Everything below is the reasoning behind these, plus the smaller levers.

---

## 2. Where time goes today

The current flow, and where latency accumulates (typical numbers):

```
Alt+C
 └─ captureVisibleTab (full viewport) ......... ~50–250ms   [full-screen PNG, expensive]
 └─ wheel re-captures while scrolling ......... repeat cost each wheel event
 └─ drawImage + toDataURL (1200px, jpeg 0.92) .. ~100–400ms [blocks main thread]
 └─ base64 upload (often 300–600 KB) ........... ~200–800ms  [network, depends on pipe]
 └─ API time-to-first-token ................... ~300ms–2s   [provider + model dependent]
 └─ full generation (max_tokens 850) .......... ~2–8s       [the biggest chunk]
 └─ fallback chain IF first call fails ......... worst case:
      keys(×) models(×) providers .......... each serial round-trip added on top
 └─ render overlay ............................ ~10ms
```

Two structural problems stand out:

1. **Generation time dominates.** Waiting for the *full* answer before showing anything. Streaming fixes perception even when total time is unchanged.
2. **Fallbacks are fully serial.** A bad key/model tries key1→model1, key1→model2, …, key2→model1, … — every failed round-trip is stacked latency. If one request *hangs* (no timeout), it blocks everything.

---

## 3. Working principles

**Quality = correct answer.** Every optimization below is graded on that, not on how pretty the output is.

Guardrails used throughout:

- **Don't pick a worse model for speed.** Racing a 90b model against an 11b model and taking whoever's first *does* trade quality for speed. The race below races *keys for the same model* and preserves model priority.
- **Keep image resolution at or above provider-native resize.** Downscaling *below* ~1024px on the long edge can blur subscripts/small text. 1024px is safe.
- **One paid request on the happy path.** Parallel fan-out only kicks in on timeout/failure, so cost doesn't multiply on the 95% case.
- **Nothing changes what the model is asked** — only *when* we give up, and *how fast we show its output*.

---

## 4. Optimizations by area

### A. Image pipeline — fast, zero quality impact

**A1. Reduce cap 1200px → 1024px, JPEG 0.92 → 0.85** *(content.js `cropAndSolve`)*

Groq's Llama vision, OpenAI's GPT-4o, and Claude all internally downscale to ~768–1152px on the long edge before tokenizing. A 1200px source is larger than what the model actually "sees". Matching it at 1024px:

- Typical payload drop: 300–600 KB → 150–350 KB, which cuts upload time roughly in half.
- Text/subscript clarity holds — you stay at/above native resize.
- JPEG 0.85 is visually indistinguishable from 0.92 for screenshots of text, and re-encodes faster.

```js
const maxDim = 1024;                       // was 1200
const scale = Math.min(maxDim / rawW, maxDim / rawH, 1);   // add the `1` clamp: only downscale
const croppedBase64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];  // was 0.92
```

**A2. Debounce the wheel re-capture** *(content.js lines ~69–83)*

`captureVisibleTab` on every wheel event is expensive. Capture immediately on the first scroll, then suppress re-captures until 250ms of scrolling quiet:

```js
let recaptureTimer = null;
overlay.addEventListener("wheel", (e) => {
  e.preventDefault();
  window.scrollBy(0, e.deltaY);
  clearTimeout(recaptureTimer);
  recaptureTimer = setTimeout(captureScreenshot, 250);   // was 150ms, fires per event
});
```

**A3. (Optional, P2) Encode off the main thread** — `toDataURL` on a large canvas janks the page for 100–400ms. OffscreenCanvas in a web worker removes that. Nice-to-have; doesn't change latency of the answer itself.

### B. Request strategy — the big wins

**B1. Hard timeout on every request** *(new)*

Today a hung request blocks the entire chain. Wrap every fetch in an `AbortController`:

```js
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), HARD_TIMEOUT_MS); // ~12s
const res = await fetch(url, { ..., signal: ctrl.signal });
// ... in finally: clearTimeout(timer)
```

**B2. Two-phase solving: fast path first, parallel fallback only on failure**

Replace the fully-serial `keys × models × providers` loop with:

- **Phase 1 (happy path):** one streamed request to the *primary provider, first key, known-good model*. Give it a *time-to-first-token* deadline (~4s).
- **Phase 2 (failure only):** fire every remaining `key × model` for the same provider, *plus* the next providers, **all in parallel**; take the first that produces text (`Promise.any`).

This keeps the common case to **one request**, and bounds the worst case to `~4s + fastest remaining call` instead of the full serial product.

```js
async function solve() {
  // Phase 1 — single streamed call, primary provider + first key + best-known model
  const fast = await callStream({ ...primaryCfg, firstTokenDeadline: 4000 });
  if (fast.ok) return render(fast.text);

  // Phase 2 — everything else at once, first success wins
  const fallbacks = buildFallbackList();                 // same provider: other keys × other models
  const winners  = await Promise.any(
    fallbacks.map(cfg => callStream({ ...cfg, deadline: HARD_TIMEOUT_MS }))
  );
  return render(winners.text);
}
```

> **Quality guard:** Phase 2 only races *within the same model tier* (e.g., all `llama-3.2-11b` keys), then tries the next model tier as a *separate* parallel wave. Never race an 11b against a 90b and take whoever's first — that's how you'd silently lose quality.

**B3. Remember the last known-good model & key** *(new)*

Groq's model list changes and custom overrides can 404. Persist the last successful `(provider, model, keyIndex)` and try it **first** next time:

```js
// storage: lastGood = { Groq: { model: "llama-3.2-11b-vision-instruct", keyIndex: 0, ts: ... } }
function orderModels(customModel, lastGoodModel) {
  const list = [];
  if (customModel)            list.push(customModel);
  if (lastGoodModel && !list.includes(lastGoodModel)) list.push(lastGoodModel);
  for (const m of DEFAULTS)   if (!list.includes(m)) list.push(m);
  return list;
}
// after success: chrome.storage.local.set({ lastGood: {...} })
```

This is pure win: same model → same quality, but you skip the "wrong guess" round-trip every time.

**B4. Prune dead models from the default list**

`llama-3.2-11b-vision-preview` and friends come and go. Query `GET https://api.groq.com/openai/v1/models` once per session (or on save) and drop any `model_not_found` candidates from the fallback list. Every pruned dead model removes a guaranteed-failed round-trip.

### C. Model & prompt — real wins with attention to quality

**C1. Streaming (the single highest-impact change)** — see §5.

**C2. Trim the "Think through the problem thoroughly internally" instruction** *(content.js systemPrompts)*

That phrase invites long internal reasoning → more output tokens → slower generation. Options:
- **Keep it for `detailed`** (quality floor), drop it for `short`/`mcq` where the desired output is already small and the token cap enforces brevity anyway.
- Or replace with "Reason briefly, then answer." — keeps correctness, cuts ~15–30% of tokens.

Quality risk: minimal for `short`/`mcq`; the final answer content is what's graded, and the caps (150/180 tokens) already force concision. `detailed` keeps the full reasoning instruction.

**C3. Model priority that balances speed and quality** *(content.js `getGroqVisionModels`)*

Current order puts the fast 11b first — good for latency, but the 90b gives better answers on hard problems. Suggested split by style:
- `mcq` / `short`: fast model first (11b-class). Answers are short; correctness comes mostly from prompt + image clarity.
- `detailed`: 90b-class first, 11b as fallback. The longer generation justifies the stronger model.

This is a *taste* lever — if you want a hard "always fast" or "always best" stance, the per-style table makes it a one-line change.

**C4. Time-of-day / load isn't controllable from the extension** — skip.

### D. Perceived latency — feels fast even when it isn't

**D1. Stream into the overlay** (§5) — text starts painting while the model still writes. Time-to-first-word drops from ~3–8s to ~1s. This is the biggest perceived win and the cheapest to implement.

**D2. Show provider/model during loading** — "Solving question…" is dead time. With the orchestrator, update the spinner with `llama-3.2-11b · Groq` once the call starts. Keeps the user informed, zero cost.

**D3. Keep the loading overlay immediate** (already done) — good.

### E. Micro & maintenance

| Item | Change | Effect |
|------|--------|--------|
| E1 | Reuse one `AbortController` helper for all three providers (Groq/OpenAI/Claude) | Removes duplicated try/catch per provider, one place to tune timeouts |
| E2 | Add `temperature: 0.1` | Consistent, deterministic answers (not faster, but avoids re-rolls from randomness) |
| E3 | Measure and log per-request timing (see §7) | You can't tune what you don't see |
| E4 | Keep `max_tokens` maps as-is (850/180/150) | Right-sized already |

---

## 5. Recommended architecture — streamed, timed, fallback-on-failure

Central idea: **one streamed request on the happy path; everything that isn't the happy path runs in parallel and races.**

### 5.1 A streaming fetch helper (Groq shown; OpenAI identical, Claude uses SSE `content_block_delta`)

```js
async function callStream({ url, headers, body, deadlineMs, onChunk }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deadlineMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST", headers, signal: ctrl.signal,
      body: JSON.stringify({ ...body, stream: true }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({}));
      return { ok: false, error: e?.error?.message || res.status }; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    let ttft = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      for (const line of buf.split("\n").slice(0, -1)) {
        const p = line.trim();
        if (!p.startsWith("data:")) continue;
        const d = p.slice(5).trim();
        if (d === "[DONE]") continue;
        try {
          const j = JSON.parse(d);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) {
            if (!ttft) ttft = performance.now() - t0;   // time-to-first-token
            text += delta; onChunk?.(delta);
          }
        } catch {}
      }
      buf = buf.split("\n").pop();
    }
    return { ok: true, text, ttft, total: performance.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(timer); }
}
```

### 5.2 Orchestrator

```js
async function solve(b64, cfg) {
  showLoadingOverlay();
  const paint = (partial) => appendToOverlay(partial);          // stream live

  // Phase 1 — primary provider, first key, best-known model, 4s first-token deadline
  const primary = cfg.primary();
  const fast = await callStream({ ...primary, deadlineMs: 4000, onChunk: paint });
  if (fast.ok) return finalizeOverlay(fast.text);

  // Phase 2 — all remaining (same-model keys, then next model tier, then providers) at once
  const waves = buildParallelWaves(cfg, primary);
  for (const wave of waves) {                    // each wave = same model tier
    try {
      const winner = await Promise.any(wave.map(c =>
        callStream({ ...c, deadlineMs: HARD_TIMEOUT_MS, onChunk: paint })));
      saveLastGood(winner.meta);                 // update known-good cache
      return finalizeOverlay(winner.text);
    } catch { continue; }                        // this tier failed → next tier
  }
  showAnswerOverlay("All providers failed — see console for per-call errors.");
}
```

> **Why two phases instead of always-parallel:** on the happy path you pay **one** request (one key, one model). You only spend extra calls when the first one didn't produce a first token in 4s. `Promise.any` on same-tier calls keeps quality: an 11b answer never beats a 90b answer that's still writing.

### 5.3 Streaming + the existing answer formatter

The overlay currently re-renders the *final* text to build the Why / Correct Option cards. With streaming:

- While streaming: append raw text to the pre-wrap section (updates every chunk).
- On completion: re-run the existing `showAnswerOverlay` formatting on the full text to swap in the styled cards.

This gives instant paint and keeps the pretty final UI. The `mcq` auto-select button still works off the final text.

---

## 6. Prioritized roadmap

| Priority | Item | Est. latency win | Quality impact | Effort |
|----------|------|------------------|----------------|--------|
| **P0** | B1 hard timeouts | Removes hang-bottlenecks (unbounded → 12s cap) | None | S |
| **P0** | C1 / D1 streaming | TTFT ~3–8s → ~1s (perceived) | None | M |
| **P0** | B2 two-phase fallback | Worst case serial → parallel | None (tier-preserving) | M |
| **P1** | A1 image 1024px / 0.85 | Upload cut ~2× | None (at native resize) | S |
| **P1** | B3 known-good cache | Skips a guaranteed-fail round-trip per solve | None (same model) | S |
| **P1** | A2 debounce wheel | Removes redundant captures | None | S |
| **P1** | C2 trim CoT prompt (short/mcq) | ~15–30% fewer output tokens | Minimal for short/mcq | S |
| **P2** | B4 prune dead models | Removes guaranteed-fail calls | None | S |
| **P2** | C3 per-style model priority | Latency vs. quality per style | Trade-off — tune to taste | S |
| **P2** | A3 OffscreenCanvas encode | Removes main-thread jank | None | L |
| **P2** | D2 provider/model in spinner | Perceived | None | S |

Effort: **S** = minutes, **M** = an hour-ish, **L** = larger refactor.

**Suggested order:** P0 block first (timeout + streaming + two-phase), then the P1 block — most of it is small and independent. Everything P0–P1 is safe to ship together.

---

## 7. Measurement & verification

You can't tune blind. Add one log line around `callAPI`/`solve`:

```js
// after capture+encode
console.log(`[hs] encode: ${(t1 - t0).toFixed(0)}ms, ${(b64.length * 3 / 4 / 1024).toFixed(0)}KB`);
// per provider call (from callStream return)
console.log(`[hs] ${api}/${model}: ttft=${ttft.toFixed(0)}ms total=${total.toFixed(0)}ms`);
```

**Baseline before changing anything:** on your real homework platform (not a blank tab), snip a representative question and record encode/upload/TTFT/total.

**Verification checklist after the change:**

- [ ] TTFT drops on the happy path (streaming works; first text paints fast).
- [ ] A deliberately-bad primary key still produces an answer within ~timeout + one fallback call (parallel path works).
- [ ] Same answer quality on a hard problem in `detailed` mode vs. before (A/B the transcript).
- [ ] MCQ answers still auto-parse and the auto-select button still works (formatting preserved on final text).
- [ ] Groq, OpenAI, and Claude each still solve (streaming implemented per-provider).
- [ ] Payload size dropped (log line) with no visible text-blur at 1024px.
- [ ] No runaway cost: happy path still issues exactly one paid request (Network tab).

---

## 8. Risks & trade-offs

| Risk | Mitigation |
|------|-----------|
| Streaming doubles code paths per provider (SSE formats differ) | Shared helper, per-provider only the SSE parser differs; keep non-stream fallback |
| Parallel fallback can issue several calls on failure | Only triggers after Phase 1 fails to produce a first token in 4s; normal case = 1 call |
| Taking "first success" could pick a worse answer | Tiers: parallel *within* a model tier, sequential between tiers — never 11b vs 90b |
| Lowering image res could blur tiny text | Hard floor at 1024px (≈ provider-native); keep `detailed` at 1024, don't go below |
| Abort mid-stream can waste a partial token bill | Aborts happen only at deadlines; small, bounded cost, saves far more than it costs |
| Removing CoT prompt could lower detailed-mode rigor | Only trimmed for `short`/`mcq`; `detailed` keeps full reasoning |

---

## 9. Optional settings to expose in the popup

If you want the behavior user-tunable (all default to the fast-but-safe values):

- **Speed mode:** `turbo` (aggressive: race same-tier keys immediately, 1024px, short deadline) / `balanced` (recommended, this doc's defaults) / `quality` (1200px, 90b-first, long deadline).
- **Streaming toggle:** on by default; off falls back to the existing full-JSON path.
- **Hard timeout (ms):** default 12000.
- **First-token deadline (ms):** default 4000.

Storage key suggestions: `{ speedMode, streaming, hardTimeoutMs, firstTokenMs }` — read in `callAPI` alongside the existing `api/keys/style/models/subject`.
