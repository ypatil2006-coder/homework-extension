const assert = require("assert");
const fs = require("fs");
const path = require("path");

const contentJs = fs.readFileSync(path.join(__dirname, "../content.js"), "utf8");

function extractFunctionBody(code, fnName) {
  const startIdx = code.indexOf(`function ${fnName}(`);
  if (startIdx === -1) return "";
  let openIdx = code.indexOf("{", startIdx);
  if (openIdx === -1) return "";
  let depth = 1;
  let i = openIdx + 1;
  while (i < code.length && depth > 0) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
    i++;
  }
  return code.slice(startIdx, i);
}

const sandbox = `(function() {
  function stripThinkTags(t) { return (t || "").replace(/<think>[\\s\\S]*?<\\/think>/gi, "").trim(); }
  ${extractFunctionBody(contentJs, "extractPureCode")}
  ${extractFunctionBody(contentJs, "sanitizeCodeFormatting")}
  ${extractFunctionBody(contentJs, "parseMultiFiles")}
  ${extractFunctionBody(contentJs, "generateTerminalScript")}
  return { parseMultiFiles, generateTerminalScript };
})()`;

const { parseMultiFiles, generateTerminalScript } = eval(sandbox);

console.log("Running TDD tests for Multi-File Backend Parser & Terminal Generator...");

const sampleBackendOutput = `
Here is the complete backend architecture based on your README:

### FILE: src/config/db.js
\`\`\`javascript
const { Pool } = require('pg');
const pool = new Pool();
module.exports = pool;
\`\`\`

### FILE: src/routes/user.routes.js
\`\`\`javascript
const express = require('express');
const router = express.Router();
router.post('/login', (req, res) => res.json({ ok: true }));
module.exports = router;
\`\`\`

### FILE: src/models/user.model.js
\`\`\`javascript
class User {
    static findById(id) {
        return { id, name: "Alice" };
    }
}
module.exports = User;
\`\`\`
`;

// 1. parseMultiFiles
const files = parseMultiFiles(sampleBackendOutput);
assert.strictEqual(files.length, 3, "Expected 3 parsed files");
assert.strictEqual(files[0].path, "src/config/db.js");
assert(files[0].code.includes("const { Pool } = require('pg');"));
assert.strictEqual(files[1].path, "src/routes/user.routes.js");
assert.strictEqual(files[2].path, "src/models/user.model.js");
assert(files[2].code.startsWith("class User {"));

// 2. generateTerminalScript
const script = generateTerminalScript(files);
assert(script.includes("src/config/db.js"));
assert(script.includes("src/routes/user.routes.js"));
assert(script.includes("src/models/user.model.js"));
assert(script.includes("Successfully created and updated all 3 project files") || script.includes("Successfully"));
assert(script.includes("Run from the project directory"), "Expected the script to state where it writes files");

// 3. Fallback on non-multi-file input
const nonMulti = "def add(a, b):\n    return a + b";
assert.strictEqual(parseMultiFiles(nonMulti).length, 0, "Non-multifile input should return empty array");

// 4. Test parsing raw bash cat << 'EOF' > path blocks
const rawBashOutput = `
\`\`\`bash
mkdir -p src/controllers
cat << 'EOF' > "src/controllers/auth.controller.js"
export const login = (req, res) => res.json({ token: "123" });
EOF
cat << 'EOF' > "src/middleware/auth.js"
export const checkAuth = (req, res, next) => next();
EOF
\`\`\`
`;
const bashParsed = parseMultiFiles(rawBashOutput);
assert.strictEqual(bashParsed.length, 2, "Expected 2 parsed files from bash cat blocks");
assert.strictEqual(bashParsed[0].path, "src/controllers/auth.controller.js");
assert(bashParsed[0].code.includes("login = (req, res)"));
assert.strictEqual(bashParsed[1].path, "src/middleware/auth.js");
assert(bashParsed[1].code.includes("checkAuth"));

console.log("✅ All Multi-File parser & generator tests passed!");
