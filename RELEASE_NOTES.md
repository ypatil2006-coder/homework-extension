### 🚀 Homework Solver v1.3.0 — 2-Stage Verification Pipeline, 1-Click Updates & Custom Approaches

A high-speed, unobtrusive screen-snipping browser assistant for students, developers, and test-takers powered by Groq LPU vision inference (`qwen/qwen3.8-27b`).

---

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

1. Download `homework-solver-v1.3.0.zip` below and extract it.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** (or click the 🔁 **Reload** button on the existing extension).
5. All your settings are retained natively; or click **📥 1-Click Restore** in the Updates & Backup tab to restore from your backup file!

