# 📚 Homework Solver — Chrome Extension (Manifest V3)

> High-speed question snipping, AI-powered reasoning, and automated answer overlay assistant for online assignments and quizzes.

---

## 🚀 Features

- **✂️ Quick Snipping Tool:** Press `Alt+C` to drag-and-crop any problem or question directly on your screen.
- **⚡ Two-Phase Streaming:** Streams model thinking (`<think>...`) and final answers live without waiting for full generation.
- **🤖 Multi-Provider AI Support:**
  - **Groq:** Ultra-fast free vision models (`qwen/qwen3.6-27b`).
  - **OpenAI:** GPT-4o-mini vision inference.
  - **Claude:** Claude 3 Haiku vision API.
- **🎯 Specialized Subject Personas:**
  - Quantitative Aptitude, Logical Reasoning & Math
  - Probability & Mathematical Statistics
  - Data Structures & Algorithms (DSA)
  - Backend Systems & APIs
  - AI For Finance & Quantitative Finance
  - Verbal Ability & Communication
- **🔘 Smart Answer Modes:**
  - **MCQ Mode:** Direct elimination of wrong options with the exact correct letter.
  - **Short Mode:** Two-line concise rationale and final answer.
  - **Detailed Mode:** Full step-by-step mathematical breakdown or pure functional code.
- **⚡ Page Auto-Select:** Option to automatically highlight and click the correct radio button / option on quiz portals.

---

## 🛠️ Installation

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select this directory (`homework-extension`).
4. Pin the extension to your toolbar, click its icon, and enter your API key (e.g. Groq free key).
5. Press `Alt+C` on any webpage to start snipping and solving!

---

## ⚙️ Configuration & Shortcuts

- Default snip shortcut: `Alt+C`
- To customize shortcuts, visit `chrome://extensions/shortcuts`
- Supports multiple keys separated by comma/newline for automatic round-robin rotation.
