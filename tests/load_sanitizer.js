const fs = require("fs");
const path = require("path");

const contentJs = fs.readFileSync(path.join(__dirname, "../content.js"), "utf8");

function extractFn(name) {
  const re = new RegExp(`function\\s+${name}\\b[\\s\\S]*?\\n\\}`);
  const match = contentJs.match(re);
  return match ? match[0] : "";
}

const codeToEval = `
function stripThinkTags(t) { return (t || "").replace(/<think>[\\s\\S]*?<\\/think>/gi, "").trim(); }
${extractFn("extractPureCode")}
${extractFn("sanitizeCodeFormatting")}
module.exports = { sanitizeCodeFormatting };
`;

eval(codeToEval);
