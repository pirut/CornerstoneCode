import { describe, expect, it, vi } from "vitest";

import { requiresExternalInstall, resolveMacCodeSignatureStatus } from "./codeSignatureStatus";

const APP_PATH = "/Applications/CornerstoneCode.app";

describe("resolveMacCodeSignatureStatus", () => {
  it("returns unknown on non-darwin platforms", () => {
    const status = resolveMacCodeSignatureStatus({
      appPath: APP_PATH,
      platform: "linux",
      isPackaged: true,
    });
    expect(status.kind).toBe("unknown");
  });

  it("returns unknown for unpackaged development builds", () => {
    const status = resolveMacCodeSignatureStatus({
      appPath: APP_PATH,
      platform: "darwin",
      isPackaged: false,
    });
    expect(status.kind).toBe("unknown");
  });

  it("detects Developer ID signed bundles and exposes the team identifier", () => {
    const execFile = vi
      .fn()
      .mockReturnValue(
        [
          "Executable=/Applications/CornerstoneCode.app/Contents/MacOS/CornerstoneCode",
          "Identifier=com.t3tools.t3code",
          "Format=app bundle with Mach-O thin (arm64)",
          "CodeDirectory v=20500 size=1 hashes=4 location=embedded",
          "Signature size=8971",
          "Authority=Developer ID Application: Anthropic PBC (ABCDE12345)",
          "Authority=Developer ID Certification Authority",
          "Authority=Apple Root CA",
          "TeamIdentifier=ABCDE12345",
          "Sealed Resources version=2 rules=13 files=1234",
        ].join("\n"),
      );
    const status = resolveMacCodeSignatureStatus({
      appPath: APP_PATH,
      platform: "darwin",
      isPackaged: true,
      execFile,
    });

    expect(status).toEqual({ kind: "signed", teamIdentifier: "ABCDE12345" });
    expect(execFile).toHaveBeenCalledWith("/usr/bin/codesign", ["-dv", "--verbose=2", APP_PATH], {
      encoding: "utf8",
      timeout: 3000,
    });
  });

  it("detects unsigned bundles when codesign throws with 'not signed at all'", () => {
    const error = Object.assign(new Error("codesign exited"), {
      stderr: "/Applications/CornerstoneCode.app: code object is not signed at all",
    });
    const execFile = vi.fn().mockImplementation(() => {
      throw error;
    });

    const status = resolveMacCodeSignatureStatus({
      appPath: APP_PATH,
      platform: "darwin",
      isPackaged: true,
      execFile,
    });
    expect(status.kind).toBe("unsigned");
  });

  it("reports ad-hoc signatures when TeamIdentifier is missing", () => {
    const execFile = vi
      .fn()
      .mockReturnValue(
        [
          "Executable=/Applications/CornerstoneCode.app/Contents/MacOS/CornerstoneCode",
          "Identifier=com.t3tools.t3code",
          "CodeDirectory v=20500 size=1 hashes=4 location=embedded",
          "Signature=adhoc",
          "TeamIdentifier=not set",
        ].join("\n"),
      );

    const status = resolveMacCodeSignatureStatus({
      appPath: APP_PATH,
      platform: "darwin",
      isPackaged: true,
      execFile,
    });
    expect(status.kind).toBe("adhoc");
  });

  it("requiresExternalInstall mirrors ad-hoc and unsigned states", () => {
    expect(requiresExternalInstall({ kind: "unsigned" })).toBe(true);
    expect(requiresExternalInstall({ kind: "adhoc" })).toBe(true);
    expect(requiresExternalInstall({ kind: "signed", teamIdentifier: "X" })).toBe(false);
    expect(requiresExternalInstall({ kind: "unknown" })).toBe(false);
  });
});
