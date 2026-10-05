# Inputs

## The feeds

```
update-feed-check <feed or folder>... [--kind <kind>] [--dist <folder>] [--previous <feed or folder>] [--config <file>]
```

Name one or more feed files or folders of feeds, up to 100. A folder is read at its top only; a folder inside it, a
symbolic link and a file of no known kind are counted and passed over. A file named on the command line is read even
when its folder holds other feeds; a path named twice stops the run.

| Kind | `--kind` | Known from the name |
| --- | --- | --- |
| electron-updater | `electron` | `.yml` and `.yaml`, but not builder-debug.yml, builder-effective-config.yaml, app-update.yml or dev-app-update.yml |
| Sparkle | `sparkle` | `.xml` and `.rss` |
| Tauri | `tauri` | `.json` |
| Squirrel.Windows | `squirrel` | `RELEASES`, in any case |

With `--kind`, every file named is read as that kind and a folder gives only its files of that kind. A file whose kind
its name does not tell, named with no `--kind`, stops the run with exit code `2`.

The feeds of one folder, or the files named that sit in one folder, are one release: `mixed-versions` compares their
electron-updater feeds, and `missing-platform` looks for the electron-updater feed files of a folder that was named.

## The dist folder

`--dist <folder>` names the folder of built files: the installers, archives and packages the feeds offer. It is read
at its top only. For each feed, the downloads of its newest version are looked for by the last part of their address,
and their size and checksum are compared with the feed: the `sha512` of electron-updater as base64, the SHA1 of
Squirrel.Windows as hexadecimal, the `length` of an appcast enclosure. Sparkle and Tauri feeds carry signatures, not
checksums, so their files are only looked for (and the length of an appcast is compared). A file is read in blocks and
never whole, up to 4 GB.

Without `--dist`, no file is compared and the report says so.

## The previous feeds

`--previous <feed or folder>` names the feeds published before, read the same way as the input. Each feed of the input
is compared with the previous feed of the same name, compared without regard to case, or, when the input and the
previous feeds each hold one feed of a kind, with that one. A previous feed that cannot be read stops the run with exit
code `2`, because a comparison with it would mean nothing. Only the versions of the previous feeds are used; their
other problems are not reported.

## The configuration file

The configuration is one JSON object, read by a strict reader of RFC 8259 (no comments, no trailing comma, no name
given twice). Every key is optional; without `--config` the defaults apply, and `--print-defaults` writes them out. A key
the tool does not know is an error with its line and a suggestion, and stops the run with exit code `2`.

```json
{
  "name": "Quillmere release review",
  "requiredPlatforms": {
    "tauri": ["windows-x86_64", "darwin-x86_64", "darwin-aarch64", "linux-x86_64"],
    "electron": ["latest.yml", "latest-mac.yml", "latest-linux.yml"]
  },
  "rules": { "missingReleaseNotes": "warning", "mixedHosts": "error" },
  "minSeverity": "info",
  "failOn": "error"
}
```

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown in the report | none |
| `rules` | an object of rule keys to `info`, `warning`, `error` or `off` | below |
| `requiredPlatforms` | an object with the two lists below | below |
| `requiredPlatforms.tauri` | up to 50 Tauri targets OS-ARCH that every Tauri feed must have, OS `linux`, `darwin` or `windows`, ARCH `x86_64`, `aarch64`, `i686` or `armv7` | `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64` |
| `requiredPlatforms.electron` | up to 50 names of electron-updater feed files that a folder of feeds must hold when it holds one | `latest.yml`, `latest-mac.yml`, `latest-linux.yml` |
| `minSeverity` | the lowest level shown: `info`, `warning` or `error` | `info` |
| `failOn` | the lowest level that fails the run | `error` |

A list of `requiredPlatforms` replaces its default as a whole, and an empty list turns that check off. A target or a
name given twice is kept once. `--min-severity` and `--fail-on` on the command line win over the configuration.

## The keys of rules

| Key | Rule | Default |
| --- | --- | --- |
| `rules.missingHash` | `missing-hash` | error |
| `rules.missingSignature` | `missing-signature` | error |
| `rules.missingUrl` | `missing-url` | error |
| `rules.insecureUrl` | `insecure-url` | error |
| `rules.mixedHosts` | `mixed-hosts` | warning |
| `rules.invalidVersion` | `invalid-version` | error |
| `rules.itemOrder` | `item-order` | error |
| `rules.duplicateVersion` | `duplicate-version` | error |
| `rules.versionNotIncreased` | `version-not-increased` | error |
| `rules.distFileMissing` | `dist-file-missing` | error |
| `rules.sizeMismatch` | `size-mismatch` | error |
| `rules.hashMismatch` | `hash-mismatch` | error |
| `rules.missingPlatform` | `missing-platform` | warning |
| `rules.invalidRollout` | `invalid-rollout` | error |
| `rules.mixedVersions` | `mixed-versions` | warning |
| `rules.missingReleaseNotes` | `missing-release-notes` | info |

`unreadable-feed` and `scan-limit` have no key: they are always errors. Setting a rule to `off` leaves it out of the
findings and the counts, and a note names it.
