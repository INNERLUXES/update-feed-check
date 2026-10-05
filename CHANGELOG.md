# Changes

## 1.0.0

First release.

- Checks the auto-update feeds of a desktop app from the files on disk before a release goes out: electron-updater
  feeds (latest.yml, latest-mac.yml, latest-linux.yml and the files of other channels), Sparkle appcasts, Tauri updater
  JSON and Squirrel.Windows RELEASES files, named one by one or as folders read at their top, each kind known from its
  name or given with `--kind`. Fetches nothing, follows no symbolic link and reads no date of a feed.
- Small readers of its own with no dependency: a YAML reader of the subset electron-updater feeds use, an XML reader
  that refuses every DOCTYPE and every entity other than the five of XML, a strict JSON reader, and the lines of
  RELEASES; each refuses what it does not read, with its place.
- Sixteen rules in three levels: downloads with no checksum (`missing-hash`) or signature (`missing-signature`),
  entries with no download (`missing-url`), addresses that are not https (`insecure-url`), downloads on more than one
  host (`mixed-hosts`), versions that are not valid (`invalid-version`), appcast items out of order (`item-order`),
  versions offered twice (`duplicate-version`), versions that do not go up from `--previous`
  (`version-not-increased`), files that are not in the `--dist` folder (`dist-file-missing`) or whose size
  (`size-mismatch`) or checksum (`hash-mismatch`) differs, platforms a release must cover (`missing-platform`), staged
  and phased rollouts that are not valid (`invalid-rollout`), electron-updater feeds of one channel with different
  versions (`mixed-versions`) and missing release notes (`missing-release-notes`); and two rules of input problems that
  cannot be lowered (`unreadable-feed`, `scan-limit`).
- A configuration file in strict JSON over documented defaults: the level of every rule, the Tauri targets and
  electron-updater feed files a release must cover, the minimum severity and the level that fails the run; a key the
  tool does not know is an error with its line and a suggestion, and a key named twice is refused.
- Reports as text, JSON, CSV with one row per finding (`--format csv`) and GitHub workflow commands (`--format github`)
  that show each finding as an annotation; every finding has its file, line and column; `--min-severity`, `--fail-on`,
  `--explain` with the rule, the sources and the tool's own choice, and `--print-defaults`. Exit code `0` when no
  finding is at or above the fail-on level, `1` when one is, `2` for a usage or input error, with no result.
- Reads no clock, connects to nothing, runs nothing it reads, writes nothing to disk, reports binary input and input
  past its limits as errors, hashes built files in blocks, neutralizes formulas in the CSV report, and has a size limit
  on every input.
- A check before the release, not a signature verification and not a certification: every report says so.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
