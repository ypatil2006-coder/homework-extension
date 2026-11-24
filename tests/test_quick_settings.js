const assert = require("assert");

// Mock getSubjectPersona with dynamic options
function getSubjectPersona(sub, options = {}) {
  const aptitudePersona = "You are an Elite Quantitative Aptitude, Logical Reasoning & Mathematics Specialist.";

  let dsaPersona = "You are a Principal Algorithms Engineer & Competitive Programming Specialist. Rigorously analyze data structures (trees, graphs, heaps, hash maps, tries) and algorithmic techniques (DP, two pointers, sliding window, binary search, DFS/BFS).";
  if (options.dsaLanguage) {
    dsaPersona += `\nTARGET LANGUAGE: ${options.dsaLanguage}.`;
  }
  if (options.dsaOptimize) {
    dsaPersona += `\nOPTIMIZATION GOAL: ${options.dsaOptimize}.`;
  }
  if (options.dsaFormat) {
    dsaPersona += `\nCODE FORMAT: ${options.dsaFormat}.`;
  }

  const personas = {
    auto: "You are an Expert Academic Tutor & Multi-Disciplinary Problem Solver.",
    "aptitude-reasoning": aptitudePersona,
    "logical-reasoning": aptitudePersona,
    "prob-stats": "You are a Senior Probability & Mathematical Statistics Specialist.",
    "ai-finance": "You are a Senior Quantitative Finance & AI for Finance Specialist.",
    "dsa": dsaPersona,
    "backend-dev": "You are a Principal Backend Systems Engineer. The user may provide an image of their project file tree along with a README context. STRICT FILE PROTOCOL: When multiple files are required, output production-ready code for every file using the standard delimiter: '### FILE: <relative/path/to/file>' followed by a triple-backtick code fence. Retrieve all database schemas, models, and dependencies directly from the user's README context.",
    "communication": "You are an Expert in Linguistic Analysis, English Grammar, and Verbal Ability."
  };

  return personas[sub || "auto"] || personas["auto"];
}

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
assert(backend.includes("STRICT FILE PROTOCOL"), "Failed: backend missing file protocol");
assert(backend.includes("### FILE: <relative/path/to/file>"), "Failed: backend missing ### FILE: delimiter");
assert(backend.includes("Retrieve all database schemas, models, and dependencies directly from the user's README context"), "Failed: backend missing README retrieval rule");

// 4. Fallback for unknown subject
const fallback = getSubjectPersona("unknown_subject_xyz");
assert.strictEqual(fallback, getSubjectPersona("auto"), "Failed: unknown subject should fallback to auto");

console.log("✅ All Quick Settings & Dynamic Subject Persona tests passed!");
