const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("content.js", "utf8");
const personaCode = source.slice(source.indexOf("function getSubjectPersona"), source.indexOf("// ── Approach 1"));
const parserCode = source.slice(source.indexOf("function parseMultiFiles"), source.indexOf("function generateTerminalScript"));
const unwrapCode = source.slice(source.indexOf("function unwrapSingleFileAnswer"), source.indexOf("function generateTerminalScript"));

const context = {
  stripThinkTags: text => text,
  sanitizeCodeFormatting: text => text.trim()
};
vm.runInNewContext(personaCode + parserCode + unwrapCode, context);

const persona = context.getSubjectPersona("backend-dev");
assert(persona.includes("specified dependencies"), "backend persona must preserve the specified stack");
assert(persona.includes("authentication specified by the README"), "backend persona must allow requested JWT authentication");
assert(!persona.includes("ONE terminal command"), "backend persona must not demand a shell wrapper");

const shell = `#!/usr/bin/env bash
cat << 'EOF' > "app.js"
const sqlite3 = require('sqlite3').verbose();
module.exports = app;
EOF`;
assert.strictEqual(context.unwrapSingleFileAnswer(shell), "const sqlite3 = require('sqlite3').verbose();\nmodule.exports = app;");

const multi = `### FILE: app.js
\`\`\`javascript
module.exports = app;
\`\`\`
### FILE: routes.js
\`\`\`javascript
module.exports = router;
\`\`\``;
assert.strictEqual(context.unwrapSingleFileAnswer(multi), multi, "multi-file output retains its file view");
console.log("Backend answer format checks passed");
