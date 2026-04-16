import { execFileSync } from "node:child_process";

export type MacCodeSignatureStatus =
  | { readonly kind: "signed"; readonly teamIdentifier: string | null }
  | { readonly kind: "unsigned" }
  | { readonly kind: "adhoc" }
  | { readonly kind: "unknown" };

export interface ResolveMacCodeSignatureStatusOptions {
  readonly appPath: string;
  readonly platform?: NodeJS.Platform;
  readonly isPackaged?: boolean;
  readonly execFile?: (
    file: string,
    args: ReadonlyArray<string>,
    options: { encoding: "utf8"; timeout: number },
  ) => string;
}

/**
 * Determine the macOS code-signature status of the running .app bundle.
 *
 * electron-updater uses Apple's Squirrel.Mac framework to install updates on
 * macOS. Squirrel.Mac refuses to install an update when the current app does
 * not have a valid Developer ID signature, so before asking the user to wait
 * for a download we need to know whether `quitAndInstall` can actually succeed.
 */
export function resolveMacCodeSignatureStatus(
  options: ResolveMacCodeSignatureStatusOptions,
): MacCodeSignatureStatus {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") {
    return { kind: "unknown" };
  }

  // Development builds run out of `node_modules/electron` and are never signed
  // in a way that matches a Developer ID, so treat them as unknown and leave
  // the default (packaged) auto-update path untouched.
  if (options.isPackaged === false) {
    return { kind: "unknown" };
  }

  const execFile =
    options.execFile ??
    ((file: string, args: ReadonlyArray<string>, opts: { encoding: "utf8"; timeout: number }) =>
      execFileSync(file, [...args], opts));

  let raw: string;
  try {
    raw = execFile("/usr/bin/codesign", ["-dv", "--verbose=2", options.appPath], {
      encoding: "utf8",
      timeout: 3000,
    });
  } catch (error) {
    const stderr = extractCombinedOutput(error);
    if (stderr && /code object is not signed at all/i.test(stderr)) {
      return { kind: "unsigned" };
    }
    return { kind: "unknown" };
  }

  // `codesign -dv` writes to stderr on success, but some callers merge both
  // streams — inspect the combined text.
  if (/code object is not signed at all/i.test(raw)) {
    return { kind: "unsigned" };
  }

  const authorityMatch = raw.match(/^Authority=(.+)$/m);
  const teamMatch = raw.match(/^TeamIdentifier=(.+)$/m);
  const teamIdentifier = teamMatch?.[1]?.trim() ?? null;

  if (!authorityMatch || !teamIdentifier || teamIdentifier === "not set") {
    return { kind: "adhoc" };
  }

  return { kind: "signed", teamIdentifier };
}

function extractCombinedOutput(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const withStderr = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const stderr = typeof withStderr.stderr === "string" ? withStderr.stderr : "";
  const stdout = typeof withStderr.stdout === "string" ? withStderr.stdout : "";
  const message = typeof withStderr.message === "string" ? withStderr.message : "";
  return `${message}\n${stdout}\n${stderr}`;
}

/**
 * Returns true when the macOS code-signature status indicates that
 * `autoUpdater.quitAndInstall()` is expected to fail.
 *
 * Squirrel.Mac rejects installs when the app is unsigned or ad-hoc signed
 * because the new download would not verify against the current bundle's
 * Developer ID. On those builds we should download the update through the
 * browser instead of through the updater.
 */
export function requiresExternalInstall(status: MacCodeSignatureStatus): boolean {
  return status.kind === "unsigned" || status.kind === "adhoc";
}
