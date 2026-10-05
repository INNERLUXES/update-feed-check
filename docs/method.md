# Method

This document says exactly what the tool reads, how it reads each kind of feed, what each rule looks at and cannot
see, and how the report is built. The names used here are the defaults; docs/inputs.md says how the configuration
changes them. The tool reads the feeds of a release and the built files beside them on disk, and fetches nothing. It
is a check before a release goes out, not a signature verification and not a certification: a finding points at a
line worth a look, and a clean run says only that the feeds hold none of the problems below.

## What is read

The input is one or more feed files and folders of feeds. A folder is listed at its top only, in the order of the
names, with no recursion (src/walk.js): electron-builder, Sparkle, Tauri and Squirrel.Windows all put a release side by
side in one folder. A folder inside is counted and passed over, and a symbolic link (or a junction on Windows) is
counted and never followed. Of the files, four kinds are read (src/kinds.js), each known from its name:

- **electron-updater**: `.yml` and `.yaml` files, such as latest.yml, latest-mac.yml, latest-linux.yml and the files
  of other channels (beta.yml, alpha-linux.yml); builder-debug.yml, builder-effective-config.yaml, app-update.yml and
  dev-app-update.yml are not feeds and are passed over;
- **Sparkle**: `.xml` and `.rss` files, the appcasts;
- **Tauri**: `.json` files, the static updater feeds;
- **Squirrel.Windows**: files named RELEASES.

`--kind` reads a file named on the command line as that kind whatever its name, and in a folder reads only the files
of that kind. A file named on the command line whose kind its name does not tell, with no `--kind`, stops the run.

Each feed is read once, as UTF-8 with or without a byte order mark. A file that holds a null byte or bytes that are not
valid UTF-8, and a file over 4 MB, is an `unreadable-feed` finding and nothing in it is checked. Every date of a feed
(releaseDate, pubDate, pub_date) is passed over: the tool reads no clock, and no date ever changes a result.

## How each kind is read

1. **electron-updater** (src/electron.js), with the YAML reader of src/yaml.js. The reader takes the part of YAML that
   these feeds use: block mappings and lists, plain and quoted values on one line, literal and folded blocks (`|`,
   `>`), comments and a `---` at the start. It refuses anchors and aliases, tags, flow collections other than `[]` and
   `{}`, complex keys, directives, a second document, tabs in the indentation, a quoted value over several lines, a
   plain value continued on the next line and a key named twice, each with its place. The fields read are `version`,
   `files` with `url`, `sha512` and `size`, `path` and the top-level `sha512`, `stagingPercentage` and `releaseNotes`.
   An entry of `path` whose url is also in `files` is not checked twice.
2. **Sparkle** (src/sparkle.js), with the XML reader of src/xml.js. The reader refuses a DOCTYPE and any other `<!`
   declaration, decodes only the five entities of XML and numeric references, and refuses a file that is not well
   formed. Names are matched with the `sparkle:` prefix as appcasts write them. The fields read are, for each `<item>`
   of `<rss><channel>`: `sparkle:version` (the element, or the attribute of the enclosure), `sparkle:shortVersionString`,
   `sparkle:minimumSystemVersion`, the `enclosure` with `url`, `length`, `sparkle:edSignature` and
   `sparkle:dsaSignature`, the enclosures of `sparkle:deltas`, `sparkle:releaseNotesLink`,
   `sparkle:fullReleaseNotesLink`, `description`, `sparkle:phasedRolloutInterval`, `sparkle:channel`,
   `sparkle:informationalUpdate`, and whether a `pubDate` is there.
3. **Tauri** (src/tauri.js), with the strict JSON reader of src/json.js, which refuses comments, trailing commas and a
   name given twice. The fields read are `version`, `notes` and `platforms`, each platform with `url` and `signature`.
   The answer of a dynamic update server, with `url`, `version` and `signature` at the top and no `platforms`, is read
   as one entry.
