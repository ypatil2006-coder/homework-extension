const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function section(file, start, end, context) {
  const source = fs.readFileSync(file, "utf8");
  const code = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  assert(code, `Missing section in ${file}`);
  vm.runInNewContext(code, context);
}

async function run() {
  let stored = { keys: { Groq: "my-key" }, configVersion: 2 };
  const background = {
    chrome: { storage: { local: {
      get: (_keys, callback) => callback(stored),
      set: (value) => { stored = { ...stored, ...value }; }
    } } }
  };
  background.DEFAULT_GROQ_KEYS = "bundled-1,bundled-2";
  section("background.js", "function initDefaultKeys()", "chrome.runtime.onInstalled", background);
  background.initDefaultKeys();
  assert.strictEqual(stored.keys.Groq, "my-key", "startup must preserve user keys");

  const input = {
    tagName: "INPUT", type: "radio", checked: false,
    labels: [{ textContent: "B) Correct" }],
    scrollIntoView() { throw new Error("cannot scroll"); },
    click() { this.checked = true; },
    getAttribute() { return null; }
  };
  const content = {
    document: { querySelectorAll: (selector) => selector.startsWith("input") ? [input] : [] },
    Event: function () {}
  };
  section("content.js", "function extractOptionTargets", "// ── Answer overlay", content);
  assert.deepStrictEqual(Array.from(content.extractOptionTargets("Options B and C"), x => x.letter), ["B", "C"]);
  const selected = content.selectOptionOnPage("Option B");
  assert.strictEqual(selected.success, false, "a failed click is not a selection");
  const duplicate = { ...input, checked: false, scrollIntoView() {}, click() { this.checked = true; } };
  input.scrollIntoView = () => {};
  content.document.querySelectorAll = selector => selector.startsWith("input") ? [input, duplicate] : [];
  const ambiguous = content.selectOptionOnPage("Option B");
  assert.strictEqual(ambiguous.success, false, "repeated option labels must not select another question");
  assert.strictEqual(input.checked, false);
  assert.strictEqual(duplicate.checked, false);

  const updater = { chrome: { storage: { local: {
    get: async (keys) => Object.fromEntries(Object.entries({ dsaLanguage: "Rust", hsOverlayPos: { x: 10, y: 20 } }).filter(([key]) => keys.includes(key)))
  } }, runtime: { getManifest: () => ({ version: "1.6.2" }) } } };
  section("updater.js", "async function exportExtensionSettings", "// ── 1-Click Restore", updater);
  const backup = await updater.exportExtensionSettings();
  assert.strictEqual(backup.dsaLanguage, "Rust", "DSA preference must be backed up");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(backup.hsOverlayPos)), { x: 10, y: 20 });

  const links = [];
  const clipboardContext = {
    chrome: updater.chrome,
    document: {
      body: { appendChild() {}, removeChild() {} },
      createElement: () => ({ click() { links.push("download"); } })
    },
    navigator: { clipboard: { writeText: async () => {} } },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    Blob, setTimeout: () => 0
  };
  section("updater.js", "async function exportExtensionSettings", "// ── 1-Click Restore", clipboardContext);
  await clipboardContext.exportExtensionSettings({ download: false });
  assert.strictEqual(links.length, 0, "copy-only export must not download a file");
  clipboardContext.navigator.clipboard = undefined;
  await assert.rejects(clipboardContext.exportExtensionSettings({ download: false }), /Clipboard/);

  const releaseContext = {
    chrome: { runtime: { getManifest: () => ({ version: "1.6.2" }) } },
    fetch: async () => ({ ok: true, json: async () => ({
      tag_name: "v1.6.3", assets: [
        { browser_download_url: "https://example.test/checksum.txt" },
        { browser_download_url: "https://example.test/release.zip" }
      ]
    }) }), console
  };
  section("updater.js", "const GITHUB_REPO", "// Check for updates with local caching", releaseContext);
  const release = await releaseContext.fetchLatestReleaseInfo();
  assert.strictEqual(release.release.zipUrl, "https://example.test/release.zip");

  let rotation = {};
  const rotationContext = { chrome: { storage: { local: {
    get: async () => { await new Promise(resolve => setTimeout(resolve, 0)); return { providerKeyIndices: { ...rotation } }; },
    set: async value => { rotation = value.providerKeyIndices; }
  } } }, Promise };
  section("background.js", "let keyIndexQueue", "chrome.commands.onCommand", rotationContext);
  const allocated = await Promise.all([
    rotationContext.reserveGroqKeyIndex(2), rotationContext.reserveGroqKeyIndex(2)
  ]);
  assert.deepStrictEqual(Array.from(allocated), [0, 1], "concurrent tabs must get different rotation keys");

  let captureCalls = 0;
  let messageListener;
  const captureContext = { chrome: {
    runtime: { onMessage: { addListener(listener) { messageListener = listener; } }, lastError: { message: "capture blocked" } },
    tabs: { captureVisibleTab(_windowId, _options, callback) { captureCalls++; callback(null); } }
  } };
  section("background.js", "chrome.runtime.onMessage.addListener", "// ── Stream AI calls", captureContext);
  let captureResponse;
  messageListener({ action: "captureScreen" }, { tab: { windowId: 4 } }, response => { captureResponse = response; });
  assert.strictEqual(captureCalls, 1, "failed capture must not switch windows");
  assert.strictEqual(captureResponse.dataUrl, null);

  let starAttempts = 0;
  const starContext = {
    window: { location: { hostname: "github.com", pathname: "/ypatil2006-coder/homework-extension", hash: "#star" } },
    chrome: { storage: { local: { get: (_keys, callback) => callback({ pendingStarIntent: false }), remove() {} } } },
    runGitHubStarAction() { starAttempts++; }, Date, console
  };
  section("content.js", "function initGitHubAutoStarFlow", "function runGitHubStarAction", starContext);
  starContext.initGitHubAutoStarFlow();
  assert.strictEqual(starAttempts, 0, "a URL fragment alone must not initiate a star");

  let testKeysClick;
  let requestModel;
  const keyTestButton = { addEventListener(_event, handler) { testKeysClick = handler; } };
  const fields = {
    testKeysBtn: keyTestButton,
    apiKey: { value: "test-key" },
    modelInput: { value: "custom-vision-model" },
    keyTestResults: { style: {}, innerHTML: "" }
  };
  const optionsContext = {
    document: { getElementById: id => fields[id] },
    fetch: async (_url, options) => {
      if (options?.method === "POST") {
        requestModel = JSON.parse(options.body).model;
        return { ok: true };
      }
      return { ok: true, json: async () => ({ data: [{ id: "custom-vision-model" }] }) };
    }
  };
  section("options.js", "// Test Groq API Keys", "// Shortcuts link", optionsContext);
  await testKeysClick();
  assert.strictEqual(requestModel, "custom-vision-model", "key test must use the configured model");
  console.log("Audit regression checks passed");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
