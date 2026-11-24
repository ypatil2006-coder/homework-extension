# One-Click In-Place Auto-Update & Universal UI Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a zero-friction in-place 1-click update engine for unpacked Chrome extensions using modern File System Access API & in-memory stream decompression, paired with a universal in-overlay back navigation system, textarea auto-grow fix, and synchronized Alt+D dot toggle.

**Architecture:** 
1. The update engine leverages the browser's File System Access API (`showDirectoryPicker`) with handle persistence in IndexedDB, parses GitHub release archives in-memory using pure native `DecompressionStream('deflate-raw')`, writes files directly to disk via `FileSystemDirectoryHandle.createWritable()`, and triggers `chrome.runtime.reload()`. Dual CLI scripts (`scripts/update.sh` and `scripts/update.ps1`) provide a 1-line copyable fallback.
2. The UI layer overhauls the options page update card and rebuilds the overlay header & content structure in `content.js`, ensuring universal back navigation across all answer modes, eliminating header/search bar overlaps, fixing textarea vertical clipping, and synchronizing the 3-state Alt+D dot toggle.

**Tech Stack:** Chrome Extensions Manifest V3, Web File System Access API, IndexedDB, Web Streams API (`DecompressionStream`), Vanilla JavaScript (ES2022+), Bash, PowerShell, Node.js (test runner).

