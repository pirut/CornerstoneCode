import { describe, expect, it } from "vitest";

import { resolveDesktopAppBranding, resolveDesktopAppStageLabel } from "./appBranding";

describe("resolveDesktopAppStageLabel", () => {
  it("uses Dev in desktop development", () => {
    expect(
      resolveDesktopAppStageLabel({
        isDevelopment: true,
        appVersion: "0.0.17-nightly.20260414.1",
      }),
    ).toBe("Dev");
  });

  it("uses Nightly for packaged nightly builds", () => {
    expect(
      resolveDesktopAppStageLabel({
        isDevelopment: false,
        appVersion: "0.0.17-nightly.20260414.1",
      }),
    ).toBe("Nightly");
  });

  it("returns null stage for packaged stable builds", () => {
    expect(
      resolveDesktopAppStageLabel({
        isDevelopment: false,
        appVersion: "0.0.17",
      }),
    ).toBeNull();
  });
});

describe("resolveDesktopAppBranding", () => {
  it("returns a complete desktop branding payload for nightly", () => {
    expect(
      resolveDesktopAppBranding({
        isDevelopment: false,
        appVersion: "0.0.17-nightly.20260414.1",
      }),
    ).toEqual({
      baseName: "CornerstoneCode",
      stageLabel: "Nightly",
      displayName: "CornerstoneCode (Nightly)",
    });
  });

  it("omits the stage suffix from displayName for stable builds", () => {
    expect(
      resolveDesktopAppBranding({
        isDevelopment: false,
        appVersion: "0.0.17",
      }),
    ).toEqual({
      baseName: "CornerstoneCode",
      stageLabel: null,
      displayName: "CornerstoneCode",
    });
  });
});
