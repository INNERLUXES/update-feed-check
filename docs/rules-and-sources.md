# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own and what to change before the release goes out. The same points are in src/data.js
and are shown by `--explain`; research/sources.md has a longer note on each page. The tool reads the feeds and the
built files on disk: a point says what a page says, and a finding says what a file holds. A clean result is not a
signature verification and not a certification.

## The rules

| Rule | Default level | Points |
| --- | --- | --- |
| `missing-hash` | error | `electronSha512`, `squirrelSha1` |
| `missing-signature` | error | `sparkleEdOnly`, `sparkleKeys`, `tauriSignature` |
| `missing-url` | error | `electronFields`, `sparkleItem`, `tauriPlatforms` |
| `insecure-url` | error | `tauriTls`, `sparkleKeys` |
| `mixed-hosts` | warning | `electronFields`, `sparkleItem`, `tauriPlatforms` |
| `invalid-version` | error | `semverForm`, `tauriFormat`, `sparkleItem`, `sparkleMinSystem` |
| `item-order` | error | `sparkleItem` |
| `duplicate-version` | error | `sparkleItem`, `squirrelLines` |
| `version-not-increased` | error | `electronNoReuse`, `squirrelStaging`, `semverOrder` |
| `dist-file-missing` | error | `electronFeeds`, `squirrelLines` |
| `size-mismatch` | error | `electronFields`, `sparkleItem`, `squirrelLines` |
| `hash-mismatch` | error | `electronSha512`, `squirrelSha1` |
| `missing-platform` | warning | `tauriPlatforms`, `electronFeeds` |
| `invalid-rollout` | error | `electronStaging`, `sparklePhased`, `squirrelStaging` |
| `mixed-versions` | warning | `electronFeeds`, `electronChannels` |
| `missing-release-notes` | info | `electronFields`, `sparkleNotes`, `tauriFormat` |
| `unreadable-feed` | error, always | `xxeDoctype`, `jsonRepeatedNames` |
| `scan-limit` | error, always | `xxeDoctype` |

### `missing-hash`

A download has no checksum, or one of the wrong form.

- `electronSha512` (Auto Update (electron-builder)): electron-updater checks each download against its SHA-512 checksum, and on Windows it also checks the code signature.
- `squirrelSha1` (Update Process (Squirrel.Windows docs on GitHub)): the update manager downloads RELEASES, compares it with its own copy, and checks each package against its SHA1 in that file.

The tool's own choice: an entry of files, or a path with no entry of files, with no sha512 or with a sha512 that is not the base64 of 64 bytes, and a line of RELEASES with no SHA1 of 40 hexadecimal digits; Sparkle and Tauri feeds carry signatures, not checksums, and are checked by missing-signature.

What to change: build the feed again with the tool that made it, so that each download has its checksum, rather than writing the value by hand.

### `missing-signature`

A download has no signature, or one of the wrong form.

- `sparkleEdOnly` (Migrating to EdDSA from DSA (Sparkle)): DSA signatures are deprecated and kept only for the move to EdDSA; after it, every update in the appcast carries its sparkle:edSignature.
- `sparkleKeys` (Documentation, basic setup and EdDSA signatures (Sparkle)): an app keeps its EdDSA public key in SUPublicEDKey, every update is signed with the private key, and updates should be served over HTTPS.
- `tauriSignature` (Updater plugin (Tauri)): the signature is the content of the .sig file of the build; a path or a URL in its place does not work.

The tool's own choice: an enclosure of an appcast, delta enclosures too, with no sparkle:edSignature or one that is not the base64 of 64 bytes, and a Tauri platform with no signature or with a path or address in its place; the tool cannot check a signature against the public key of the app.

What to change: sign the archive with the private key of the app (generate_appcast for Sparkle, the signer of the Tauri CLI) and put the signature itself in the feed.

### `missing-url`

An entry offers no download.

- `electronFields` (Auto Update (electron-builder)): an update info file holds the version, a files list with the url, sha512 and size of each download, and the release name, notes and date; path and a top-level sha512 are kept for older clients.
- `sparkleItem` (Publishing an update (Sparkle)): an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive.
- `tauriPlatforms` (Updater plugin (Tauri)): each platform key is OS-ARCH, with OS linux, darwin or windows and ARCH x86_64, aarch64, i686 or armv7, and each platform needs a url and a signature.

