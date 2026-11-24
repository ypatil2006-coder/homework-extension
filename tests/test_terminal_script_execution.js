const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const source = fs.readFileSync("content.js", "utf8");
const context = {};
vm.runInNewContext(source.slice(source.indexOf("function generateTerminalScript"), source.indexOf("function getCleanAnswerOnly")), context);
const generateTerminalScript = context.generateTerminalScript;
const project = fs.mkdtempSync(path.join(os.tmpdir(), "hs-command-test-"));

try {
  const files = [
    { path: "src/app.js", code: "const marker = 'first';\nEOF\nconst last = true;" },
    { path: "src/it's $(touch pwn).js", code: "const text = '$HOME and `date`';" },
    { path: "src/delimiter.txt", code: "HS_FILE_2\nfollow-up" }
  ];
  const script = generateTerminalScript(files);
  const run = spawnSync("bash", ["-c", script], { cwd: project, encoding: "utf8", timeout: 5000 });
  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual(fs.readFileSync(path.join(project, files[0].path), "utf8"), files[0].code + "\n");
  assert.strictEqual(fs.readFileSync(path.join(project, files[1].path), "utf8"), files[1].code + "\n");
  assert.strictEqual(fs.readFileSync(path.join(project, files[2].path), "utf8"), files[2].code + "\n");
  assert(!fs.existsSync(path.join(project, "pwn")), "filename must not execute command substitutions");

  const gitInit = spawnSync("git", ["init", "-q"], { cwd: project, encoding: "utf8" });
  assert.strictEqual(gitInit.status, 0, gitInit.stderr);
  const nestedProject = path.join(project, "workspace");
  fs.mkdirSync(nestedProject);
  const nestedScript = generateTerminalScript([{ path: "app.js", code: "module.exports = app;" }]);
  const nestedRun = spawnSync("bash", ["-c", nestedScript], { cwd: nestedProject, encoding: "utf8", timeout: 5000 });
  assert.strictEqual(nestedRun.status, 0, nestedRun.stderr);
  assert(fs.existsSync(path.join(nestedProject, "app.js")), "writes must stay in the current project directory");
  assert(!fs.existsSync(path.join(project, "app.js")), "must not jump to a parent Git repository");

  assert.throws(() => generateTerminalScript([{ path: "../outside.js", code: "bad" }]), /Invalid project path/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "hs-command-outside-"));
  try {
    fs.symlinkSync(outside, path.join(project, "linked"));
    const linkedScript = generateTerminalScript([{ path: "linked/file.js", code: "bad" }]);
    const linkedRun = spawnSync("bash", ["-c", linkedScript], { cwd: project, encoding: "utf8", timeout: 5000 });
    assert.notStrictEqual(linkedRun.status, 0, "must reject a directory symlink outside the project");
    assert(!fs.existsSync(path.join(outside, "file.js")));
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
  console.log("Terminal script execution checks passed");
} finally {
  fs.rmSync(project, { recursive: true, force: true });
}
