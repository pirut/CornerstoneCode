#!/usr/bin/env node
// One-command fork deploy.
//
// Bumps `apps/desktop/package.json` → commits → tags → pushes.
// The fork's Release (fork) GitHub Actions workflow picks up the tag and
// builds/publishes platform artifacts to the fork's Releases tab. The
// installed desktop app's auto-updater polls that Releases tab and
// pulls the new version automatically.
//
// Usage:
//   bun release:fork                    # patch bump (0.0.18 → 0.0.19)
//   bun release:fork patch              # same as above
//   bun release:fork minor              # 0.0.18 → 0.1.0
//   bun release:fork major              # 0.0.18 → 1.0.0
//   bun release:fork 1.2.3              # explicit version
//   bun release:fork --dry-run          # print what would happen, don't push
//
// Optional flags:
//   --branch <name>  Push to a different branch (default: main)
//   --remote <name>  Push to a different remote (default: origin)
//   --skip-pull      Don't run `git pull` before bumping
//
// After the push, the workflow URL is printed. Watch the build there; when
// it completes, your fork's Releases tab has the new DMG / AppImage / exe,
// and any installed desktop app will pick it up on the next auto-update check.

import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

interface ParsedArgs {
  readonly bump: "patch" | "minor" | "major" | string;
  readonly dryRun: boolean;
  readonly branch: string;
  readonly remote: string;
  readonly skipPull: boolean;
}

function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  let bump: string = "patch";
  let dryRun = false;
  let branch = "main";
  let remote = "origin";
  let skipPull = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--skip-pull":
        skipPull = true;
        break;
      case "--branch":
        branch = requireNext(argv, i++, "--branch");
        break;
      case "--remote":
        remote = requireNext(argv, i++, "--remote");
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith("--")) {
          fail(`Unknown flag: ${arg}`);
        }
        bump = arg;
    }
  }

  return { bump, dryRun, branch, remote, skipPull };
}

function requireNext(argv: ReadonlyArray<string>, i: number, flag: string): string {
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) fail(`${flag} requires a value`);
  return next;
}

