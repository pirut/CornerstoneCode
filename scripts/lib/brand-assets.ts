export const BRAND_ASSET_PATHS = {
  productionMacIconPng: "assets/prod/cornerstone-macos-1024.png",
  productionLinuxIconPng: "assets/prod/cornerstone-universal-1024.png",
  productionWindowsIconIco: "assets/prod/cornerstone-windows.ico",
  productionWebFaviconIco: "assets/prod/cornerstone-web-favicon.ico",
  productionWebFavicon16Png: "assets/prod/cornerstone-web-favicon-16x16.png",
  productionWebFavicon32Png: "assets/prod/cornerstone-web-favicon-32x32.png",
  productionWebAppleTouchIconPng: "assets/prod/cornerstone-web-apple-touch-180.png",

  nightlyMacIconPng: "assets/nightly/cornerstone-macos-1024.png",
  nightlyLinuxIconPng: "assets/nightly/cornerstone-universal-1024.png",
  nightlyWindowsIconIco: "assets/nightly/cornerstone-windows.ico",

  developmentDesktopIconPng: "assets/dev/cornerstone-macos-1024.png",
  developmentWindowsIconIco: "assets/dev/cornerstone-windows.ico",
  developmentWebFaviconIco: "assets/dev/cornerstone-web-favicon.ico",
  developmentWebFavicon16Png: "assets/dev/cornerstone-web-favicon-16x16.png",
  developmentWebFavicon32Png: "assets/dev/cornerstone-web-favicon-32x32.png",
  developmentWebAppleTouchIconPng: "assets/dev/cornerstone-web-apple-touch-180.png",
} as const;

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

export const DEVELOPMENT_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
];

export const PUBLISH_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
];