4. **Squirrel.Windows** (src/squirrel.js): one package a line, `SHA1 file size`, with an optional `# nn%` of a staged
   rollout. The version and the type of each package come from its name, `id-1.2.3-full.nupkg` or
   `id-1.2.3-delta.nupkg`, with three or four numbers and an optional pre-release. A line of another form makes the
   whole file an `unreadable-feed` finding, as it does for Squirrel.Windows.

The **newest version** of a feed is its version for electron-updater and Tauri, the highest `sparkle:version` for an
appcast and the highest version of a full package for RELEASES. Only the downloads of the newest version are looked for
in the dist folder, because older items of an appcast or older packages of RELEASES stay on the server and are not in
the folder of the new build.

## Versions

A semantic version follows semver.org: three numbers with no leading zero, an optional pre-release after a hyphen and
build metadata after a plus. Tauri also takes a leading v; electron-updater feeds do not. `sparkle:version` and
`sparkle:minimumSystemVersion` are numbers separated by dots. Versions compare as semver.org orders them: part by part
as numbers of any length, a missing part as 0, a pre-release below its release, identifiers one by one with numbers
below words, and build metadata left out (src/versions.js).

## Addresses

An address with a scheme (`https:`, `http:`, `ftp:`, `file:`) is absolute; an address with none is relative to the
place the feed is served from, as electron-updater feeds write the names of their files. The URL class of Node reads
the host; nothing is fetched. The file an address points at is the last part of its path, percent-decoded, without its
query (src/urls.js).

## Rules

The level of each rule is set in the configuration; the defaults are below. Each finding has its file, line and column.

### `missing-hash`

Error. electron-updater: an entry of `files` with no `sha512`, or with one that is not the base64 of 64 bytes (the
length of a SHA-512 checksum); a `path` with no entry of `files` and no top-level `sha512`. Squirrel.Windows: a line
with no SHA1, or one that is not 40 hexadecimal digits. Sparkle and Tauri feeds carry signatures and are checked by
`missing-signature`. The tool cannot see whether the checksum is the one of the file; `--dist` checks that.

### `missing-signature`

Error. Sparkle: an enclosure, delta enclosures too, with no `sparkle:edSignature`, or one that is not the base64 of 64
bytes (the length of an ed25519 signature); an enclosure with only a `sparkle:dsaSignature` is reported and the finding
says so. Tauri: a platform with no `signature`, an empty one, or one that is a path or an address (it holds `://`,
ends in `.sig`, or starts with `/`, `./`, `../` or a drive) in place of the content of the .sig file. The tool has no
public key and cannot check that a signature is right.

### `missing-url`

Error. A feed or an entry that names no download: an electron-updater feed with no `files` and no `path`, an entry of
`files` that is not a mapping or has no `url`; an appcast with no item, an item with no enclosure unless it is a
`sparkle:informationalUpdate`, an enclosure with no `url`; a Tauri feed with no `platforms`, a platform that is not an
object or has no `url`; a RELEASES file with no package.

### `insecure-url`

Error. An absolute address of a download, of a release notes link or of a package of RELEASES whose scheme is not
https. A relative address is served the way the feed is, so it is not reported; check the address of the feed itself in
the app. Namespace declarations of XML (`xmlns:sparkle`) are names, not addresses, and are not read.

### `mixed-hosts`

Warning. The tool's own choice: an absolute download address of a feed whose host differs from the host of the first
download of that feed. Release notes links are not counted. A second host is often a leftover of an old server, a
mirror that was never filled or a typo.

### `invalid-version`

Error. electron-updater: a missing version, or one that is not a semantic version; a leading v is reported. Tauri: a
missing version, a value that is not a text, or one that is not a semantic version with or without a leading v.
Sparkle: an item with no `sparkle:version`, a `sparkle:version` or `sparkle:minimumSystemVersion` that is not numbers
separated by dots. Squirrel.Windows: a package whose name ends in neither `-full.nupkg` nor `-delta.nupkg` or holds no
version.

