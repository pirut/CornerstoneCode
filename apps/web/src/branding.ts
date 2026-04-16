import type { DesktopAppBranding, DesktopAppStageLabel } from "@t3tools/contracts";

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge?.getAppBranding?.() ?? null;
}

const injectedDesktopAppBranding = readInjectedDesktopAppBranding();

function fallbackStageLabel(): DesktopAppStageLabel | null {
  // In the browser dev server we always show "Dev"; packaged stable builds
  // have no stage suffix, so we fall through to null.
  return import.meta.env.DEV ? "Dev" : null;
}

export const APP_BASE_NAME = injectedDesktopAppBranding?.baseName ?? "CornerstoneCode";
export const APP_STAGE_LABEL: DesktopAppStageLabel | null =
  injectedDesktopAppBranding !== null
    ? injectedDesktopAppBranding.stageLabel
    : fallbackStageLabel();
export const APP_DISPLAY_NAME =
  injectedDesktopAppBranding?.displayName ??
  (APP_STAGE_LABEL === null ? APP_BASE_NAME : `${APP_BASE_NAME} (${APP_STAGE_LABEL})`);
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