The tool's own choice: a feed with no file to download, an entry of files or a Tauri platform with no url, an appcast item with no enclosure unless it is a sparkle:informationalUpdate, an enclosure with no url, an appcast with no item and a RELEASES file with no package.

What to change: add the address of the download to the entry, or take the entry out of the feed.

### `insecure-url`

An address does not use https.

- `tauriTls` (Updater plugin (Tauri)): the updater enforces TLS in production unless a setting lets it accept endpoints that are not HTTPS.
- `sparkleKeys` (Documentation, basic setup and EdDSA signatures (Sparkle)): an app keeps its EdDSA public key in SUPublicEDKey, every update is signed with the private key, and updates should be served over HTTPS.

The tool's own choice: every absolute address of a download, a release notes link or a package of RELEASES whose scheme is not https; an address with no scheme is relative to the feed and is served the way the feed is; namespace declarations of XML are not addresses and are not read.

What to change: serve the file over https and write the https address in the feed.

### `mixed-hosts`

The downloads of one feed sit on more than one host.

- `electronFields` (Auto Update (electron-builder)): an update info file holds the version, a files list with the url, sha512 and size of each download, and the release name, notes and date; path and a top-level sha512 are kept for older clients.
- `sparkleItem` (Publishing an update (Sparkle)): an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive.
- `tauriPlatforms` (Updater plugin (Tauri)): each platform key is OS-ARCH, with OS linux, darwin or windows and ARCH x86_64, aarch64, i686 or armv7, and each platform needs a url and a signature.

The tool's own choice: the tool's own choice: every absolute download address of a feed whose host differs from the host of the first one; release notes links are not counted; a second host is often a leftover of an old server or a typo.

What to change: serve every download of the release from one host, or check that each host is one you run and that it holds the file.

### `invalid-version`

A version is missing or not valid.

- `semverForm` (Semantic Versioning): a version is MAJOR.MINOR.PATCH of non-negative integers with no leading zeros, with an optional pre-release after a hyphen and build metadata after a plus; v1.2.3 is not a semantic version.
- `tauriFormat` (Updater plugin (Tauri)): the static JSON file needs version, a valid SemVer with or without a leading v, and platforms; notes is optional, and pub_date, when present, is RFC 3339.
- `sparkleItem` (Publishing an update (Sparkle)): an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive.
- `sparkleMinSystem` (Publishing an update (Sparkle)): sparkle:minimumSystemVersion gives the lowest macOS version, written as major.minor.patch.

The tool's own choice: an electron-updater version that is not a semantic version, a Tauri version that is not one with or without a leading v, a sparkle:version or sparkle:minimumSystemVersion that is not numbers separated by dots, and a package of RELEASES with no version of three or four numbers in its name.

What to change: write the version as the updater compares it: MAJOR.MINOR.PATCH for electron-updater and Tauri, a build number of digits and dots for sparkle:version, name-1.2.3-full.nupkg for Squirrel.Windows.

### `item-order`

The newest item of an appcast is not the first.

- `sparkleItem` (Publishing an update (Sparkle)): an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive.

The tool's own choice: the tool's own choice: the first item of an appcast must have the highest sparkle:version; Sparkle picks the best item itself, but people, other tools and scripts that read the appcast take the first item as the newest.

What to change: put the items in order, newest first, as generate_appcast writes them.

### `duplicate-version`

One version is offered twice.

- `sparkleItem` (Publishing an update (Sparkle)): an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive.
- `squirrelLines` (Staged Rollouts (Squirrel.Windows docs on GitHub)): each line of RELEASES holds the SHA1, the file name and the size of a full or delta package.

The tool's own choice: two appcast items with the same sparkle:version in the same sparkle:channel, compared as numbers, and two full or two delta packages of RELEASES with the same version.

What to change: keep one entry for each version, and give a rebuilt release a higher version.

### `version-not-increased`

The version does not go up from the previous feed.

- `electronNoReuse` (Auto Update (electron-builder)): a release that is pulled must be followed by a higher version number, not by the same version released again.
- `squirrelStaging` (Staged Rollouts (Squirrel.Windows docs on GitHub)): a staged rollout adds # and a percentage after the size, with no space before # for clients older than 1.4.0, and a pulled version must be followed by a higher one.
- `semverOrder` (Semantic Versioning): versions compare part by part as numbers, a pre-release ranks below its release, and build metadata is left out of the comparison.