### `item-order`

Error. The tool's own choice: the first item of an appcast whose `sparkle:version` is below the highest of the
appcast, compared as numbers (1.10 is above 1.9). Sparkle picks the best item itself, but people, scripts and other
tools take the first item as the newest. The finding names the line of the highest item.

### `duplicate-version`

Error. Two appcast items with the same `sparkle:version`, compared as numbers (0300 is 300), in the same
`sparkle:channel` (no channel is a channel of its own); two full, or two delta, packages of RELEASES with the same
version. The finding names the line of the first.

### `version-not-increased`

Error, only with `--previous`. The newest version of each feed against the newest version of the previous feed of the
same name (compared without regard to case), or, when the input and `--previous` each hold one feed of a kind, of that
one. Equal or lower is reported: a client that has the previous version does not take the same version again. A feed
with no previous feed to compare is counted in a note.

### `dist-file-missing`

Error, only with `--dist`. A download of the newest version whose file is not at the top of the dist folder by its
exact name; a name that differs only in case is named in the finding, because names on a web server keep their case. A
symbolic link, a folder of that name, a file that cannot be read and an address that names no file are reported too.

### `size-mismatch`

Error, only with `--dist`. The `size` of an entry of `files`, the `length` of the enclosure of the newest appcast item
and the size of a line of RELEASES, against the size of the file in the dist folder.

### `hash-mismatch`

Error, only with `--dist`. The `sha512` of electron-updater (base64) and the SHA1 of RELEASES (hexadecimal, of any
case), against the checksum of the file in the dist folder, worked out with node:crypto in blocks of one megabyte. A
file signed or changed after the feed was written no longer matches, and the updater refuses it.

### `missing-platform`

Warning. A Tauri feed with no key of `requiredPlatforms.tauri`, placed on `platforms`; a folder of feeds that holds an
electron-updater feed but not every file of `requiredPlatforms.electron`, placed on the first electron-updater feed of
the folder. Feed files named one by one are not checked for the files beside them. An empty list turns the check off.

### `invalid-rollout`

Error. electron-updater: a `stagingPercentage` that is not a plain number from 0 to 100. Sparkle: a
`sparkle:phasedRolloutInterval` that is not a whole number of seconds above 0, or that sits in an item with no
`pubDate`. Squirrel.Windows: a `# nn%` that is not a percentage from 0% to 100%, or that has a space before the `#`.

### `mixed-versions`

Warning. The electron-updater feeds of one folder and one channel (the name of the file without `.yml` and without
`-mac`, `-linux`, `-linux-arm64` or `-linux-armv7l`): each feed below the highest version of its channel is reported.
Sparkle, Tauri and Squirrel.Windows feeds each hold one app, so they are not compared with other feeds.

### `missing-release-notes`

Info. An electron-updater feed with no `releaseNotes` or an empty one; an appcast item with no
`sparkle:releaseNotesLink`, `sparkle:fullReleaseNotesLink` or `description`; a Tauri feed with no `notes`.
RELEASES has no place for notes.

### `unreadable-feed`

Error, always. A feed over 4 MB, a binary file, a file that is not valid UTF-8, a file that cannot be opened, and a
feed its reader refuses, with the place and the reason. This rule has no key and cannot be lowered or set off.

### `scan-limit`

Error, always. A folder with more than 10,000 entries (the folder of feeds or the dist folder), or more than 1,000 feeds
in all. The rest is not read, so the run fails. This rule has no key.

## The report

The findings are sorted by level, errors first, then by file, line, column and the order of the rules. At most 500
findings of one rule are listed; the rest are counted in a note and still count for the result. The text report lists
what was read, the dist folder, the previous feeds, the configuration, the rules with their levels, the feeds with their
kind, newest version, entries and counts by level, the count of findings of every rule, the findings with what to
change, the notes, the notice and the result. The result and the exit code come from `failOn` alone.
