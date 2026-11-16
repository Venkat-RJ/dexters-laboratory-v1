import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareCheckout } from "./setup-source.mjs";

const repository = "https://github.com/example/synara.git";
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "dexter setup test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ["init", "--quiet"]);
  git(root, ["remote", "add", "origin", repository]);
  writeFileSync(join(root, "source.txt"), "original\n");
  git(root, ["add", "source.txt"]);
  git(root, ["-c", "user.name=Setup Test", "-c", "user.email=setup@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  return { root, pin: { repository, revision: git(root, ["rev-parse", "HEAD"]) } };
}

test("repeated setup reuses the exact clean pinned checkout without a network fetch", (t) => {
  const { root, pin } = fixture(t);
  prepareCheckout(root, pin);
  prepareCheckout(root, pin);
  assert.equal(git(root, ["rev-parse", "HEAD"]), pin.revision);
  assert.equal(git(root, ["status", "--porcelain"]), "");
});

test("local edits and untracked files survive a refused setup", (t) => {
  const { root, pin } = fixture(t);
  writeFileSync(join(root, "source.txt"), "my changes\n");
  writeFileSync(join(root, "notes.txt"), "keep this\n");
  assert.throws(() => prepareCheckout(root, pin), /local changes/);
  assert.equal(readFileSync(join(root, "source.txt"), "utf8"), "my changes\n");
  assert.equal(readFileSync(join(root, "notes.txt"), "utf8"), "keep this\n");
});

test("a different repository is never replaced", (t) => {
  const { root, pin } = fixture(t);
  git(root, ["remote", "set-url", "origin", "https://github.com/example/other.git"]);
  assert.throws(() => prepareCheckout(root, pin), /another repository/);
  assert.equal(git(root, ["remote", "get-url", "origin"]), "https://github.com/example/other.git");
});

test("a different checked-out revision is never reset", (t) => {
  const { root, pin } = fixture(t);
  assert.throws(() => prepareCheckout(root, { ...pin, revision: "a".repeat(40) }), /not at the required revision/);
  assert.equal(git(root, ["rev-parse", "HEAD"]), pin.revision);
});

test("an existing non-Git folder is preserved", (t) => {
  const { root, pin } = fixture(t);
  const folder = join(root, "existing");
  mkdirSync(folder);
  writeFileSync(join(folder, "keep.txt"), "keep");
  assert.throws(() => prepareCheckout(folder, pin), /not a Git checkout/);
  assert.equal(readFileSync(join(folder, "keep.txt"), "utf8"), "keep");
});

test("invalid pins fail before touching the checkout", (t) => {
  const { root, pin } = fixture(t);
  assert.throws(() => prepareCheckout(root, { ...pin, revision: "main" }), /Invalid Synara/);
  assert.throws(() => prepareCheckout(root, { ...pin, repository: "https://user:secret@example.invalid/repo" }), /Invalid Synara/);
  assert.equal(git(root, ["status", "--porcelain"]), "");
});