The tool's own choice: only with --previous: the newest version of a feed against the newest version of the feed of the same name in --previous, or of the one feed of the same kind there; equal or lower is reported, because clients that have the previous version will not take it.

What to change: give the release a version higher than the one already published; never publish a version again with other files.

### `dist-file-missing`

A download is not in the dist folder.

- `electronFeeds` (Auto Update (electron-builder)): electron-builder writes latest.yml for Windows, latest-mac.yml for macOS and latest-linux.yml for Linux, and these files must be uploaded with the release for the app to find its update.
- `squirrelLines` (Staged Rollouts (Squirrel.Windows docs on GitHub)): each line of RELEASES holds the SHA1, the file name and the size of a full or delta package.

The tool's own choice: only with --dist: the file named by the last part of the address of each download of the newest version is looked for in the top of the dist folder, by its exact name; a file that differs only in the case of its name, a symbolic link, a folder and a file that cannot be read are reported too.

What to change: upload the file with the feed, or correct its name in the feed; names on a web server are compared with their case.

### `size-mismatch`

The size in the feed is not the size of the file.

- `electronFields` (Auto Update (electron-builder)): an update info file holds the version, a files list with the url, sha512 and size of each download, and the release name, notes and date; path and a top-level sha512 are kept for older clients.
- `sparkleItem` (Publishing an update (Sparkle)): an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive.
- `squirrelLines` (Staged Rollouts (Squirrel.Windows docs on GitHub)): each line of RELEASES holds the SHA1, the file name and the size of a full or delta package.

The tool's own choice: only with --dist: the size of an entry of files, the length of an appcast enclosure and the size of a line of RELEASES, against the size of the file in the dist folder.

What to change: build the feed again from the files that are uploaded, so that the sizes and checksums are theirs.

### `hash-mismatch`

The checksum in the feed is not the checksum of the file.

- `electronSha512` (Auto Update (electron-builder)): electron-updater checks each download against its SHA-512 checksum, and on Windows it also checks the code signature.
- `squirrelSha1` (Update Process (Squirrel.Windows docs on GitHub)): the update manager downloads RELEASES, compares it with its own copy, and checks each package against its SHA1 in that file.

The tool's own choice: only with --dist: the sha512 of an electron-updater feed (base64) and the SHA1 of RELEASES (hexadecimal, of any case) against the file in the dist folder, worked out with node:crypto; a mismatch means the updater will refuse the download.

What to change: build the feed again from the files that are uploaded; a file signed or changed after the feed was written needs a new checksum.

### `missing-platform`

A platform the release must cover has no feed or entry.

- `tauriPlatforms` (Updater plugin (Tauri)): each platform key is OS-ARCH, with OS linux, darwin or windows and ARCH x86_64, aarch64, i686 or armv7, and each platform needs a url and a signature.
- `electronFeeds` (Auto Update (electron-builder)): electron-builder writes latest.yml for Windows, latest-mac.yml for macOS and latest-linux.yml for Linux, and these files must be uploaded with the release for the app to find its update.

The tool's own choice: a Tauri feed with no key of requiredPlatforms.tauri, and a folder of feeds that holds an electron-updater feed but not every file of requiredPlatforms.electron; files named one by one are not checked for the files beside them.

What to change: add the platform to the release, or take it out of requiredPlatforms when the app is not built for it.

### `invalid-rollout`

A staged or phased rollout is not valid.

- `electronStaging` (Auto Update (electron-builder)): a staged rollout is set by hand with stagingPercentage in the update info file, a number from 0 to 100 that is the share of users who get the version.
- `sparklePhased` (Publishing an update (Sparkle)): sparkle:phasedRolloutInterval gives the number of seconds between seven groups of users, and the item must then have a pubDate.
- `squirrelStaging` (Staged Rollouts (Squirrel.Windows docs on GitHub)): a staged rollout adds # and a percentage after the size, with no space before # for clients older than 1.4.0, and a pulled version must be followed by a higher one.

The tool's own choice: a stagingPercentage that is not a number from 0 to 100, a sparkle:phasedRolloutInterval that is not a whole number of seconds above 0 or that has no pubDate in its item, and a "# nn%" of RELEASES that is not from 0% to 100% or has a space before #.