function printHelp(): void {
  console.log(`Usage: bun release:fork [patch|minor|major|x.y.z] [flags]

Flags:
  --dry-run        Print what would happen, don't commit/push
  --branch <name>  Branch to push (default: main)
  --remote <name>  Remote to push to (default: origin)
  --skip-pull      Skip 'git pull' before bumping
  -h, --help       Show this help`);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(command: string, options: { cwd?: string } = {}): string {
  return execSync(command, { cwd: options.cwd ?? repoRoot, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

function runVisible(command: string): void {
  console.log(`$ ${command}`);
  execSync(command, { cwd: repoRoot, stdio: "inherit" });
}

function bumpVersion(current: string, bump: string): string {
  if (/^\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.-]+)?$/.test(bump)) {
    return bump;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(current);
  if (!match) fail(`cannot parse current version: ${current}`);
  const [, majorStr, minorStr, patchStr] = match;
  const major = Number(majorStr);
  const minor = Number(minorStr);
  const patch = Number(patchStr);
  switch (bump) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
    default:
      fail(`unknown bump kind: ${bump} (expected patch|minor|major|x.y.z)`);
  }
}

async function main(): Promise<void> {
  const { bump, dryRun, branch, remote, skipPull } = parseArgs(process.argv.slice(2));

  // ---------- preflight ----------
  const status = run("git status --porcelain");
  if (status.length > 0) {
    console.error("git working tree is not clean. Commit or stash first.");
    console.error(status);
    process.exit(1);
  }

  const currentBranch = run("git rev-parse --abbrev-ref HEAD");
  if (currentBranch !== branch) {
    fail(`expected to be on branch '${branch}', currently on '${currentBranch}'`);
  }

  const remotes = run("git remote").split(/\s+/).filter(Boolean);
  if (!remotes.includes(remote)) {
    fail(`remote '${remote}' not configured. git remote add ${remote} <url>`);
  }

  if (!skipPull) {
    runVisible(`git fetch ${remote} ${branch}`);
    runVisible(`git pull --ff-only ${remote} ${branch}`);
  }

  // ---------- version resolve ----------
  const desktopPkgPath = resolve(repoRoot, "apps/desktop/package.json");
  const desktopPkgRaw = await readFile(desktopPkgPath, "utf8");
  const desktopPkg = JSON.parse(desktopPkgRaw) as { readonly version: string };
  const currentVersion = desktopPkg.version;
  const nextVersion = bumpVersion(currentVersion, bump);

  if (nextVersion === currentVersion) {
    fail(`version unchanged (${currentVersion}). Supply a different version.`);
  }

  const tag = `v${nextVersion}`;

  // Guard against re-tagging an existing version.
  try {
    run(`git rev-parse ${tag}`);
    fail(`tag ${tag} already exists locally. Delete with: git tag -d ${tag}`);
  } catch {
    // Not found → good, continue.
  }
  const remoteTags = run(`git ls-remote --tags ${remote}`);
  if (remoteTags.includes(`refs/tags/${tag}`)) {
    fail(`tag ${tag} already exists on ${remote}. Pick a different version.`);
  }

  console.log(`\nCornerstoneCode release (fork)`);
  console.log(`  current:  ${currentVersion}`);
  console.log(`  next:     ${nextVersion}`);
  console.log(`  tag:      ${tag}`);
  console.log(`  branch:   ${branch}`);
  console.log(`  remote:   ${remote}`);
  console.log(`  dry-run:  ${dryRun}`);
  console.log();

  // ---------- version bump ----------
  if (dryRun) {
    console.log("[dry-run] would update apps/desktop/package.json version");
  } else {
    const updated = desktopPkgRaw.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
    await writeFile(desktopPkgPath, updated);
    console.log(`✓ bumped ${relpath(desktopPkgPath)} to ${nextVersion}`);
  }

  // ---------- refresh lockfile (no-op if unchanged) ----------
  if (dryRun) {
    console.log("[dry-run] would refresh bun.lock (bun install --lockfile-only)");
  } else {
    runVisible("bun install --lockfile-only");
  }

  // ---------- commit + tag + push ----------
  if (dryRun) {
    console.log(`[dry-run] would: git add apps/desktop/package.json bun.lock`);
    console.log(`[dry-run] would: git commit -m "chore(release): prepare ${tag}"`);
    console.log(`[dry-run] would: git tag -a ${tag} -m "CornerstoneCode ${tag}"`);
    console.log(`[dry-run] would: git push ${remote} ${branch}`);
    console.log(`[dry-run] would: git push ${remote} ${tag}`);
    return;
  }

  // Commit only if there are actual changes — lockfile may be unchanged.
  const pendingChanges = run("git status --porcelain");
  if (pendingChanges.length > 0) {
    runVisible("git add apps/desktop/package.json bun.lock");
    runVisible(`git commit -m "chore(release): prepare ${tag}"`);
  } else {
    console.log("(no file changes to commit — version in git already matches)");
  }

  runVisible(`git tag -a ${tag} -m "CornerstoneCode ${tag}"`);
  runVisible(`git push ${remote} ${branch}`);
  runVisible(`git push ${remote} ${tag}`);

  // ---------- summary ----------
  const remoteUrl = run(`git remote get-url ${remote}`);
  const repoSlug = parseRepoSlug(remoteUrl);

  console.log();
  console.log(`✓ pushed ${tag} to ${remote}/${branch}`);
  if (repoSlug) {
    console.log(`  Actions:  https://github.com/${repoSlug}/actions`);
    console.log(`  Releases: https://github.com/${repoSlug}/releases`);
  }
  console.log();
  console.log(`The Release (fork) workflow will build macOS / Linux / Windows`);
  console.log(`artifacts and publish them to the Releases tab. Installed`);
  console.log(`desktop apps auto-update from there on the next check.`);
}

function parseRepoSlug(url: string): string | undefined {
  // git@github.com:owner/repo.git | https://github.com/owner/repo.git
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  if (!m) return undefined;
  return `${m[1]}/${m[2]}`;
}

function relpath(absolute: string): string {
  return absolute.replace(repoRoot + "/", "");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
