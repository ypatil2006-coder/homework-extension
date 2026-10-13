// ── Homework Solver Release & Config Portability Engine ──────────

const GITHUB_REPO = "ypatil2006-coder/homework-extension";
const GITHUB_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const GITHUB_RAW_MANIFEST = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/manifest.json`;

// Semver comparison helper: returns 1 if vA > vB, -1 if vA < vB, 0 if equal
function compareSemver(vA, vB) {
  const parse = (v) => String(v || "").replace(/^[^\d]*/, "").split(/[.-]/).map(x => parseInt(x, 10) || 0);
  const a = parse(vA);
  const b = parse(vB);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const numA = a[i] || 0;
    const numB = b[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

// Fetch latest release information from GitHub (API with raw manifest fallback)
async function fetchLatestReleaseInfo() {
  const currentVersion = chrome.runtime.getManifest().version;
  let remoteVersion = null;
  let releaseData = null;

  try {
    const res = await fetch(GITHUB_RELEASE_API, {
      headers: { "Accept": "application/vnd.github.v3+json" }
    });
    if (res.ok) {
      const data = await res.json();
      remoteVersion = data.tag_name ? data.tag_name.replace(/^[^\d]*/, "") : null;
      releaseData = {
        version: remoteVersion,
        tagName: data.tag_name,
        name: data.name || `Version ${remoteVersion}`,
        htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
        zipUrl: (data.assets && data.assets[0]?.browser_download_url) || `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`,
        body: data.body || "",
        publishedAt: data.published_at || new Date().toISOString()
      };
    }
  } catch (e) {
    console.warn("[hs-updater] GitHub API fetch failed, trying raw manifest:", e);
  }

  // Fallback: check raw manifest.json directly if releases API was rate-limited
  if (!remoteVersion) {
    try {
      const res = await fetch(GITHUB_RAW_MANIFEST);
      if (res.ok) {
        const rawManifest = await res.json();
        remoteVersion = rawManifest.version;
        releaseData = {
          version: remoteVersion,
          tagName: `v${remoteVersion}`,
          name: `Homework Solver v${remoteVersion}`,
          htmlUrl: `https://github.com/${GITHUB_REPO}`,
          zipUrl: `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`,
          body: "New update available on GitHub repository.",
          publishedAt: new Date().toISOString()
        };
      }
    } catch (e) {
      console.warn("[hs-updater] Raw manifest fetch failed:", e);
    }
  }

  if (!remoteVersion) {
    throw new Error("Unable to check remote releases (network or GitHub rate limit).");
  }

  const hasUpdate = compareSemver(remoteVersion, currentVersion) > 0;
  return {
    hasUpdate,
    currentVersion,
    remoteVersion,
    release: releaseData
  };
}

// Check for updates with local caching (default 2 hours cache)
async function checkForExtensionUpdates({ force = false } = {}) {
  const CACHE_KEY = "hs_release_cache";
  const CACHE_MS = 2 * 60 * 60 * 1000; // 2 hours

  if (!force) {
    try {
      const stored = await chrome.storage.local.get([CACHE_KEY]);
      const cache = stored[CACHE_KEY];
      if (cache && (Date.now() - cache.checkedAt < CACHE_MS)) {
        const currentVersion = chrome.runtime.getManifest().version;
        const hasUpdate = compareSemver(cache.remoteVersion, currentVersion) > 0;
        return {
          hasUpdate,
          currentVersion,
          remoteVersion: cache.remoteVersion,
          release: cache.release,
          cached: true
        };
      }
    } catch (e) {}
  }

  const result = await fetchLatestReleaseInfo();
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        remoteVersion: result.remoteVersion,
        release: result.release,
        checkedAt: Date.now()
      },
      hs_update_available: result.hasUpdate ? result.release : null
    });

    // Update Chrome extension badge
    if (result.hasUpdate && chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: "NEW" });
      chrome.action.setBadgeBackgroundColor({ color: "#c84e1b" });
    } else if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {}

  return result;
}

// ── 1-Click Backup Export Helper ────────────────────────
// Serializes all API keys, custom models, reasoning approaches,
// theme customizations, optics, and shortcuts into a portable JSON file.
async function exportExtensionSettings() {
  const keysToExport = [
    "api", "keys", "models", "subject", "style", "autoSelect",
    "globalApproach", "subjectApproaches", "quickApproach",
    "snipCursor", "customCursorUrl",
    "snipThemeMode", "snipCustomTheme", "answerThemeMode", "answerCustomTheme", "splitAnswerTheme",
    "tabThemeMode", "tabCustomTheme", "themeMode", "customTheme", "themeScope",
    "snipDimming", "snipBorderThickness", "snipFillOpacity", "snipBorderStyle", "snipBorderGlow", "snipShowHint",
    "answerStealthMode", "answerBorderThickness", "answerBorderRadius", "answerWidth", "answerOpacity",
    "answerBlur", "answerFontSize", "answerBorderStyle", "answerDragBar", "answerAutoCopy",
    "answerCustomColorEnabled", "answerCustomBgColor", "answerCustomTextColor", "answerCustomBorderColor",
    "lastGood", "providerKeyIndices"
  ];

  const data = await chrome.storage.local.get(keysToExport);
  const manifest = chrome.runtime.getManifest();
  const exportPayload = {
    _app: "Homework Solver",
    _version: manifest.version,
    _exportedAt: new Date().toISOString(),
    ...data
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);

  // 1. Download file automatically if DOM document exists
  if (typeof document !== "undefined") {
    try {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `homework-solver-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (e) {
      console.warn("[hs-updater] File download failed:", e);
    }

    // 2. Copy to clipboard as backup
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonStr);
      }
    } catch (e) {}
  }

  return exportPayload;
}

// ── 1-Click Restore Helper ──────────────────────────────
async function restoreExtensionSettings(jsonContent) {
  if (!jsonContent) throw new Error("No backup content provided.");
  const data = typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;
  if (!data || typeof data !== "object") throw new Error("Invalid configuration format.");

  const sanitized = { ...data };
  delete sanitized._app;
  delete sanitized._version;
  delete sanitized._exportedAt;
  sanitized.api = "Groq";

  await chrome.storage.local.set(sanitized);
  return sanitized;
}

// ── 1-Click Full Update Flow ────────────────────────────
// Backs up configuration to .json file + clipboard, fetches latest GitHub release,
// and opens the release .zip download url.
async function performOneClickUpdateFlow() {
  const exportPayload = await exportExtensionSettings();
  let releaseInfo = null;
  try {
    releaseInfo = await checkForExtensionUpdates({ force: true });
  } catch (e) {
    console.warn("[hs-updater] Update check error during 1-click update:", e);
  }

  const downloadUrl = (releaseInfo && releaseInfo.release && releaseInfo.release.zipUrl)
    ? releaseInfo.release.zipUrl
    : `https://github.com/${GITHUB_REPO}/releases/latest`;

  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: downloadUrl });
  } else if (typeof window !== "undefined") {
    window.open(downloadUrl, "_blank");
  }

  return { exportPayload, releaseInfo, downloadUrl };
}
