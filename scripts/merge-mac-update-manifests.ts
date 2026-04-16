import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface MacUpdateFile {
  readonly url: string;
  readonly sha512: string;
  readonly size: number;
  readonly blockMapSize?: number;
  readonly isAdminRightsRequired?: boolean;
}

type MacUpdateScalar = string | number | boolean;

interface MacUpdateManifest {
  readonly version: string;
  readonly releaseDate: string;
  readonly files: ReadonlyArray<MacUpdateFile>;
  readonly extras: Readonly<Record<string, MacUpdateScalar>>;
  /** Legacy top-level `path:` — electron-updater < 6.x falls back to this when arch-matching fails. */
  readonly legacyPath: string | null;
  /** Legacy top-level `sha512:` matching `legacyPath`. */
  readonly legacySha512: string | null;
}

interface MutableMacUpdateFile {
  url?: string;
  sha512?: string;
  size?: number;
  blockMapSize?: number;
  isAdminRightsRequired?: boolean;
}

function stripSingleQuotes(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseFileRecord(
  currentFile: MutableMacUpdateFile | null,
  sourcePath: string,
  lineNumber: number,
): MacUpdateFile | null {
  if (currentFile === null) {
    return null;
  }
  if (
    typeof currentFile.url !== "string" ||
    typeof currentFile.sha512 !== "string" ||
    typeof currentFile.size !== "number"
  ) {
    throw new Error(
      `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: incomplete file entry.`,
    );
  }
  const record: MacUpdateFile = {
    url: currentFile.url,
    sha512: currentFile.sha512,
    size: currentFile.size,
    ...(currentFile.blockMapSize !== undefined ? { blockMapSize: currentFile.blockMapSize } : {}),
    ...(currentFile.isAdminRightsRequired !== undefined
      ? { isAdminRightsRequired: currentFile.isAdminRightsRequired }
      : {}),
  };
  return record;
}

function parseScalarValue(rawValue: string): MacUpdateScalar {
  const trimmed = rawValue.trim();
  const isQuoted = trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  const value = isQuoted ? trimmed.slice(1, -1).replace(/''/g, "'") : trimmed;
  if (isQuoted) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

const FILE_INDENTED_SCALAR_PATTERN = /^ {4}([A-Za-z][A-Za-z0-9]*):\s*(.+)$/;

function assignFileField(
  currentFile: MutableMacUpdateFile,
  key: string,
  rawValue: string,
  sourcePath: string,
  lineNumber: number,
): void {
  const value = parseScalarValue(rawValue);
  switch (key) {
    case "sha512":
      if (typeof value !== "string") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: sha512 must be a string.`,
        );
      }
      currentFile.sha512 = value;
      return;
    case "size":
      if (typeof value !== "number") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: size must be a number.`,
        );
      }
      currentFile.size = value;
      return;
    case "blockMapSize":
      if (typeof value !== "number") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: blockMapSize must be a number.`,
        );
      }
      currentFile.blockMapSize = value;
      return;
    case "isAdminRightsRequired":
      if (typeof value !== "boolean") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: isAdminRightsRequired must be a boolean.`,
        );
      }
      currentFile.isAdminRightsRequired = value;
      return;
    default:
      // Unknown indented fields inside a file entry are preserved as a no-op
      // so the parser keeps working as electron-builder adds new metadata.
      return;
  }
}