What to change: write the share as a number from 0 to 100 (a percentage for Squirrel.Windows, with # right after the size), and give a phased Sparkle item its pubDate.

### `mixed-versions`

The feeds of one channel offer different versions.

- `electronFeeds` (Auto Update (electron-builder)): electron-builder writes latest.yml for Windows, latest-mac.yml for macOS and latest-linux.yml for Linux, and these files must be uploaded with the release for the app to find its update.
- `electronChannels` (Release Using Channels (electron-builder)): the prerelease tag of the version picks the channel, latest, beta or alpha, and each channel gets update info files of its own.

The tool's own choice: the electron-updater feeds of one folder and one channel (latest.yml, latest-mac.yml and latest-linux.yml are the channel latest); each feed below the highest version of its channel is reported; Sparkle, Tauri and Squirrel.Windows feeds each hold one app and are not compared with others.

What to change: upload the feeds of every platform of the release together, or note why one platform stays behind.

### `missing-release-notes`

An update has no release notes.

- `electronFields` (Auto Update (electron-builder)): an update info file holds the version, a files list with the url, sha512 and size of each download, and the release name, notes and date; path and a top-level sha512 are kept for older clients.
- `sparkleNotes` (Publishing an update (Sparkle)): release notes of an item come from sparkle:releaseNotesLink or from its description.
- `tauriFormat` (Updater plugin (Tauri)): the static JSON file needs version, a valid SemVer with or without a leading v, and platforms; notes is optional, and pub_date, when present, is RFC 3339.

The tool's own choice: an electron-updater feed with no releaseNotes, an appcast item with no sparkle:releaseNotesLink, sparkle:fullReleaseNotesLink or description, and a Tauri feed with no notes; RELEASES has no place for notes.

What to change: add release notes so that users see what the update changes.

### `unreadable-feed`

A feed that cannot be read.

- `xxeDoctype` (XML External Entity Prevention Cheat Sheet (OWASP)): the safest defence against XML external entities is to refuse DOCTYPE declarations, which also stops entity expansion that exhausts memory.
- `jsonRepeatedNames` (RFC 8259, The JSON Data Interchange Format): when an object repeats a name the behavior of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name.

The tool's own choice: a file over its size limit, a binary file, a file that is not valid UTF-8, and a feed that its reader refuses: YAML outside the subset read, XML with a DOCTYPE or not well formed, JSON that is not strict or repeats a name, a line of RELEASES that is not "SHA1 file size"; nothing in it is checked; this rule cannot be set lower or off.

What to change: save the feed as UTF-8 in the form its updater reads, or name the right kind with --kind.

### `scan-limit`

The input is larger than the limits of a run.

- `xxeDoctype` (XML External Entity Prevention Cheat Sheet (OWASP)): the safest defence against XML external entities is to refuse DOCTYPE declarations, which also stops entity expansion that exhausts memory.

The tool's own choice: a folder with more entries, or more feeds in all, than the limits of docs/limits.md; the rest is not read, so the run fails; this rule cannot be set lower or off.

What to change: check each release folder in its own run.

## The points

| Point | Page | What it says |
| --- | --- | --- |
| `electronFeeds` | Auto Update (electron-builder) | electron-builder writes latest.yml for Windows, latest-mac.yml for macOS and latest-linux.yml for Linux, and these files must be uploaded with the release for the app to find its update |
| `electronFields` | Auto Update (electron-builder) | an update info file holds the version, a files list with the url, sha512 and size of each download, and the release name, notes and date; path and a top-level sha512 are kept for older clients |
| `electronSha512` | Auto Update (electron-builder) | electron-updater checks each download against its SHA-512 checksum, and on Windows it also checks the code signature |
| `electronStaging` | Auto Update (electron-builder) | a staged rollout is set by hand with stagingPercentage in the update info file, a number from 0 to 100 that is the share of users who get the version |
| `electronNoReuse` | Auto Update (electron-builder) | a release that is pulled must be followed by a higher version number, not by the same version released again |
| `electronChannels` | Release Using Channels (electron-builder) | the prerelease tag of the version picks the channel, latest, beta or alpha, and each channel gets update info files of its own |
| `sparkleItem` | Publishing an update (Sparkle) | an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive |
| `sparkleNotes` | Publishing an update (Sparkle) | release notes of an item come from sparkle:releaseNotesLink or from its description |
| `sparkleMinSystem` | Publishing an update (Sparkle) | sparkle:minimumSystemVersion gives the lowest macOS version, written as major.minor.patch |
| `sparklePhased` | Publishing an update (Sparkle) | sparkle:phasedRolloutInterval gives the number of seconds between seven groups of users, and the item must then have a pubDate |
| `sparkleKeys` | Documentation, basic setup and EdDSA signatures (Sparkle) | an app keeps its EdDSA public key in SUPublicEDKey, every update is signed with the private key, and updates should be served over HTTPS |
| `sparkleEdOnly` | Migrating to EdDSA from DSA (Sparkle) | DSA signatures are deprecated and kept only for the move to EdDSA; after it, every update in the appcast carries its sparkle:edSignature |
| `tauriFormat` | Updater plugin (Tauri) | the static JSON file needs version, a valid SemVer with or without a leading v, and platforms; notes is optional, and pub_date, when present, is RFC 3339 |
| `tauriPlatforms` | Updater plugin (Tauri) | each platform key is OS-ARCH, with OS linux, darwin or windows and ARCH x86_64, aarch64, i686 or armv7, and each platform needs a url and a signature |
| `tauriSignature` | Updater plugin (Tauri) | the signature is the content of the .sig file of the build; a path or a URL in its place does not work |
| `tauriTls` | Updater plugin (Tauri) | the updater enforces TLS in production unless a setting lets it accept endpoints that are not HTTPS |
| `squirrelSha1` | Update Process (Squirrel.Windows docs on GitHub) | the update manager downloads RELEASES, compares it with its own copy, and checks each package against its SHA1 in that file |
| `squirrelLines` | Staged Rollouts (Squirrel.Windows docs on GitHub) | each line of RELEASES holds the SHA1, the file name and the size of a full or delta package |
| `squirrelStaging` | Staged Rollouts (Squirrel.Windows docs on GitHub) | a staged rollout adds # and a percentage after the size, with no space before # for clients older than 1.4.0, and a pulled version must be followed by a higher one |
| `semverForm` | Semantic Versioning | a version is MAJOR.MINOR.PATCH of non-negative integers with no leading zeros, with an optional pre-release after a hyphen and build metadata after a plus; v1.2.3 is not a semantic version |
| `semverOrder` | Semantic Versioning | versions compare part by part as numbers, a pre-release ranks below its release, and build metadata is left out of the comparison |
| `csvRecords` | RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice |
| `csvInjection` | CSV Injection (OWASP) | a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file |
| `jsonUtf8` | RFC 8259, The JSON Data Interchange Format | JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start |
| `jsonRepeatedNames` | RFC 8259, The JSON Data Interchange Format | when an object repeats a name the behavior of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name |
| `xxeDoctype` | XML External Entity Prevention Cheat Sheet (OWASP) | the safest defence against XML external entities is to refuse DOCTYPE declarations, which also stops entity expansion that exhausts memory |
| `githubAnnotations` | Workflow commands for GitHub Actions (GitHub Docs) | a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run |

## The pages

- Auto Update (electron-builder): https://www.electron.build/docs/features/auto-update
- Release Using Channels (electron-builder): https://www.electron.build/docs/tutorials/release-using-channels
- Publishing an update (Sparkle): https://sparkle-project.org/documentation/publishing/
- Documentation, basic setup and EdDSA signatures (Sparkle): https://sparkle-project.org/documentation/
- Migrating to EdDSA from DSA (Sparkle): https://sparkle-project.org/documentation/eddsa-migration/
- Updater plugin (Tauri): https://v2.tauri.app/plugin/updater/
- Update Process (Squirrel.Windows docs on GitHub): https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/update-process.md
- Staged Rollouts (Squirrel.Windows docs on GitHub): https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/staged-rollouts.md
- Semantic Versioning: https://semver.org/
- RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files: https://www.rfc-editor.org/rfc/rfc4180
- RFC 8259, The JSON Data Interchange Format: https://www.rfc-editor.org/rfc/rfc8259
- CSV Injection (OWASP): https://community.owasp.org/attacks/CSV_Injection
- XML External Entity Prevention Cheat Sheet (OWASP): https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html
- Workflow commands for GitHub Actions (GitHub Docs): https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
