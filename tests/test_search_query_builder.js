const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("content.js", "utf8");
const context = {};
vm.runInNewContext(source.slice(source.indexOf("function buildUserPromptWithQuery"), source.indexOf("function getSubjectPersona")), context);
const buildUserPromptWithQuery = context.buildUserPromptWithQuery;

console.log("Running TDD tests for Search Query Builder...");

// 1. Without customQuery, returns basePrompt exactly
const p1 = buildUserPromptWithQuery("Solve the MCQ.", "");
assert.strictEqual(p1, "Solve the MCQ.", "Failed: empty query should return base");

// 2. With customQuery, bundles instruction
const p2 = buildUserPromptWithQuery("Solve the MCQ.", "Only solve subpart (b)");
assert(p2.includes("User Specific Instruction / README Context: \"Only solve subpart (b)\""));
assert(p2.includes("Solve the MCQ."));

// 3. With README context
const readme = "Use CommonJS. POST /login/ must return a JWT token. Protect GET /states/ and GET /states/:stateId/stats/.";
const p3 = buildUserPromptWithQuery("Generate code.", readme);
assert(p3.includes("POST /login/ must return a JWT token"));
assert(p3.includes("GET /states/:stateId/stats/"));

console.log("✅ All Search Query Builder tests passed!");