export function parseMacUpdateManifest(raw: string, sourcePath: string): MacUpdateManifest {
  const lines = raw.split(/\r?\n/);
  const files: MacUpdateFile[] = [];
  const extras: Record<string, MacUpdateScalar> = {};
  let version: string | null = null;
  let releaseDate: string | null = null;
  let legacyPath: string | null = null;
  let legacySha512: string | null = null;
  let inFiles = false;
  let currentFile: MutableMacUpdateFile | null = null;

  const flushCurrentFile = (lineNumber: number): void => {
    const finalized = parseFileRecord(currentFile, sourcePath, lineNumber);
    if (finalized) files.push(finalized);
    currentFile = null;
  };

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;

    const fileUrlMatch = line.match(/^ {2}- url:\s*(.+)$/);
    if (fileUrlMatch?.[1]) {
      flushCurrentFile(lineNumber);
      currentFile = { url: stripSingleQuotes(fileUrlMatch[1].trim()) };
      inFiles = true;
      continue;
    }

    const indentedMatch = line.match(FILE_INDENTED_SCALAR_PATTERN);
    if (indentedMatch?.[1] && indentedMatch[2] !== undefined) {
      if (currentFile === null) {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: '${indentedMatch[1]}' without a file entry.`,
        );
      }
      assignFileField(currentFile, indentedMatch[1], indentedMatch[2], sourcePath, lineNumber);
      continue;
    }

    if (line === "files:") {
      inFiles = true;
      continue;
    }

    if (inFiles && currentFile !== null) {
      flushCurrentFile(lineNumber);
    }
    inFiles = false;

    const topLevelMatch = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
    if (!topLevelMatch?.[1] || topLevelMatch[2] === undefined) {
      throw new Error(
        `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: unsupported line '${line}'.`,
      );
    }

    const [, key, rawValue] = topLevelMatch;
    const value = parseScalarValue(rawValue);

    if (key === "version") {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: version must be a string.`,
        );
      }
      version = value;
      continue;
    }

    if (key === "releaseDate") {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: releaseDate must be a string.`,
        );
      }
      releaseDate = value;
      continue;
    }

    if (key === "path") {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: path must be a string.`,
        );
      }
      legacyPath = value;
      continue;
    }

    if (key === "sha512") {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid macOS update manifest at ${sourcePath}:${lineNumber}: sha512 must be a string.`,
        );
      }
      legacySha512 = value;
      continue;
    }

    extras[key] = value;
  }

  flushCurrentFile(lines.length);

  if (!version) {
    throw new Error(`Invalid macOS update manifest at ${sourcePath}: missing version.`);
  }
  if (!releaseDate) {
    throw new Error(`Invalid macOS update manifest at ${sourcePath}: missing releaseDate.`);
  }
  if (files.length === 0) {
    throw new Error(`Invalid macOS update manifest at ${sourcePath}: missing files.`);
  }

  return {
    version,
    releaseDate,
    files,
    extras,
    legacyPath,
    legacySha512,
  };
}

function mergeExtras(
  primary: Readonly<Record<string, MacUpdateScalar>>,
  secondary: Readonly<Record<string, MacUpdateScalar>>,
): Record<string, MacUpdateScalar> {
  const merged: Record<string, MacUpdateScalar> = { ...primary };

  for (const [key, value] of Object.entries(secondary)) {
    const existing = merged[key];
    if (existing !== undefined && existing !== value) {
      throw new Error(
        `Cannot merge macOS update manifests: conflicting '${key}' values ('${existing}' vs '${value}').`,
      );
    }
    merged[key] = value;
  }

  return merged;
}

export function mergeMacUpdateManifests(
  primary: MacUpdateManifest,
  secondary: MacUpdateManifest,
): MacUpdateManifest {
  if (primary.version !== secondary.version) {
    throw new Error(
      `Cannot merge macOS update manifests with different versions (${primary.version} vs ${secondary.version}).`,
    );
  }

  const filesByUrl = new Map<string, MacUpdateFile>();
  for (const file of [...primary.files, ...secondary.files]) {
    const existing = filesByUrl.get(file.url);
    if (existing && (existing.sha512 !== file.sha512 || existing.size !== file.size)) {
      throw new Error(
        `Cannot merge macOS update manifests: conflicting file entry for ${file.url}.`,
      );
    }
    filesByUrl.set(file.url, file);
  }

  return {
    version: primary.version,
    releaseDate:
      primary.releaseDate >= secondary.releaseDate ? primary.releaseDate : secondary.releaseDate,
    files: [...filesByUrl.values()],
    extras: mergeExtras(primary.extras, secondary.extras),
    // Keep the primary manifest's legacy pointers. electron-updater prefers
    // `files[]` over `path:` so the legacy pointer only matters on older
    // fallback code paths; we just need *a* matching arch to be present.
    legacyPath: primary.legacyPath ?? secondary.legacyPath,
    legacySha512: primary.legacySha512 ?? secondary.legacySha512,
  };
}

function quoteYamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function serializeScalarValue(value: MacUpdateScalar): string {
  if (typeof value === "string") {
    return quoteYamlString(value);
  }
  return String(value);
}

export function serializeMacUpdateManifest(manifest: MacUpdateManifest): string {
  const lines = [`version: ${manifest.version}`, "files:"];

  for (const file of manifest.files) {
    lines.push(`  - url: ${file.url}`);
    lines.push(`    sha512: ${file.sha512}`);
    lines.push(`    size: ${file.size}`);
    if (file.blockMapSize !== undefined) {
      lines.push(`    blockMapSize: ${file.blockMapSize}`);
    }
    if (file.isAdminRightsRequired !== undefined) {
      lines.push(`    isAdminRightsRequired: ${file.isAdminRightsRequired}`);
    }
  }

  if (manifest.legacyPath) {
    lines.push(`path: ${manifest.legacyPath}`);
  }
  if (manifest.legacySha512) {
    lines.push(`sha512: ${manifest.legacySha512}`);
  }

  for (const key of Object.keys(manifest.extras).toSorted()) {
    const value = manifest.extras[key];
    if (value === undefined) {
      throw new Error(`Cannot serialize macOS update manifest: missing value for '${key}'.`);
    }
    lines.push(`${key}: ${serializeScalarValue(value)}`);
  }

  lines.push(`releaseDate: ${quoteYamlString(manifest.releaseDate)}`);
  lines.push("");
  return lines.join("\n");
}

function main(args: ReadonlyArray<string>): void {
  const [arm64PathArg, x64PathArg, outputPathArg] = args;
  if (!arm64PathArg || !x64PathArg) {
    throw new Error(
      "Usage: node scripts/merge-mac-update-manifests.ts <latest-mac.yml> <latest-mac-x64.yml> [output-path]",
    );
  }

  const arm64Path = resolve(arm64PathArg);
  const x64Path = resolve(x64PathArg);
  const outputPath = resolve(outputPathArg ?? arm64PathArg);

  const arm64Manifest = parseMacUpdateManifest(readFileSync(arm64Path, "utf8"), arm64Path);
  const x64Manifest = parseMacUpdateManifest(readFileSync(x64Path, "utf8"), x64Path);
  const merged = mergeMacUpdateManifests(arm64Manifest, x64Manifest);
  writeFileSync(outputPath, serializeMacUpdateManifest(merged));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
