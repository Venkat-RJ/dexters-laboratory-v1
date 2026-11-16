// Called by setup.sh inside the pinned Node/pnpm environment.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain, projectRoot, run } from "./lib/util.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function prepareCheckout(root, pin) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(pin.repository)
    || !/^[a-f0-9]{40}$/.test(pin.revision)) {
    throw new Error("Invalid Synara repository or revision in scripts/synara-runtime.json.");
  }
  if (existsSync(root)) {
    if (!existsSync(join(root, ".git"))) throw new Error(`${root} already exists but is not a Git checkout. Move it aside before retrying.`);
    if (git(root, ["remote", "get-url", "origin"]) !== pin.repository) throw new Error(`Refusing to change a checkout from another repository: ${root}`);
    if (git(root, ["status", "--porcelain"])) throw new Error(`Synara has local changes at ${root}. Preserve or revert them before retrying.`);
    let head;
    try { head = git(root, ["rev-parse", "--verify", "HEAD"]); } catch { /* Retry an interrupted initial fetch. */ }
    if (head === pin.revision) return;
    if (head) throw new Error(`Synara at ${root} is not at the required revision. Move it aside to let setup create a fresh pinned checkout.`);
  } else {
    mkdirSync(root, { recursive: true });
    run("git", ["init", "--quiet", root]);
    run("git", ["remote", "add", "origin", pin.repository], { cwd: root });
  }
  run("git", ["fetch", "--depth", "1", "origin", pin.revision], { cwd: root });
  run("git", ["checkout", "--detach", "FETCH_HEAD"], { cwd: root });
  if (git(root, ["rev-parse", "HEAD"]) !== pin.revision) throw new Error("Synara revision verification failed.");
}

function setup() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg !== "--no-run")) throw new Error("Use ./scripts/setup.sh [--no-run].");
  const pin = JSON.parse(readFileSync(join(projectRoot, "scripts/synara-runtime.json"), "utf8"));
  const source = join(projectRoot, ".synara-src");
  // Never silently pick up a private sibling checkout or private font download.
  const env = { ...process.env, SYNARA_SOURCE_DIR: source, LATTICE_PRIVATE_FONTS_DIR: "", LATTICE_PRIVATE_FONTS_REQUIRED: "0" };
  console.log("Installing Dexter dependencies from the lockfile...");
  run("pnpm", ["install", "--frozen-lockfile"], { cwd: projectRoot, env });
  console.log("Preparing the pinned public Synara source...");
  prepareCheckout(source, pin);
  env.BUN_BIN = join(projectRoot, "node_modules/.bin/bun");
  console.log("Installing Synara dependencies from its lockfile...");
  run(env.BUN_BIN, ["install", "--frozen-lockfile"], { cwd: source, env });
  console.log("Building and checking the agent and document runtimes...");
  run("pnpm", ["prepare:runtime"], { cwd: projectRoot, env });
  if (args.includes("--no-run")) {
    console.log("Setup complete. Run ./scripts/setup.sh to build and open the desktop app.");
    return;
  }
  console.log("Building the local desktop app. This first build can take several minutes...");
  run("pnpm", ["tauri", "build", "--debug", "--bundles", "app"], { cwd: projectRoot, env });
  const config = JSON.parse(readFileSync(join(projectRoot, "src-tauri/tauri.conf.json"), "utf8"));
  const target = resolve(projectRoot, "src-tauri", env.CARGO_TARGET_DIR || "target");
  const app = join(target, "debug/bundle/macos", `${config.productName}.app`);
  if (!existsSync(app)) throw new Error(`The build did not produce the expected local app: ${app}`);
  run("open", [app]);
  console.log(`Opened ${app}\nYou can reopen this app directly. This is a local development build, not a notarized release.`);
}

if (isMain(import.meta.url)) {
  try { setup(); } catch (error) {
    console.error(`Setup stopped: ${error.message}\nFix the reported problem and rerun ./scripts/setup.sh. Existing research is not deleted.`);
    process.exitCode = 1;
  }
}
