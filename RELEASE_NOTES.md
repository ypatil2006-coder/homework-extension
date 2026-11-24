### 🚀 Homework Solver v1.6.2 — Stealth Mode Selection & Dot Color Precision

A high-speed, unobtrusive screen-snipping browser assistant for students, developers, and test-takers powered by Groq LPU vision inference (`qwen/qwen3.8-27b`).

---

### ⚡ Highlights & What's New in v1.6.2

- **🎛️ High-Contrast Stealth Mode Selection States**:
  - Distinct solid high-contrast pill styling (`#111111` background, `#ffffff` text) for active Answer Style in stealth mode.
  - Bordered dropdown controls and dynamic context cards preventing invisible boundaries.
  - Clean, deduplicated Quick Settings header bar.
- **🎨 Custom Dot Color Precision**:
  - Full 3-digit and 6-digit hex color normalization with high-contrast indicator rings.
  - Seamless persistence and portability of `dotColor` in JSON backups.

---

### 🚀 Homework Solver v1.6.0-beta.1 — Early Access (Beta)

> ⚠️ **EARLY ACCESS / BETA NOTICE**:
> This is an **Early Access Beta** release with major UI, architectural, and engine upgrades. While extensively tested, unexpected bugs may occur. **Please report any bugs or visual glitches as soon as possible** via [GitHub Issues](https://github.com/ypatil2006-coder/homework-extension/issues) so they can be addressed immediately!

A high-speed, unobtrusive screen-snipping browser assistant for students, developers, and test-takers powered by Groq LPU vision inference (`qwen/qwen3.8-27b`).

---

### ⚡ Highlights & What's New in v1.6.0-beta.1 (Early Access)

- **🔍 Top-Anchored Multimodal Search Bar & Context Box**:
  - Integrated multimodal search bar at the very top of the answer popup.
  - Combines the user's active screen snip image with custom query text or README file context into a unified prompt for Groq vision models.
  - Allows zero-shot re-refinements and contextual follow-ups ("Solve in C++", "Explain step 3", etc.) without leaving the answer dialog.

- **📁 Dynamic Multi-File Backend Parser & 1-Click Terminal Script Exporter**:
  - Intelligent detection and parsing of multi-file backend solutions (`parseMultiFiles`) using standard delimiters (`### FILE: <path>`) as well as raw bash `cat << 'EOF'` blocks.
  - **Project Root Auto-Navigation**: Terminal scripts automatically locate and `cd` into the project root even if executed from nested subdirectories.
  - **Quick Copy Button (`[ ⚡ 1-Shot Cmd ]`)**: 1-click button directly in the files header copies the full Bash script ready to paste in your IDE terminal.
  - **Strict No-Prose Contract**: Backend persona decomposes file tree from screenshots/README and outputs 100% executable files with zero conversational filler.
  - Dual presentation modes:
    - **Files View (`[ 📑 Files ]`)**: Displays clean individual file cards with target directory paths, language tags, and 1-click clipboard copy per file.
    - **Terminal View (`[ 💻 Terminal ]`)**: Produces an automated Bash script (`generateTerminalScript`) with `mkdir -p` and `cat << 'EOF'` blocks for rapid shell pasting and automated workspace bootstrapping directly inside VS Code or terminal.

- **⚙️ In-Popup Operational Quick Settings**:
  - Direct 1-click gear icon (`⚙`) in the header opens operational controls inside the active answer popup:
    - **Answer Style**: Instant toggle between MCQ, Short, and 💻 Code Only.
    - **Subject Domain Persona**: Switch between DSA & Algorithms, Backend Systems, Quantitative Aptitude, Probability & Statistics, AI for Finance, and Verbal.
    - **Reasoning Engine**: Switch between Normal Single-Pass (~1.2s), ⚡ Parallel Dual-Key Consensus (~1.5s), and 🧠 Deep Sequential 3-Stage Pipeline.
    - **DOM Auto-Selection**: Toggle auto-clicking detected MCQ/MSQ options on active web pages.

- **⌨️ 3-State Floating Dot Cycling (Alt+D Shortcut) & Color Customization**:
  - Smart state cycling for the discreet floating dot:
    - **State 1 (Window open)**: Pressing <kbd>Alt+D</kbd> minimizes the overlay to a subtle floating dot on the screen.
    - **State 2 (Dot visible)**: Pressing <kbd>Alt+D</kbd> completely hides the dot for zero screen visibility.
    - **State 3 (Dot hidden)**: Pressing <kbd>Alt+D</kbd> immediately reshows the dot with your answer preserved.
  - **🎨 Custom Dot Colors (Presets & Custom Hex)**: Personalize the indicator with basic presets (Slate, Emerald, Blue, Amber, Rose, Violet, White, Black) or any custom 6-digit HEX code via the integrated picker.

- **↩️ Universal Multi-Point Back Navigation & Answer History Stack**:
  - Never get trapped in a view again! Full multi-point back navigation across all modes:
    - **Header**: `[← Previous Answer]` back button in `#hs-popup-header`.
    - **Top Banner**: Dedicated follow-up return bar `#hs-history-nav` with `[← Back to Previous Answer]`.
    - **Bottom Card Action**: `[← Back to Previous Solution]` action button on code derivation cards.
    - **Live Streaming & Loading States**: Real-time `[← Back]` buttons inside `#hs-stream-back-btn` and `#hs-loading-back-btn` allow instant cancellation or return while tokens are generating.

- **📐 Indentation-Safe Formatting & Horizontal-Only Resizing**:
  - Enhanced syntax-preserving tab and space normalizer (`sanitizeCodeFormatting`) guarantees 4-space column 0 indentation in Python, Java, JavaScript, and YAML.
  - Viewport-aware horizontal resizing (`resize: horizontal`) with contained vertical scrolling to keep answer popup dimensions compact and stable.

- **⚡ Snipping Engine Hardening & SSE Stream Sentinel Fix**:
  - Fixed service worker SSE stream hang by recognizing `data: [DONE]` sentinel token to terminate streaming readers immediately.
  - Resilient content script injection fallback in `background.js` and `popup.js` ensures snipping works seamlessly even on tabs opened prior to extension installation or reload.
  - Elevated z-index stacking (`2147483640` - `2147483645`) prevents host website overlays and modals from swallowing snipping mouse events.
  - Asynchronous capture synchronization eliminates null-image race conditions when dragging quickly.

---

### 🚀 Homework Solver v1.5.0 — Deterministic Greedy Decoding (Temperature 0) & Code Only Engine

A high-speed, unobtrusive screen-snipping browser assistant for students, developers, and test-takers powered by Groq LPU vision inference (`qwen/qwen3.8-27b`).

---

### ⚡ Highlights & What's New in v1.5.0

- **🎯 Deterministic Greedy Decoding (`temperature: 0`)**:
  - Enforced `temperature: 0` across all API payloads (Single-Pass, 2-Stage Pipeline, 3-Stage Unrestricted, Parallel Dual-Key, and test ping endpoints).
  - Eliminates stochastic token sampling and hallucinated deviations, providing 100% deterministic, reproducible derivations for complex quantitative aptitude, math, and code.

- **💻 New "Code Only" Mode (Replacing Detailed Mode)**:
  - Transformed "Detailed" mode into a streamlined **Code Only** mode for coding, DSA, and technical assessments.
  - Automatically isolates and extracts pure code from AI output, rendering it in a high-contrast dark monospace card with zero prose fluff or conversational clutter.
  - Quick-copy button copies pure raw code straight to clipboard.

- **⚡ 7-Key Round-Robin Multi-Key Pool**:
  - Automatically rotates across 7 pre-configured Groq API keys with instantaneous 429 rate-limit failover for high-throughput testing sessions.

- **📢 Notice & Auto-Migration for Users of Old Config**:
  - All users running older versions (v1.4.0 and earlier) will see a **`NEW`** terracotta badge on the toolbar icon and an update notification banner in the extension popup.
  - Older stored configs automatically upgrade to the new 7-key pool with legacy rate-limit locks cleared.

---

### 🚀 Homework Solver v1.4.0 — Ultra-Discreet Floating Dot Mode & What's New Hub

A high-speed, unobtrusive screen-snipping browser assistant for students, developers, and test-takers powered by Groq LPU vision inference (`qwen/qwen3.8-27b`).

---

### ⚡ Highlights & What's New in v1.4.0

- **🔘 Ultra-Discreet Floating Dot Mode**:
  - When enabled in **Tab 5: Answer Pop-up**, snipping an image will **never** automatically open or disrupt your screen with an answer window.
  - The answer is derived silently in the background while a tiny, minimalist floating indicator appears.
  - Clicking the dot instantly expands the full answer pop-up whenever you're ready.

- **🎛️ Precision Sliders for Dot Size & Opacity (Down to 0)**:
  - **Dot Size Slider (0px to 32px)**: Decrease the indicator diameter freely. At `0px`, the visual dot disappears completely while retaining an invisible 22px click point.
  - **Dot Opacity Slider (0% to 100%)**: Adjust resting translucency. At `0%`, it enters full ghost mode with a subtle proximity hint on hover.
  - Styled in a clean, unified single-shade dark slate tone (`#1e293b` / `rgba(30, 41, 59, 0.5)`).

- **✨ What's New Tab & Product Evolution Log**:
  - Added as the **first tab at the start** of the Options dashboard (`tab-whatsnew`).
  - Full, comprehensive chronological changelog across all releases (`v1.0.0` through `v1.4.0`).
  - One-click access to check for updates and review release architecture.

- **⭐ Star on GitHub with Explicit User Consent Dialog**:
  - Added Star Repo buttons in the Options header, What's New banner, Updates tab, and Extension Popup.
  - Interactive Pop-up Modal dialog transparently requests user consent before opening GitHub.
  - Safe, automated star handler in `content.js`: checks if already starred (never unstars!) and clicks the star button when not yet starred.

---

### 🚀 Homework Solver v1.3.0 — 2-Stage Verification Pipeline, 1-Click Updates & Custom Approaches

### ⚡ Highlights & What's New in v1.3.0

- **🎯 2-Stage Decoupled Pipeline (Solver ➔ Adversarial Crosschecker)**:
  - **Stage 1 (Key 1)**: Pure **Solver** deriving calculations and logic from first principles directly from the screenshot.
  - **Stage 2 (Key 2)**: Adversarial **Auditor & Crosschecker** that verifies Stage 1's work against test traps, audits mathematical calculations, checks distractor options, and formats the definitive verified answer.
  - Distributes workload across separate API keys with automatic failover and key rotation.

- **🔬 3-Stage Unrestricted Deep Reasoning Engine**:
  - Token restrictions completely lifted (`max_tokens: 4096`) for complex quantitative and multi-step reasoning.
  - Multimodal image input enabled across all reasoning stages with a live in-page thought-token tracker.

- **🧠 Global & Domain-Specific Reasoning Approach Customization**:
  - New **Reasoning Approaches** tab in Options and quick selector in the Popup.
  - Configure approaches globally or customize per subject domain (Aptitude & Reasoning, Probability & Statistics, DSA, Backend Development, AI for Finance, Communication).
  - Choose between **Normal Single-Pass (~1.2s)**, **Dual Keys Consensus (~1.5s)**, **2-Stage Solve ➔ Crosscheck**, and **3-Stage Unrestricted Engine**.

- **🔔 Automatic Release Notifications & Toolbar Badge**:
  - Background release detector checks GitHub releases with a 2-hour cache.
  - Chrome extension icon shows an eye-catching **`NEW`** badge in terracotta (`#c84e1b`) when an update is available.
  - Acrylic Sand update banner in the popup alerts users with a 1-click update action.

- **📦 1-Click Update & Zero-Loss Configuration Portability**:
  - **1-Click Update**: Automatically exports an encrypted JSON backup of all API keys, models, approaches, themes, and optics (`homework-solver-backup-YYYY-MM-DD.json`), copies it to your clipboard, and downloads the latest release archive.
  - **1-Click Restore (.json)**: Native file-picker restore in the Updates & Backup tab restores all keys and configurations instantly with zero copy-pasting required.

---

### 📦 How to Install / Update Unpacked

1. Download `homework-solver-v1.5.0.zip` below and extract it.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** (or click the 🔁 **Reload** button on the existing extension).
5. All your settings are retained natively; or click **📥 1-Click Restore** in the Updates & Backup tab to restore from your backup file!