**Spec:** [one_click_update_plan.md](file:///home/yash/.gemini/antigravity-cli/brain/39a0e2a0-9f67-4557-8d41-4336b31c6744/one_click_update_plan.md)

## Global Constraints
- Zero external npm dependencies: all in-memory ZIP decompression must use browser-native `DecompressionStream('deflate-raw')`.
- Non-destructive updates: never overwrite or delete `keys.local.js`, custom themes, or existing `chrome.storage.local` keys.
- WCAG AA accessibility: all buttons, badges, and text must maintain a minimum 4.5:1 contrast ratio against their backgrounds.
- Extension reload safety: update process must flush all file writes before calling `chrome.runtime.reload()`.

## Review Focus
1. ZIP archive with subdirectory prefixes (e.g., `homework-extension-1.6.0/`) unpacking improperly: the decompression engine must strip leading common directories when mapping to root.
2. File System Access API permission revocation across browser restarts: handle must call `queryPermission({ mode: 'readwrite' })` and re-request if prompt is required.
3. Multi-line search textarea placeholder vertical clipping on single-row initialization: textarea must have explicit `line-height`, `min-height: 32px`, and auto-grow input handler.
4. Alt+D toggle desynchronization between background command dispatcher and content script keydown listener: state must be tracked consistently via `isDotHidden` and shared message broadcasts.
5. Overlay answer with zero code / empty response trapping user: header must persist with Back navigation or retry action even on non-code / empty outputs.

---

### Task 1: In-Memory Decompression & In-Place Directory Writer Engine (`updater.js`)

**Files:**
- Modify: `updater.js:100-227`
- Test: `tests/test_in_memory_updater.js`

**Interfaces:**
- Consumes: `fetchLatestReleaseInfo()` from `updater.js`, native `DecompressionStream`, Web File System Access API.
- Produces:
  - `openUpdaterDb(): Promise<IDBDatabase>`
  - `getLinkedDirectoryHandle(): Promise<FileSystemDirectoryHandle|null>`
  - `saveLinkedDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void>`
  - `extractZipEntries(arrayBuffer: ArrayBuffer): Promise<Array<{ path: string, data: Uint8Array }>>`
  - `writeFilesToDirectoryHandle(dirHandle: FileSystemDirectoryHandle, files: Array<{ path: string, data: Uint8Array }>, onProgress: Function): Promise<{ written: number, preserved: string[] }>`
  - `performInPlaceDirectoryUpdate(options: { onProgress?: Function, onStatus?: Function }): Promise<{ success: boolean, updatedFiles: number }>`

- [ ] **Step 1: Write failing unit test for in-memory zip decompression & directory writing**

Create `tests/test_in_memory_updater.js`:
```javascript
const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Test that DecompressionStream('deflate-raw') extracts entries from homework-solver-v1.6.0-beta.1.zip
async function runTests() {
  const { extractZipEntries } = require("../updater.js");
  const zipPath = path.join(__dirname, "../homework-solver-v1.6.0-beta.1.zip");
  if (!fs.existsSync(zipPath)) {
    console.log("Zip not found, skipping zip read test");
    return;
  }
  const buf = fs.readFileSync(zipPath);
  const entries = await extractZipEntries(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert(entries.length > 0, "Should extract entries from zip");
  const manifest = entries.find(e => e.path === "manifest.json" || e.path.endsWith("/manifest.json"));
  assert(manifest, "Should extract manifest.json");
  console.log(`✅ Extracted ${entries.length} entries successfully`);
}
runTests();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_in_memory_updater.js`
Expected: FAIL with "extractZipEntries is not a function"

- [ ] **Step 3: Implement in-memory decompression and in-place writer in `updater.js`**

Implement:
- `extractZipEntries(arrayBuffer)`: reads ZIP Local File Headers and Central Directory, expands deflated streams using `new DecompressionStream("deflate-raw")`, strips root folder prefixes, and returns array of `{ path, data }`.
- IndexedDB storage helpers: store `FileSystemDirectoryHandle` in `idb` database `HomeworkSolverDB`, store `directoryHandleStore`.
- `writeFilesToDirectoryHandle(dirHandle, files, onProgress)`: iterates over files, skips `keys.local.js`, creates subdirectories via `getDirectoryHandle({ create: true })`, writes streams via `createWritable()`, reports progress.
- `performInPlaceDirectoryUpdate()`: orchestrates download, extraction, writing, and triggers `chrome.runtime.reload()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_in_memory_updater.js`
Expected: PASS with "✅ Extracted ... entries successfully"

- [ ] **Step 5: Commit Task 1**

```bash
git add updater.js tests/test_in_memory_updater.js
git commit -m "feat(updater): implement in-memory ZIP extraction and in-place directory writer"
```

---

### Task 2: CLI 1-Liner Automated Updater Scripts (`scripts/update.sh` & `scripts/update.ps1`)

**Files:**
- Create: `scripts/update.sh`
- Create: `scripts/update.ps1`
- Test: `scripts/update.sh` syntax check

**Interfaces:**
- Consumes: GitHub Releases API (`https://api.github.com/repos/ypatil2006-coder/homework-extension/releases/latest`).
- Produces: Executable shell scripts that download latest zip asset, backup `keys.local.js`, extract files in-place, restore `keys.local.js`, and prompt user to reload in `chrome://extensions`.

- [ ] **Step 1: Write failing test / script validation check**

Run: `bash -n scripts/update.sh`
Expected: FAIL with "No such file or directory"

- [ ] **Step 2: Create `scripts/update.sh` for Linux and macOS**

Write `scripts/update.sh`:
- Auto-detects extension directory (current directory or default target).
- Preserves `keys.local.js` if present.
- Downloads `homework-solver-*.zip` from GitHub releases using `curl` / `wget`.
- Unzips cleanly into target directory.
- Restores `keys.local.js`.
- Output clean colored success banner with instructions to click reload in `chrome://extensions`.
- Set executable permission (`chmod +x scripts/update.sh`).

- [ ] **Step 3: Create `scripts/update.ps1` for Windows PowerShell**

Write `scripts/update.ps1`:
- PowerShell equivalent supporting `Invoke-RestMethod`, `Expand-Archive`, `keys.local.js` preservation, and colored status output.

- [ ] **Step 4: Verify script syntax**

Run: `bash -n scripts/update.sh`
Expected: Clean exit code 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/update.sh scripts/update.ps1
git commit -m "feat(cli): add 1-line automated update scripts for Linux, macOS, and Windows"
```

---

### Task 3: Options UI Overhaul for 1-Click Update & Status Indicator (`options.html` & `options.js`)

**Files:**
- Modify: `options.html:2540-2587`
- Modify: `options.js:1270-1360`
- Test: `node --check options.js` & manual DOM check

**Interfaces:**
- Consumes: `performInPlaceDirectoryUpdate()`, `getLinkedDirectoryHandle()`, `saveLinkedDirectoryHandle()` from `updater.js`.
- Produces:
  - Directory link badge: `#hs-dir-status-badge`
  - In-place update button: `#btn-inplace-update`
  - Link directory button: `#btn-link-folder`
  - Progress indicator: `#hs-update-progress-bar`, `#hs-update-status-msg`
  - 1-click terminal command copy buttons: `#btn-copy-update-cmd-sh`, `#btn-copy-update-cmd-ps`

- [ ] **Step 1: Update `options.html` template**

Replace the manual update card (lines 2540-2587) with:
1. Header with update status badge and "Check for Updates" button.
2. In-Place Update Section:
   - Status badge showing linked folder name or warning if unlinked.
   - Primary `[ ⚡ 1-Click In-Place Auto-Update ]` button with animated update state.
   - Secondary `[ 📁 Link Extension Folder ]` button.
   - Progress bar `<progress id="hs-update-progress-bar">` and log message `<div id="hs-update-status-msg">`.
3. Terminal 1-Liner Helper Card:
   - Clean pre-formatted command:
     `curl -fsSL https://raw.githubusercontent.com/ypatil2006-coder/homework-extension/main/scripts/update.sh | bash`
   - `[ 📋 Copy Bash ]` and `[ 📋 Copy PowerShell ]` quick buttons.

- [ ] **Step 2: Wire directory linking and auto-update handlers in `options.js`**

Implement in `options.js`:
- On load: check `getLinkedDirectoryHandle()`. If linked, verify permissions and show folder name.
- On click `#btn-link-folder`: call `window.showDirectoryPicker({ mode: 'readwrite' })`, verify `manifest.json` exists in picked folder, and save handle in IndexedDB.
- On click `#btn-inplace-update`:
  - If handle not linked, prompt picker.
  - Call `performInPlaceDirectoryUpdate({ onProgress, onStatus })`.
  - Update progress bar and text in real time.
  - Show success banner before `chrome.runtime.reload()`.
- On click terminal copy buttons: copy script 1-liner to clipboard and show feedback toast.

- [ ] **Step 3: Verify syntax and contrast ratios**

Run: `node --check options.js`
Expected: Syntax OK.
Verify all text contrast ratios in `options.html` meet WCAG AA (>= 4.5:1).

- [ ] **Step 4: Commit Task 3**

```bash
git add options.html options.js
git commit -m "feat(options): overhaul updates UI with 1-click in-place updater and terminal 1-liners"
```

---

### Task 4: Fix Textarea Auto-Grow, Layout Overlap, and Universal Header (`content.js`)

**Files:**
- Modify: `content.js:3360-3450`, `content.js:3650-3750`
- Test: `tests/test_quick_settings.js` & `tests/test_dot_toggle_and_nav.js`

**Interfaces:**
- Consumes: Answer overlay DOM, theme styling, `answerHistory`.
- Produces:
  - Non-clipping, auto-growing `#hs-search-input`.
  - Collision-free `#hs-popup-header` flex row above `#hs-solution-view`.
  - Full header controls present in every state (standard, code-only, empty response, loading).

- [ ] **Step 1: Fix `#hs-top-search-bar` textarea clipping & sizing in `content.js`**

Update `#hs-search-input` CSS and behavior:
- Set `min-height: 32px`, `height: 32px`, `line-height: 1.4`, `padding: 6px 10px`, `box-sizing: border-box`.
- Attach `input` event listener that sets `height = "auto"` then `height = Math.min(120, scrollHeight) + "px"` so multi-line queries and placeholder text never clip vertically.
- Ensure placeholder is concise: `placeholder="Ask follow-up or paste README context… (Enter to send)"`.

- [ ] **Step 2: Eliminate header controls overlap with search bar**

Ensure `#hs-popup-header` is always rendered as a dedicated flex row with:
- `display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid ${colorWithAlpha(inp.cardBorder, 0.45)}; width: 100%; box-sizing: border-box; flex-shrink: 0;`
- Left section: `#hs-header-left` (Drag bar, Title, Back button).
- Right section: `#hs-header-controls` (Settings ⚙, Copy ⎘, Minimize —, Close ✕).
- Strictly avoid absolute positioning that places controls over the content container.

- [ ] **Step 3: Ensure header presence on empty, non-code, or error outputs**

When `cleanAnswer` contains no code cards or is a plain descriptive text (like Image 2: "There is no coding question... No code to output"):
- Ensure `#hs-popup-header` is fully rendered with title "⚡ Homework Solver" or "💻 Solution".
- Ensure the user has access to Settings ⚙, Minimize —, Close ✕, and Back button.
- If `answerHistory.length === 0`, render a subtle `[ 🔄 Re-snip ]` / `[ ⚙ Settings ]` toolbar so the user is never trapped.

- [ ] **Step 4: Verify syntax & run existing tests**

Run: `node --check content.js && node tests/test_dot_toggle_and_nav.js`
Expected: Syntax OK and all tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add content.js
git commit -m "fix(ui): eliminate header overlap, fix textarea vertical clipping, and ensure persistent header"
```

---

### Task 5: Universal Back Navigation & Alt+D Dot Toggle Synchronization (`content.js` & `background.js`)

**Files:**
- Modify: `content.js:2870-2930`, `content.js:3600-3675`, `background.js`
- Test: `tests/test_dot_toggle_and_nav.js`

**Interfaces:**
- Consumes: `answerHistory`, `isDotHidden`, `lastAnswerPayload`, `pendingAnswerPayload`.
- Produces:
  - Universal back navigation handler restoring prior answers across code solution, follow-up query, terminal script, and settings views.
  - Robust 3-state Alt+D toggle handler:
    - State 1: Overlay open -> minimize to dot.
    - State 2: Dot visible -> hide dot completely.
    - State 3: Dot hidden -> restore dot with last answer payload.
    - State 4: Empty -> recreate ready dot.

- [ ] **Step 1: Write extended unit tests for universal back navigation & Alt+D states**

Add tests to `tests/test_dot_toggle_and_nav.js` testing:
1. Code solution back button restores previous MCQ/short answer.
2. Follow-up query back button restores original answer.
3. Settings view back button restores active solution.
4. Alt+D toggle state transitions from background message and content keydown.

- [ ] **Step 2: Run test to verify any gaps**

Run: `node tests/test_dot_toggle_and_nav.js`

- [ ] **Step 3: Implement universal back navigation and Alt+D sync in `content.js` & `background.js`**

Implement:
- Ensure `answerHistory.push(...)` is called prior to:
  1. Clicking `[💻 Code Solution]`.
  2. Submitting search / follow-up query.
- Wire `#hs-header-back-btn` in header and `#hs-btn-bottom-back-history` at bottom to pop `answerHistory` and call `showAnswerOverlay(prev.answer, prev.options)`.
- Ensure `toggleOverlayAndDot()` checks `isDotHidden`, properly sets `dot.style.display`, applies optical styles via `applyDotOptics(dot)`, and broadcasts state to background.
- Update `background.js` command handler to route `"toggleOverlayAndDot"` message without state conflicts.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_dot_toggle_and_nav.js`
Expected: PASS with "✅ All Dot Toggle (Alt+D) & View Back Navigation tests passed!"

- [ ] **Step 5: Commit Task 5**

```bash
git add content.js background.js tests/test_dot_toggle_and_nav.js
git commit -m "fix(navigation): implement universal back navigation and synchronized Alt+D dot toggle"
```

---

### Task 6: Full Verification Suite, Build Packaging & GitHub Release Asset Sync

**Files:**
- Modify: `manifest.json` (if version bump or permissions needed)
- Create: `homework-solver-v1.6.0-beta.1.zip`
- Test: All test suites in `tests/`

**Interfaces:**
- Consumes: All updated files.
- Produces: Clean release `.zip` asset uploaded to GitHub release `v1.6.0-beta.1`.

- [ ] **Step 1: Run comprehensive syntax checks across all JS files**

Run:
```bash
node --check content.js && node --check background.js && node --check popup.js && node --check options.js && node --check updater.js
```
Expected: Clean exit code 0 on all files.

- [ ] **Step 2: Run all unit test suites**

Run:
```bash
node tests/test_code_sanitizer.js && \
node tests/test_multifile_parser.js && \
node tests/test_search_query_builder.js && \
node tests/test_quick_settings.js && \
node tests/test_dot_toggle_and_nav.js && \
node tests/test_in_memory_updater.js
```
Expected: 100% passing test assertions.

- [ ] **Step 3: Pack clean distribution zip archive**

Run:
```bash
zip -r homework-solver-v1.6.0-beta.1.zip \
  manifest.json \
  content.js \
  background.js \
  popup.html popup.js \
  options.html options.js \
  updater.js \
  scripts/ \
  icons/ \
  -x "*.git*" "*.DS_Store*" "tests/*" "docs/*"
```

- [ ] **Step 4: Update GitHub release asset**

Run:
```bash
gh release upload v1.6.0-beta.1 homework-solver-v1.6.0-beta.1.zip --clobber
```
Verify:
```bash
gh release view v1.6.0-beta.1
```
Expected: `homework-solver-v1.6.0-beta.1.zip` updated on release.

- [ ] **Step 5: Final git status & synchronization**

```bash
git status
git push origin main
```
