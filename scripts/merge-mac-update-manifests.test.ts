import { assert, describe, it } from "@effect/vitest";

import {
  mergeMacUpdateManifests,
  parseMacUpdateManifest,
  serializeMacUpdateManifest,
} from "./merge-mac-update-manifests.ts";

describe("merge-mac-update-manifests", () => {
  it("merges arm64 and x64 macOS update manifests into one multi-arch manifest", () => {
    const arm64 = parseMacUpdateManifest(
      `version: 0.0.4
files:
  - url: T3-Code-0.0.4-arm64.zip
    sha512: arm64zip
    size: 125621344
    blockMapSize: 131072
  - url: T3-Code-0.0.4-arm64.dmg
    sha512: arm64dmg
    size: 131754935
path: T3-Code-0.0.4-arm64.zip
sha512: arm64zip
releaseDate: '2026-03-07T10:32:14.587Z'
`,
      "latest-mac.yml",
    );

    const x64 = parseMacUpdateManifest(
      `version: 0.0.4
files:
  - url: T3-Code-0.0.4-x64.zip
    sha512: x64zip
    size: 132000112
    blockMapSize: 140001
  - url: T3-Code-0.0.4-x64.dmg
    sha512: x64dmg
    size: 138148807
path: T3-Code-0.0.4-x64.zip
sha512: x64zip
releaseDate: '2026-03-07T10:36:07.540Z'
`,
      "latest-mac-x64.yml",
    );

    const merged = mergeMacUpdateManifests(arm64, x64);

    assert.equal(merged.version, "0.0.4");
    assert.equal(merged.releaseDate, "2026-03-07T10:36:07.540Z");
    assert.deepStrictEqual(
      merged.files.map((file) => file.url),
      [
        "T3-Code-0.0.4-arm64.zip",
        "T3-Code-0.0.4-arm64.dmg",
        "T3-Code-0.0.4-x64.zip",
        "T3-Code-0.0.4-x64.dmg",
      ],
    );
    assert.equal(merged.files[0]?.blockMapSize, 131072);
    assert.equal(merged.files[2]?.blockMapSize, 140001);
    assert.equal(merged.legacyPath, "T3-Code-0.0.4-arm64.zip");
    assert.equal(merged.legacySha512, "arm64zip");

    const serialized = serializeMacUpdateManifest(merged);
    assert.match(serialized, /^path: T3-Code-0\.0\.4-arm64\.zip$/m);
    assert.match(serialized, /^sha512: arm64zip$/m);
    assert.match(serialized, /^ {4}blockMapSize: 131072$/m);
    assert.match(serialized, /^ {4}blockMapSize: 140001$/m);
    assert.equal((serialized.match(/- url:/g) ?? []).length, 4);
  });

  it("round-trips realistic electron-builder latest-mac.yml output", () => {
    const source = `version: 0.0.20
files:
  - url: T3-Code-0.0.20-arm64-mac.zip
    sha512: aaaa
    size: 125000000
    blockMapSize: 131000
  - url: T3-Code-0.0.20-arm64.dmg
    sha512: bbbb
    size: 132000000
path: T3-Code-0.0.20-arm64-mac.zip
sha512: aaaa
releaseDate: '2026-04-15T10:36:07.540Z'
`;

    const manifest = parseMacUpdateManifest(source, "latest-mac.yml");
    const serialized = serializeMacUpdateManifest(manifest);

    // The serializer must preserve every signal that electron-updater relies
    // on: file entries with blockMapSize, plus the top-level path+sha512
    // pointers used by legacy macOS update paths.
    assert.match(serialized, /^version: 0\.0\.20$/m);
    assert.match(serialized, /^ {4}blockMapSize: 131000$/m);
    assert.match(serialized, /^path: T3-Code-0\.0\.20-arm64-mac\.zip$/m);
    assert.match(serialized, /^sha512: aaaa$/m);
  });

  it("rejects mismatched manifest versions", () => {
    const arm64 = parseMacUpdateManifest(
      `version: 0.0.4
files:
  - url: T3-Code-0.0.4-arm64.zip
    sha512: arm64zip
    size: 1
releaseDate: '2026-03-07T10:32:14.587Z'
`,
      "latest-mac.yml",
    );

    const x64 = parseMacUpdateManifest(
      `version: 0.0.5
files:
  - url: T3-Code-0.0.5-x64.zip
    sha512: x64zip
    size: 1
releaseDate: '2026-03-07T10:36:07.540Z'
`,
      "latest-mac-x64.yml",
    );

    assert.throws(() => mergeMacUpdateManifests(arm64, x64), /different versions/);
  });

  it("preserves quoted scalars as strings", () => {
    const manifest = parseMacUpdateManifest(
      `version: '1.0'
files:
  - url: T3-Code-1.0-x64.zip
    sha512: zipsha
    size: 1
releaseName: 'true'
minimumSystemVersion: '13.0'
stagingPercentage: 50
releaseDate: '2026-03-07T10:36:07.540Z'
`,
      "latest-mac.yml",
    );

    assert.equal(manifest.version, "1.0");
    assert.equal(manifest.extras.releaseName, "true");
    assert.equal(manifest.extras.minimumSystemVersion, "13.0");
    assert.equal(manifest.extras.stagingPercentage, 50);
  });
});
