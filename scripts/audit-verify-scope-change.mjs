import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifestPath = "config/verify-scope.json";
const required = ["changeReason", "approvedBy", "approvedAt"];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const status = git(["status", "--porcelain", "--", manifestPath]);
const isUntracked = status.split(/\r?\n/).some((line) => line.startsWith("??"));

if (isUntracked) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`Verify scope change audit failed: new manifest is not valid JSON (${error.message})`);
    process.exit(1);
  }
  const missing = required.filter((field) => typeof manifest[field] !== "string" || !manifest[field].trim());
  if (missing.length) {
    console.error(`Verify scope change audit failed: new manifest is missing approval metadata: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("Verify scope change audit OK: new manifest includes approval metadata.");
  process.exit(0);
}

if (!status) {
  console.log("Verify scope change audit OK: manifest is unchanged.");
  process.exit(0);
}

const diff = git(["diff", "--unified=0", "HEAD", "--", manifestPath]);
const missing = required.filter((field) => !diff.includes(`+  \"${field}\"`));
if (missing.length) {
  console.error(`Verify scope change audit failed: approval metadata missing from manifest change: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("Verify scope change audit OK: manifest change includes approval metadata.");
