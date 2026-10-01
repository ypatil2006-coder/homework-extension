# 📚 Homework Solver — AI-Powered Problem Solving Chrome Extension

[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Powered by Groq](https://img.shields.io/badge/Powered%20By-Groq%20LPU-f55036?logo=groq&logoColor=white)](https://groq.com)
[![Model: Qwen 3.8 27B](https://img.shields.io/badge/Model-Qwen%203.8%2027B-8b5cf6)](https://console.groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg)](LICENSE)

> **Homework Solver** is a high-speed, unobtrusive screen-snipping browser assistant engineered for students, engineers, and competitive test-takers. Snip any question or diagram directly off your screen with `Alt+C` and receive instant, streaming visual solutions powered by Groq's high-throughput LPU inference (`qwen/qwen3.8-27b`).

---

- **🔍 Inline Step-by-Step Derivations:** Click `🔍 Explain Step-by-Step` directly on MCQ or Short answers to deep-dive into complete mathematical derivations without re-snipping the question.
- **⚡ Display-Synced Streaming (requestAnimationFrame):** Renders high-speed (300+ token/s) Groq inference with 60Hz/120Hz V-Sync throttling, completely preventing DOM micro-stutters and layout thrashing.
- **⏳ Smart 60s Rate-Limit (HTTP 429) Backoff Memory:** In-memory tracking automatically puts exhausted keys on a 60-second cooldown and prioritizes healthy keys, eliminating wasteful 500ms–1500ms failed HTTP roundtrips.
- **🎨 Acrylic Sand & Warm Espresso Aesthetic:** Calibrated glassmorphic floating overlays (`rgba(246, 241, 235, 0.90)`), tactile terracotta bronze accents (`#87431b`), and clean Plus Jakarta Sans typography.
- **✂️ Seamless Screen Snipping (`Alt+C`):** Select any question, mathematical equation, or complex diagram on any webpage with zero lag.
- **🖱️ Instant Right-Click Cancellation:** Easily abort snipping mode immediately by simply **right-clicking** anywhere or pressing **Esc**.
- **🎯 Customizable Snipping Cursors:**
  - `crosshair` *(Default)* — High-precision reticle for exact boundary selection.
  - `default` — Standard system arrow pointer.
  - `custom` — Cyberpunk Neon Cyan precision reticle, with support for custom image URLs (`.png`, `.svg`, `.cur`).
- **⚡ Dedicated Groq LPU Engine:**
  - Exclusively optimized for Groq vision models (`qwen/qwen3.8-27b`).
  - **Round-Robin Multi-Key Rotation:** Paste multiple free Groq API keys to eliminate rate limits (`429 Too Many Requests`).
  - **Live Streaming & CoT:** Watch the model's `<think>` chain-of-thought stream in real time.
- **🔘 3 Tailored Answer Modes:**
  - **MCQ Mode:** Rapid elimination of wrong options with the final letter prominently highlighted.
  - **Short Mode:** Quick two-line rationale and immediate final answer.
  - **Detailed Mode:** Deep step-by-step mathematical breakdown, formula derivation, or clean code implementation.
- **🎓 6 Specialized Subject Personas:**
  - 🧩 Aptitude, Logical Reasoning & Math
  - 📊 Probability & Statistics
  - ⚡ Algorithms & Data Structures (DSA)
  - ⚙️ Backend Development & System Architecture
  - 🤖 AI For Finance & Quantitative Methods
  - 💬 Verbal Ability & Business Communication
- **⚡ Page Auto-Select (Optional):** Automatically detects and checks the corresponding radio button or checkbox on supported quiz portals upon solving.
- **🎛️ Minimal Draggable UI:**
  - Floating answer widget with full drag, copy-to-clipboard, and instant dismiss.
  - Quick-action popup for instant tweaks without clutter.
  - Dedicated full-tab **Options Dashboard** (`options.html`) with key validation, JSON backup/restore, and cursor customizer.

---

## ⌨️ Keyboard & Mouse Controls

| Shortcut / Action | Function |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>C</kbd> | Activate drag-and-crop snipping tool on any active tab |
| <kbd>Alt</kbd> + <kbd>D</kbd> | Close active answer overlay and floating widget |
| <kbd>Right-Click</kbd> | Cancel snipping mode immediately |
| <kbd>Esc</kbd> | Cancel snipping mode or close overlay |

> *Tip: You can rebind keyboard shortcuts anytime at `chrome://extensions/shortcuts`.*

---

## 🛠️ Installation Guide

### 1. Clone or Download Repository
```bash
git clone https://github.com/yashpatil/homework-extension.git
```
*(Or download the ZIP archive and extract it).*

### 2. Load into Google Chrome (or Chromium-based browsers)
1. Open Google Chrome and visit:
   ```text
   chrome://extensions/
   ```
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the project directory (`homework-extension`).

### 3. Configure Your Groq API Key
1. Get your free API key at [console.groq.com/keys](https://console.groq.com/keys).
2. Click the **Homework Solver** extension icon in your toolbar, then click **⚙️ More Settings (New Tab)** (or right-click the extension icon and choose **Options**).
3. Paste your Groq API key(s) into the text area.
   - *Pro-Tip: You can paste multiple keys separated by newlines to enable automatic round-robin rotation.*
4. Click **⚡ Test Keys Now** to verify model access and inference, then click **💾 Save Settings**.

---

## 🏗️ Architecture & Project Structure

Built on **Manifest V3** adhering to modern Chrome extension security and performance standards:

```text
homework-extension/
├── manifest.json       # Chrome MV3 manifest declaration, permissions & shortcuts
├── background.js       # Background service worker: Tab capture & Groq streaming
├── content.js          # Injected script: Snipping tool, RAF throttler, Acrylic Sand UI
├── popup.html          # Lightweight quick-action toolbar popup
├── popup.js            # Subject persona & answer style quick switcher
├── options.html        # Comprehensive settings dashboard & live cursor previewer
├── options.js          # API key validator, JSON backup/restore & cursor manager
├── .gitignore          # Git exclusion rules
├── LICENSE             # MIT Open Source License
└── README.md           # Documentation & guides
```

---

## 🔒 Privacy & Permissions

- **Local Storage Only:** API keys, preferences, and positions are stored strictly inside your browser via `chrome.storage.local`. No third-party tracking servers or telemetry are used.
- **Direct API Communication:** Screen captures are sent directly from your browser to Groq's official API (`api.groq.com`) using your own keys.
- **Minimal Required Permissions:**
  - `activeTab` & `scripting`: Needed to capture the selected screen region and render the solver overlay.
  - `storage`: Needed to persist your API keys and UI preferences across browser sessions.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for complete details.

Created with ❤️ by **Yash Patil**.
