const assert = require("assert");

// Load sanitizeCodeFormatting from content.js or module
// We will test the implementation
const { sanitizeCodeFormatting } = require("./load_sanitizer.js");

console.log("Running TDD tests for sanitizeCodeFormatting...");

// 1. Basic markdown fence stripping & dedent
const sample1 = "```python\n    def add(a, b):\n        return a + b\n```";
const result1 = sanitizeCodeFormatting(sample1);
assert.strictEqual(result1, "def add(a, b):\n    return a + b", "Failed: basic dedent and fence strip");

// 2. Tab expansion to 4 spaces
const sample2 = "def loop():\n\tfor i in range(10):\n\t\tprint(i)";
const result2 = sanitizeCodeFormatting(sample2);
assert.strictEqual(result2, "def loop():\n    for i in range(10):\n        print(i)", "Failed: tab expansion");

// 3. Mixed indentation with leading 8 spaces and trailing spaces
const sample3 = "        class Solution:\n            def solve(self):\n                x = 10   \n                return x\n";
const result3 = sanitizeCodeFormatting(sample3);
assert.strictEqual(result3, "class Solution:\n    def solve(self):\n        x = 10\n        return x", "Failed: deep dedent and trailing space strip");

// 4. Windows \r\n flattening
const sample4 = "def foo():\r\n    return 42\r\n";
const result4 = sanitizeCodeFormatting(sample4);
assert.strictEqual(result4, "def foo():\n    return 42", "Failed: CRLF normalization");

console.log("✅ All sanitizeCodeFormatting tests passed!");
