# update-feed-check

Desktop app update feed check, run before a release goes out. Give it the auto-update feeds of a release, as files or
as the folder that holds them: electron-updater feeds (latest.yml, latest-mac.yml, latest-linux.yml), Sparkle
appcasts, Tauri updater JSON and Squirrel.Windows RELEASES files. It reads them from disk, downloads nothing, and lists
what makes an update fail or reach the wrong users: downloads with no checksum or signature, addresses that are not
https, downloads spread over more than one host, versions that are not valid, appcast items out of order, versions
offered twice, platforms the release does not cover, staged and phased rollouts that are not valid, missing release
notes and feeds of one channel that offer different versions. With the folder of built files it checks that every
download is there with the size and checksum the feed gives; with the feeds already published it checks that every
version goes up. Every finding has its file, line and column and what to change, and the run exits with a code a
pipeline can act on.

**It is a check before the release, not a signature verification and not a certification.** It reads the files on
disk and fetches none of the addresses they hold; it checks that a signature is there and has the right form, not that
the right key made it, and a clean run means only that none of the problems of its rules were found.

electron-builder writes latest.yml, latest-mac.yml and latest-linux.yml with a SHA-512 checksum for each download, which
electron-updater checks before it installs anything (https://www.electron.build/docs/features/auto-update). Sparkle
signs each update with EdDSA and asks that updates be served over HTTPS (https://sparkle-project.org/documentation/),
and Tauri needs a signature and a url for each OS-ARCH platform and enforces TLS in production
(https://v2.tauri.app/plugin/updater/). A feed that disagrees with the files beside it breaks the update for every user
at once, and a version that does not go up strands them on the old one. This tool reads the feeds and the built files
for those problems, on every release, before anything is uploaded.

- **One check per problem.** Sixteen rules, each with what it looks at, what it cannot see, the public pages it rests
  on and what to change, and two rules of input problems that are always errors.
- **Against the real files.** With `--dist`, the sha512 of electron-updater and the SHA1 of Squirrel.Windows are worked
  out from the built files with node:crypto, in blocks, and compared with the feed, with the sizes.
- **Safe readers of its own.** Small readers of YAML, XML and JSON with no dependency; the XML reader refuses every
  DOCTYPE and every declared entity, so no appcast can make it read a file or expand without end.
- **No dates.** The dates of the feeds are never read and the clock never is; the same files always give the same
  report.
- Reports as text, JSON, CSV with one row per finding and GitHub workflow annotations, with an exit code for a
  pipeline: `0` no finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 135
pass 133
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link, a device or file permissions (links in a folder to a file and to a folder, a folder named through a
link, `/dev/zero` named as a feed, and a feed with no read access); they are guarded with `process.platform`, run on
Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time
limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/update-feed-check.git
cd update-feed-check
node bin/update-feed-check.js examples/messy/release --dist examples/messy/dist --previous examples/messy/previous --config examples/config.json
```

Or without a clone, on your own release folder:

```
npx --yes github:INNERLUXES/update-feed-check dist --dist dist --previous published-feeds
```

`examples/` holds two made-up release folders. `examples/messy/` is a company with three apps whose release went wrong:
the electron-updater feeds of its notes app have a checksum that no longer matches the signed installer, a size that is
not the size of the file, a staged rollout of 120 percent and a Linux feed left at the version that is already online,
with no checksum; the appcast of its Mac app lists an older item first, serves it over http, puts the newest on another
host with a phased rollout and no pubDate, and keeps an item with only a DSA signature; the Tauri feed of its sync app
has an empty signature, no platform for Apple silicon, a download that is not in the dist folder, and a version lower
than the one published. It also holds what must not be reported: files that match, signed enclosures, the namespace of
the appcast and the dates of the feeds. `examples/clean/` is a company with four apps, one of each kind, in good order.

## Usage

```
update-feed-check <feed or folder>... [--kind <kind>] [--dist <folder>] [--previous <feed or folder>] [--config <file>] [options]
```

```
--kind <kind>             read every feed named as this kind: electron, sparkle, tauri, squirrel (default: from the
                          name of each file); in a folder, only files of this kind are read
--dist <folder>           the folder of built files; the downloads of the newest version must be in it, with the
                          size and checksum the feed gives
--previous <feed|folder>  the feeds published before; the version of each feed must be higher than the one there
--config <file>           settings in strict JSON: rules, requiredPlatforms, minSeverity and failOn
                          (--print-defaults shows them)
--format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                          workflow commands that GitHub shows as annotations
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: minSeverity of
                          the configuration, else info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: failOn of
                          the configuration, else error)
--explain                 show the rule, the public sources and the tool's own choice behind each finding
--print-defaults          print the built-in configuration and exit
--help                    show the usage
--version                 show the version
```

Name up to 100 feeds and folders. The paths in the report are relative to the folder you run the command in, with
forward slashes on every system, followed by the line.

The report of the messy example starts with what was read, the dist folder, the previous feeds, the configuration, the
rules and the findings in one line each; then every feed with its kind, newest version, entries and counts; then the
count of findings of every rule; then the findings, errors first, each with what to change:

```
update-feed-check: examples/messy/release
input: 1 folder and 0 files named; 5 feeds: 3 electron-updater, 1 Sparkle, 1 Tauri; 0 other files passed over; 0 folders inside passed over; 0 links not followed
dist: examples/messy/dist, 7 files
previous: examples/messy/previous, 4 feeds
config: examples/config.json (Quillmere release review): Tauri platforms windows-x86_64, darwin-x86_64, darwin-aarch64 and linux-x86_64; electron-updater feeds latest.yml, latest-mac.yml and latest-linux.yml; minimum severity info; fail on error
rules: missing-hash (error); missing-signature (error); missing-url (error); insecure-url (error); mixed-hosts (warning); invalid-version (error); item-order (error); duplicate-version (error); version-not-increased (error); dist-file-missing (error); size-mismatch (error); hash-mismatch (error); missing-platform (warning); invalid-rollout (error); mixed-versions (warning); missing-release-notes (warning); unreadable-feed (error); scan-limit (error)
findings: 17 (12 error, 5 warning)

Feeds (5)

  feed                                        kind              version      entries  error  warning  info
  examples/messy/release/appcast.xml          Sparkle           4.2.0 (420)  3        4      2        0
  examples/messy/release/latest-linux.yml     electron-updater  3.1.4        1        2      2        0
  examples/messy/release/latest-mac.yml       electron-updater  3.2.0        2        1      0        0
  examples/messy/release/latest.yml           electron-updater  3.2.0        1        2      0        0
  examples/messy/release/quillmere-sync.json  Tauri             1.4.0        3        3      1        0

Rules (18)

  rule                   level    findings
  missing-hash           error    1
  missing-signature      error    2
  missing-url            error    0
  insecure-url           error    1
  mixed-hosts            warning  1
  invalid-version        error    0
  item-order             error    1
  duplicate-version      error    0
  version-not-increased  error    2
  dist-file-missing      error    1
  size-mismatch          error    1
  hash-mismatch          error    1
  missing-platform       warning  1
  invalid-rollout        error    2
  mixed-versions         warning  1
  missing-release-notes  warning  2
  unreadable-feed        error    0
  scan-limit             error    0

Findings (17)

  ERROR    item-order             examples/messy/release/appcast.xml:8
           the first item has sparkle:version 412, but the item at line 16 has 420, which is higher; put the newest item first
           fix: put the items in order, newest first, as generate_appcast writes them

  ERROR    insecure-url           examples/messy/release/appcast.xml:12
           the download "http://downloads.quillmere.test/clip/QuillmereClip-4.1.2.zip" uses http, not https, so it can be read or changed on the way
           fix: serve the file over https and write the https address in the feed

  ERROR    invalid-rollout        examples/messy/release/appcast.xml:19
           the item of version 420 has sparkle:phasedRolloutInterval but no pubDate, which Sparkle needs to place the groups of a phased rollout
           fix: write the share as a number from 0 to 100 (a percentage for Squirrel.Windows, with # right after the size), and give a phased Sparkle item its pubDate

  ERROR    missing-signature      examples/messy/release/appcast.xml:28
           the enclosure of version 400 has no sparkle:edSignature, only the deprecated sparkle:dsaSignature
           fix: sign the archive with the private key of the app (generate_appcast for Sparkle, the signer of the Tauri CLI) and put the signature itself in the feed

  ERROR    version-not-increased  examples/messy/release/latest-linux.yml:1
           the version 3.1.4 is the same as 3.1.4 in the previous electron-updater feed examples/messy/previous/latest-linux.yml, so clients that have it will not update
           fix: give the release a version higher than the one already published; never publish a version again with other files

  ERROR    missing-hash           examples/messy/release/latest-linux.yml:3
           the file "Quillmere-Notes-3.1.4.AppImage" has no sha512, so electron-updater cannot check the download
           fix: build the feed again with the tool that made it, so that each download has its checksum, rather than writing the value by hand

  ERROR    size-mismatch          examples/messy/release/latest-mac.yml:5
           the feed gives 132 bytes for "Quillmere-Notes-3.2.0-mac.zip", and the file in the dist folder has 123
           fix: build the feed again from the files that are uploaded, so that the sizes and checksums are theirs

  ERROR    hash-mismatch          examples/messy/release/latest.yml:4
           the sha512 of "Quillmere-Notes-Setup-3.2.0.exe" does not match the file in the dist folder, so the updater will refuse the download
           fix: build the feed again from the files that are uploaded; a file signed or changed after the feed was written needs a new checksum

  ERROR    invalid-rollout        examples/messy/release/latest.yml:13
           stagingPercentage is "120", not a number from 0 to 100
           fix: write the share as a number from 0 to 100 (a percentage for Squirrel.Windows, with # right after the size), and give a phased Sparkle item its pubDate

  ERROR    version-not-increased  examples/messy/release/quillmere-sync.json:2
           the version 1.4.0 is lower than 1.5.0 in the previous Tauri feed examples/messy/previous/quillmere-sync.json, so clients that have it will not update
           fix: give the release a version higher than the one already published; never publish a version again with other files

  ERROR    missing-signature      examples/messy/release/quillmere-sync.json:7
           the platform "windows-x86_64" has no signature, so the updater refuses the download
           fix: sign the archive with the private key of the app (generate_appcast for Sparkle, the signer of the Tauri CLI) and put the signature itself in the feed

  ERROR    dist-file-missing      examples/messy/release/quillmere-sync.json:16
           "Quillmere.Sync_1.4.0_amd64.AppImage" is not in the dist folder examples/messy/dist
           fix: upload the file with the feed, or correct its name in the feed; names on a web server are compared with their case

  WARNING  mixed-hosts            examples/messy/release/appcast.xml:21
           the download is on cdn-eu.quillmere.test, while the first download of the feed is on downloads.quillmere.test
           fix: serve every download of the release from one host, or check that each host is one you run and that it holds the file

  WARNING  missing-release-notes  examples/messy/release/appcast.xml:23
           the item of version 400 has no release notes: no sparkle:releaseNotesLink and no description
           fix: add release notes so that users see what the update changes

  WARNING  missing-release-notes  examples/messy/release/latest-linux.yml:1
           the feed has no releaseNotes, so the update dialog shows none
           fix: add release notes so that users see what the update changes

  WARNING  mixed-versions         examples/messy/release/latest-linux.yml:1
           latest-linux.yml offers 3.1.4, while latest-mac.yml and latest.yml of the channel "latest" offer 3.2.0
           fix: upload the feeds of every platform of the release together, or note why one platform stays behind

  WARNING  missing-platform       examples/messy/release/quillmere-sync.json:5
           the feed has no platform "darwin-aarch64", which requiredPlatforms.tauri asks for, so that platform gets no update
           fix: add the platform to the release, or take it out of requiredPlatforms when the app is not built for it

note: 1 feed has no feed of the same name or kind in --previous, so its version is not compared

This check reads the feed files and the files beside them on disk and fetches nothing. A finding is a lead with a file and a line, and a clean result is not a signature verification and not a certification (docs/limits.md).

RESULT: FAIL - 12 findings at or above error (12 error, 5 warning)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and the tool's own
choice:

```
  ERROR    hash-mismatch          examples/messy/release/latest.yml:4
           the sha512 of "Quillmere-Notes-Setup-3.2.0.exe" does not match the file in the dist folder, so the updater will refuse the download
           fix: build the feed again from the files that are uploaded; a file signed or changed after the feed was written needs a new checksum
           rule: a checksum in the feed that differs from the one of the file in the dist folder
           basis: electron-updater checks each download against its SHA-512 checksum, and on Windows it also checks the code signature (Auto Update (electron-builder), https://www.electron.build/docs/features/auto-update)
           basis: the update manager downloads RELEASES, compares it with its own copy, and checks each package against its SHA1 in that file (Update Process (Squirrel.Windows docs on GitHub), https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/update-process.md)
           the tool's own choice: only with --dist: the sha512 of an electron-updater feed (base64) and the SHA1 of RELEASES (hexadecimal, of any case) against the file in the dist folder, worked out with node:crypto; a mismatch means the updater will refuse the download
```

The clean example passes:

```
update-feed-check: examples/clean/release
input: 1 folder and 0 files named; 6 feeds: 3 electron-updater, 1 Sparkle, 1 Tauri, 1 Squirrel.Windows; 0 other files passed over; 0 folders inside passed over; 0 links not followed
dist: examples/clean/dist, 11 files
previous: examples/clean/previous, 6 feeds
config: built-in defaults: Tauri platforms windows-x86_64, darwin-aarch64, darwin-x86_64 and linux-x86_64; electron-updater feeds latest.yml, latest-mac.yml and latest-linux.yml; minimum severity info; fail on error
rules: missing-hash (error); missing-signature (error); missing-url (error); insecure-url (error); mixed-hosts (warning); invalid-version (error); item-order (error); duplicate-version (error); version-not-increased (error); dist-file-missing (error); size-mismatch (error); hash-mismatch (error); missing-platform (warning); invalid-rollout (error); mixed-versions (warning); missing-release-notes (info); unreadable-feed (error); scan-limit (error)
findings: 0

Feeds (6)

  feed                                       kind              version      entries  error  warning  info
  examples/clean/release/RELEASES            Squirrel.Windows  1.6.0        3        0      0        0
  examples/clean/release/appcast.xml         Sparkle           5.3.0 (530)  2        0      0        0
  examples/clean/release/larkspan-tray.json  Tauri             0.9.2        4        0      0        0
  examples/clean/release/latest-linux.yml    electron-updater  2.0.1        1        0      0        0
  examples/clean/release/latest-mac.yml      electron-updater  2.0.1        2        0      0        0
  examples/clean/release/latest.yml          electron-updater  2.0.1        1        0      0        0

Rules (18)

  rule                   level    findings
  missing-hash           error    0
  missing-signature      error    0
  missing-url            error    0
  insecure-url           error    0
  mixed-hosts            warning  0
  invalid-version        error    0
  item-order             error    0
  duplicate-version      error    0
  version-not-increased  error    0
  dist-file-missing      error    0
  size-mismatch          error    0
  hash-mismatch          error    0
  missing-platform       warning  0
  invalid-rollout        error    0
  mixed-versions         warning  0
  missing-release-notes  info     0
  unreadable-feed        error    0
  scan-limit             error    0

Findings (0)

  none

This check reads the feed files and the files beside them on disk and fetches nothing. A finding is a lead with a file and a line, and a clean result is not a signature verification and not a certification (docs/limits.md).

RESULT: PASS - no finding at or above error
```

## How the feeds are read

1. A folder is listed at its top only, in the order of the names; a folder inside it is counted and passed over, and a
   symbolic link is counted and never followed. The kind of each file comes from its name, or from `--kind`.
2. Each feed is read as UTF-8 by a small reader of its own: YAML for electron-updater, XML for Sparkle, strict JSON for
   Tauri, and the lines of RELEASES. A reader refuses what it does not read, with its place, and the XML reader refuses
   every DOCTYPE and every declared entity.
3. The checks of each feed run on what it holds; the checks across feeds compare the electron-updater feeds of one
   channel and look for the feed files a folder must hold.
4. With `--previous`, each feed is compared with the feed of the same name published before; with `--dist`, the
   downloads of the newest version are looked for in the folder of built files and their size and checksum compared.

[docs/method.md](docs/method.md) gives the details, and
[decision 2](docs/decisions/0002-read-each-feed-with-a-small-reader-of-its-own.md) says why the readers are the
tool's own.

## What it reports

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `missing-hash` | `rules.missingHash` | error | a download of electron-updater with no sha512, or a package of RELEASES with no SHA1, or one of the wrong form |
| `missing-signature` | `rules.missingSignature` | error | an appcast enclosure with no sparkle:edSignature, or a Tauri platform with no signature or a path in its place |
| `missing-url` | `rules.missingUrl` | error | a feed, an item or a platform with no download |
| `insecure-url` | `rules.insecureUrl` | error | an absolute address of a download or of release notes that is not https |
| `mixed-hosts` | `rules.mixedHosts` | warning | a download on another host than the first download of the feed |
| `invalid-version` | `rules.invalidVersion` | error | a version that is missing, not semantic, or not numbers and dots for Sparkle |
| `item-order` | `rules.itemOrder` | error | an appcast whose first item is not the newest |
| `duplicate-version` | `rules.duplicateVersion` | error | the same version in two items of an appcast or two packages of RELEASES |
| `version-not-increased` | `rules.versionNotIncreased` | error | a version equal to or lower than the one in `--previous` |
| `dist-file-missing` | `rules.distFileMissing` | error | a download that is not in the `--dist` folder |
| `size-mismatch` | `rules.sizeMismatch` | error | a size or length that is not the size of the file in `--dist` |
| `hash-mismatch` | `rules.hashMismatch` | error | a sha512 or SHA1 that is not the checksum of the file in `--dist` |
| `missing-platform` | `rules.missingPlatform` | warning | a Tauri platform or an electron-updater feed file the release must cover |
| `invalid-rollout` | `rules.invalidRollout` | error | a stagingPercentage, phased rollout interval or `# nn%` that is not valid |
| `mixed-versions` | `rules.mixedVersions` | warning | electron-updater feeds of one channel with different versions |
| `missing-release-notes` | `rules.missingReleaseNotes` | info | an update with no release notes |
| `unreadable-feed` | none | error | a feed that cannot be read as its kind |
| `scan-limit` | none | error | input past the limits of a run |

The two rules of input problems are always errors. [docs/method.md](docs/method.md) says exactly what each rule looks
at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public
pages each rule rests on.

## The dist folder and the previous feeds

| Option | What is compared |
| --- | --- |
| `--dist <folder>` | the downloads of the newest version of each feed, looked for at the top of the folder by the last part of their address: the size of electron-updater and RELEASES, the length of an appcast enclosure, the sha512 of electron-updater (base64) and the SHA1 of RELEASES (hexadecimal) |
| `--previous <feed or folder>` | the newest version of each feed against the feed of the same name there, or the one feed of its kind; equal or lower is an error |

Only the newest version of a feed is looked for in the dist folder, because older items of an appcast and older
packages of RELEASES stay on the server. A file is read in blocks of one megabyte, so a large installer needs no more
memory than a small one. Without either option, those checks do not run and the report says so
([decision 3](docs/decisions/0003-check-the-files-on-disk-and-download-nothing.md)).

## Platforms

A release covers the platforms of `requiredPlatforms`. The defaults:

| Kind | Required |
| --- | --- |
| Tauri, in each feed | `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64` |
| electron-updater, in a folder that holds one of them | `latest.yml`, `latest-mac.yml`, `latest-linux.yml` |

A Tauri target is OS-ARCH, with OS `linux`, `darwin` or `windows` and ARCH `x86_64`, `aarch64`, `i686` or `armv7`. A
list in the configuration replaces the default, and an empty list turns the check off. Sparkle feeds are for macOS and
RELEASES for Windows, so they have no list. [docs/inputs.md](docs/inputs.md) describes both.

## What is not checked

The tool reads the files it is given and never guesses. It does not:

- fetch any address, so it does not see whether the server holds the file, answers over https or shows a valid
  certificate;
- check a signature against the public key of the app, or a checksum of Sparkle or Tauri, which their feeds do not
  carry;
- read the settings inside the app: the address of the feed, its public keys, `publisherName` or the channel it follows;
- read the dates of the feeds, so it cannot tell a feed that is old;
- read YAML anchors, tags or flow lists, appcasts that bind the Sparkle namespace to another prefix, or feeds that are
  not UTF-8;
- decide whether a release is safe to ship: it is not a signature verification and not a certification.

So a clean run means the feeds hold none of the problems the rules look for, and every report says so.

## The configuration file

```json
{
  "name": "Quillmere release review",
  "requiredPlatforms": { "tauri": ["windows-x86_64", "darwin-x86_64", "darwin-aarch64", "linux-x86_64"] },
  "rules": { "missingReleaseNotes": "warning" }
}
```

Every key is optional, and without `--config` the defaults apply. `rules` sets the level of each rule (`info`,
`warning`, `error` or `off`), `requiredPlatforms` sets the Tauri targets and the electron-updater feed files a release
must cover, `minSeverity` sets the lowest level shown and `failOn` the lowest level that fails the run. A key the tool
does not know is an error with its line and a suggestion, and a key named twice is refused.
[docs/inputs.md](docs/inputs.md) describes every key, and `--print-defaults` writes the whole default configuration out.

## Formats

- `text`: for a terminal: what was read, the dist folder, the previous feeds, the configuration, the rules, the feeds
  with their kind, version and counts, the count of every rule, the findings with the file and line and what to change,
  the notes, the notice and the result. With `--explain` also the rule, the points of the public pages and the tool's
  own choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the feeds, the counts per rule, every finding
  with its kind, file, line and column, the totals, the result, the notes and the notice.
- `csv`: one record per finding, ready for a sheet: the level, the rule, the kind, the file, the line, the column, what
  was found and what to change, with CRLF line ends as RFC 4180 writes. A field that a spreadsheet could read as a
  formula gets a single quote in front. The start of the messy example:

```
level,rule,kind,file,line,column,found,fix
error,item-order,sparkle,examples/messy/release/appcast.xml,8,24,"the first item has sparkle:version 412, but the item at line 16 has 420, which is higher; put the newest item first","put the items in order, newest first, as generate_appcast writes them"
error,insecure-url,sparkle,examples/messy/release/appcast.xml,12,23,"the download ""http://downloads.quillmere.test/clip/QuillmereClip-4.1.2.zip"" uses http, not https, so it can be read or changed on the way",serve the file over https and write the https address in the feed
error,invalid-rollout,sparkle,examples/messy/release/appcast.xml,19,38,"the item of version 420 has sparkle:phasedRolloutInterval but no pubDate, which Sparkle needs to place the groups of a phased rollout","write the share as a number from 0 to 100 (a percentage for Squirrel.Windows, with # right after the size), and give a phased Sparkle item its pubDate"
```

- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` (for info) with the file, line and
  column, which GitHub shows as an annotation in the pull request, then a summary line. The characters a command gives
  a meaning to are escaped. Two findings of the messy example:

```
::error file=examples/messy/release/latest.yml,line=4,col=13,title=update-feed-check hash-mismatch::the sha512 of "Quillmere-Notes-Setup-3.2.0.exe" does not match the file in the dist folder, so the updater will refuse the download; fix: build the feed again from the files that are uploaded; a file signed or changed after the feed was written needs a new checksum
::warning file=examples/messy/release/latest-linux.yml,line=1,col=10,title=update-feed-check mixed-versions::latest-linux.yml offers 3.1.4, while latest-mac.yml and latest.yml of the channel "latest" offer 3.2.0; fix: upload the feeds of every platform of the release together, or note why one platform stays behind
```

## Exit codes

`0`: no finding at or above the fail-on level (`error` by default). `1`: at least one finding at or above it; with the
default, a missing checksum or signature, an address that is not https, a version that is not valid, out of order,
offered twice or not higher than the previous feed, a file that is missing or does not match, a rollout that is not
valid, or a feed the tool could not read; with `--fail-on warning`, a second host, a missing platform and mixed
versions too. `2`: a usage or input error: nothing named, an unknown option or kind, an option given twice, `--explain`
with the csv or github format, a URL in place of a path, a path that cannot be read, a symbolic link, a path named
twice, a file of no known kind, a `--dist` that is not a folder, a `--previous` that cannot be read, or a configuration
with an unknown key, a key named twice or a value of the wrong kind. With exit code `2` the tool gives no result and
prints the problems on standard error.

## Limits

The tool reads files; it fetches nothing and connects to nothing. A run reports the problems of docs/method.md that the
feeds hold. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 4 MB for a feed, 4 GB for
a built file read in blocks, 10,000 entries in a folder, 1,000 feeds, 500 findings listed per rule.
[docs/threat-model.md](docs/threat-model.md) lists the risks of reading feeds from a pull request and their controls,
and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration, lists the folders, reads each feed, runs the checks across feeds and files, and builds the report of the run |
| `src/walk.js`, `src/files.js`, `src/kinds.js` | the listing of the top of a folder with no link followed, the bounded reading of files and the hashing in blocks, and the kind of each file |
| `src/yaml.js`, `src/xml.js`, `src/json.js` | the readers of the YAML of electron-updater, the XML of appcasts with no DTD and no entity, and strict JSON |
| `src/electron.js`, `src/sparkle.js`, `src/tauri.js`, `src/squirrel.js`, `src/feed.js` | the checks of each kind of feed, and what they share |
| `src/release.js` | the checks across feeds: mixed versions, required feed files, the previous feeds and the dist folder |
| `src/versions.js`, `src/urls.js` | semantic, dotted and package versions and their order, and the addresses of a feed |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults |
| `src/rules.js` | the rules, their levels and the result |
| `src/report.js`, `src/csv.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON, CSV and GitHub output, the cleaning of text from the input, number formats and compared words |
| `src/data.js` | the public pages and the points the rules rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| The update info files of electron-builder, their fields, the SHA-512 check and stagingPercentage | electron-builder, https://www.electron.build/docs/features/auto-update |
| The channels latest, beta and alpha and their files | electron-builder, https://www.electron.build/docs/tutorials/release-using-channels |
| The items of an appcast, release notes and phased rollouts | Sparkle, https://sparkle-project.org/documentation/publishing/ |
| EdDSA keys and HTTPS for updates | Sparkle, https://sparkle-project.org/documentation/ |
| DSA signatures deprecated in favour of sparkle:edSignature | Sparkle, https://sparkle-project.org/documentation/eddsa-migration/ |
| The static JSON file of Tauri, its platforms, signatures and TLS | Tauri, https://v2.tauri.app/plugin/updater/ |
| The SHA1 check of RELEASES | Squirrel.Windows, https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/update-process.md |
| The lines of RELEASES and staged rollouts | Squirrel.Windows, https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/staged-rollouts.md |
| The form and order of versions | Semantic Versioning, https://semver.org/ |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object, and UTF-8 | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Formulas hidden in CSV files | OWASP, https://community.owasp.org/attacks/CSV_Injection |
| Refusing DOCTYPE against XML external entities | OWASP, https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

A desktop app that updates itself is only as good as the small file that tells it what to download. When that file
names an installer that was signed after its checksum was written, every user gets a failed update at the same moment;
when it offers a version that does not go up, the users who took the broken one stay on it. Those mistakes are visible
in the release folder before the upload, if someone reads it with them in mind on every release. How such apps are
built, signed and shipped on Windows, macOS and Linux is described on the page
[Cross-Platform Desktop App Development Services](https://innerluxes.dev/application/development/desktop/services).

## License

MIT
