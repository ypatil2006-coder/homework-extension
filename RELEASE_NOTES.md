### 🚀 Homework Solver v1.2.0 — Multi-Choice (MSQ) Intelligence & Derivation Engine

A high-speed, unobtrusive screen-snipping browser assistant for students, developers, and test-takers powered by Groq LPU vision inference (`qwen/qwen3.8-27b`).

---

### ⚡ Highlights & What's New in v1.2.0

- **☑️ Multi-Choice (MSQ) vs Single-Choice (SCQ) Vision Detection**:
  - The reasoning protocol and vision system prompts now visually differentiate between **square checkboxes (`☐`)** (indicating multiple correct answers) and **circular radio buttons (`○`)** (indicating single-choice questions).
  - Clean standardized output contract: `Correct Option(s): <Options>`.
- **⚡ Comprehensive Multi-Target Auto-Select**:
  - The DOM auto-select engine now scans and selects *all* matching correct options on supported quiz portals instead of stopping after the first match.
  - Verifies existing `.checked` status prior to dispatching synthetic click events, preventing accidental deselection.
  - Displays an informative real-time progress badge on the overlay (e.g., `⚡ Selected 2/2 on Page`).
- **🔍 Always-Accessible "Explain Step-by-Step" Button**:
  - Resolved an issue where the step-by-step derivation button could become hidden beneath long overflowing answer text.
  - Styled floating card with a clean, discrete 4px scrollbar track and thumb.
  - Backed up screenshot crop data to `sessionStorage` (`hs_last_crop`) so the derivation button remains fully functional across SPA page navigation and reloads.
  - Improved stealth mode button contrast and border indicators.

---

### 📦 How to Install Unpacked

1. Download `homework-solver-v1.2.0.zip` below and extract it.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the extracted folder.
5. Add your Groq API key in extension settings and press <kbd>Alt</kbd>+<kbd>C</kbd> to snip!
