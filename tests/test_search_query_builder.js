const assert = require("assert");

function buildUserPromptWithQuery(basePrompt, customQuery) {
  if (!customQuery || !customQuery.trim()) return basePrompt;
  return `User Specific Instruction / README Context: "${customQuery.trim()}"\n\nAnalyze the question in the image and fulfill the user's specific instruction/context completely:\n${basePrompt}`;
}

console.log("Running TDD tests for Search Query Builder...");

// 1. Without customQuery, returns basePrompt exactly
const p1 = buildUserPromptWithQuery("Solve the MCQ.", "");
assert.strictEqual(p1, "Solve the MCQ.", "Failed: empty query should return base");

// 2. With customQuery, bundles instruction
const p2 = buildUserPromptWithQuery("Solve the MCQ.", "Only solve subpart (b)");
assert(p2.includes("User Specific Instruction / README Context: \"Only solve subpart (b)\""));
assert(p2.includes("Solve the MCQ."));

// 3. With README context
const readme = "Use PostgreSQL and Prisma. Create endpoints POST /api/users";
const p3 = buildUserPromptWithQuery("Generate code.", readme);
assert(p3.includes("PostgreSQL and Prisma"));

console.log("✅ All Search Query Builder tests passed!");
