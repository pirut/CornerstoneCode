import type { DesktopAppBranding, DesktopAppStageLabel } from "@t3tools/contracts";

import { isNightlyDesktopVersion } from "./updateChannels";

const APP_BASE_NAME = "CornerstoneCode";

export function resolveDesktopAppStageLabel(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppStageLabel | null {
  if (input.isDevelopment) {
    return "Dev";
  }

  return isNightlyDesktopVersion(input.appVersion) ? "Nightly" : null;
}

export function resolveDesktopAppBranding(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppBranding {
  const stageLabel = resolveDesktopAppStageLabel(input);
  return {
    baseName: APP_BASE_NAME,
    stageLabel,
    displayName: stageLabel === null ? APP_BASE_NAME : `${APP_BASE_NAME} (${stageLabel})`,
  };
}
