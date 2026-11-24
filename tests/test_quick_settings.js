const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("content.js", "utf8");
const context = {};
vm.runInNewContext(source.slice(source.indexOf("function getSubjectPersona"), source.indexOf("// ── Approach 1")), context);
const getSubjectPersona = context.getSubjectPersona;

console.log("Running TDD tests for Quick Settings & Dynamic Subject Personas...");

// 1. Default DSA persona without options
const dsaDefault = getSubjectPersona("dsa");
assert(dsaDefault.includes("Principal Algorithms Engineer"), "Failed: default DSA persona missing");
assert(!dsaDefault.includes("TARGET LANGUAGE:"), "Failed: should not have target language without options");

// 2. Dynamic DSA with language, optimization, format
const dsaCustom = getSubjectPersona("dsa", {
  dsaLanguage: "C++",
  dsaOptimize: "Optimal Time & Space",
  dsaFormat: "Function Solution"
});
assert(dsaCustom.includes("TARGET LANGUAGE: C++."), "Failed: missing TARGET LANGUAGE");
assert(dsaCustom.includes("OPTIMIZATION GOAL: Optimal Time & Space."), "Failed: missing OPTIMIZATION GOAL");
assert(dsaCustom.includes("CODE FORMAT: Function Solution."), "Failed: missing CODE FORMAT");

// 3. Backend Dev Persona contains dynamic README contract
const backend = getSubjectPersona("backend-dev");
assert(backend.includes("specified dependencies"), "Failed: backend must preserve requested dependencies");
assert(backend.includes("### FILE: <relative/path/to/file>"), "Failed: backend missing ### FILE: delimiter");
assert(backend.includes("For one requested file"), "Failed: backend must return one file as source code");

// 4. Fallback for unknown subject
const fallback = getSubjectPersona("unknown_subject_xyz");
assert.strictEqual(fallback, getSubjectPersona("auto"), "Failed: unknown subject should fallback to auto");

console.log("✅ All Quick Settings & Dynamic Subject Persona tests passed!");
