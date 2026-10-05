# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which parts of the tool lean on it. Nothing here is a copy of a page: read the page itself for its exact
wording. src/data.js holds the pages and the points the reports show, and test/data.test.js checks that every page in
src/data.js is listed here.
Each page was fetched and read before it was listed.

The tool reads the feeds and the built files on disk; a clean result is not a signature verification and not a
certification. These notes say what the pages say so a reader can follow a finding back to its source; they are not
advice on how to ship any one app. The pages were chosen with web addresses that hold no number that reads like a year.

## electron-builder and electron-updater

### Auto Update (electron-builder)

https://www.electron.build/docs/features/auto-update

The page on the updates of an app built with electron-builder. The build writes an update info file and uploads it
with the release: latest.yml for Windows, latest-mac.yml for macOS and latest-linux.yml for Linux; with a plain web
server the files are uploaded by hand. The file holds the version, a list of files with the url, the sha512 and the
size of each download, and the release name, notes and date; path and a top-level sha512 are kept so that older
versions of electron-updater still work. electron-updater checks each download against its SHA-512 checksum, and on
Windows it also checks the code signature. A staged rollout is set by hand: stagingPercentage, a number from 0 to 100,
is the share of users that get the version. A release that went wrong must be followed by a higher version, not by the
same version again. The page also describes a signed manifest, which this tool does not read. `missing-hash`,
`hash-mismatch`, `size-mismatch`, `dist-file-missing`, `missing-url`, `missing-platform`, `invalid-rollout`,
`version-not-increased` and `missing-release-notes` lean on it.

### Release Using Channels (electron-builder)

https://www.electron.build/docs/tutorials/release-using-channels

The tutorial on channels. latest is the stable channel, beta and alpha the less stable ones; a user on beta also gets
latest, and a user on alpha gets all three. The prerelease tag of the version (1.3.2-beta, 1.3.2-alpha) picks the
channel, and each channel has update info files of its own. `mixed-versions` compares the feeds of one channel only,
and reads the channel from the name of the file.

## Sparkle

### Publishing an update (Sparkle)

https://sparkle-project.org/documentation/publishing/

The page on the appcast. An item has sparkle:version, the version the machine compares, sparkle:shortVersionString,
the version shown to people, and an enclosure with the url, the length and the type of the archive; generate_appcast
is the way the page recommends to write the appcast and its signatures. Release notes come from
sparkle:releaseNotesLink or from the description of the item. sparkle:minimumSystemVersion gives the lowest macOS
version. A phased rollout is set with sparkle:phasedRolloutInterval, the number of seconds between groups of users,
seven groups in all, and the item must then have a pubDate. The page sets no order for the items; the tool's own rule
that the newest comes first is marked as its own choice. `invalid-version`, `item-order`, `duplicate-version`,
`missing-url`, `size-mismatch`, `invalid-rollout` and `missing-release-notes` lean on it.

### Documentation, basic setup and EdDSA signatures (Sparkle)

https://sparkle-project.org/documentation/

The setup page. An app keeps the EdDSA (ed25519) public key made by generate_keys in SUPublicEDKey of its Info.plist;
the private key stays in the keychain of the Mac that signs the updates. The page asks that updates be served over
HTTPS, as App Transport Security requires. `missing-signature` and `insecure-url` lean on it.

### Migrating to EdDSA from DSA (Sparkle)

https://sparkle-project.org/documentation/eddsa-migration/

The page on the move from DSA to EdDSA. DSA signatures are deprecated and kept only while an app moves to EdDSA; after
the move the appcast carries the sparkle:edSignature of each update. `missing-signature` reports an enclosure with only
a sparkle:dsaSignature as one with no EdDSA signature, and says so.

## Tauri

### Updater plugin (Tauri)

https://v2.tauri.app/plugin/updater/

The page on the updater of Tauri. The static JSON file has version, which must be a valid SemVer with or without a
leading v, notes, which is optional, pub_date, which must be RFC 3339 when present, and platforms. Each platform key is
OS-ARCH, with OS linux, darwin or windows and ARCH x86_64, aarch64, i686 or armv7, and each platform has a url and a
signature. The signature is the content of the .sig file the build writes; a path or a URL in its place does not work.
The updater enforces TLS in production, unless a setting lets it accept endpoints that are not HTTPS. A dynamic update
server answers with url, version and signature at the top, or with 204 No Content when there is no update.
`invalid-version`, `missing-platform`, `missing-signature`, `missing-url`, `insecure-url` and `missing-release-notes`
lean on it.

## Squirrel.Windows

### Update Process (Squirrel.Windows docs on GitHub)

https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/update-process.md

The page on how an installed app updates. The update manager downloads the RELEASES file, compares it with its own copy
to find the updates, downloads the packages and checks each against its SHA1 in RELEASES before it applies them.
`missing-hash` and `hash-mismatch` lean on it.

### Staged Rollouts (Squirrel.Windows docs on GitHub)

https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/staged-rollouts.md

The page on staged rollouts, which shows the lines of RELEASES: the SHA1, the name of a full or delta package such as
myapp-1.0.1-full.nupkg and its size. A rollout is set by editing RELEASES by hand, with # and a percentage after the
size; the # must follow the size with no space for clients older than 1.4.0. A release that is pulled must be followed
by a higher version, because users on the pulled version would not take the same version again. `invalid-rollout`,
`duplicate-version`, `size-mismatch` and `version-not-increased` lean on it.

## Versions

### Semantic Versioning

https://semver.org/

The specification of semantic versions. A version is MAJOR.MINOR.PATCH of non-negative integers with no leading
zeros, with an optional pre-release after a hyphen and optional build metadata after a plus. Versions compare part by
part as numbers, a pre-release ranks below its release, identifiers of a pre-release compare one by one with numbers
below words, and build metadata is left out of the comparison. Its answers to common questions say that v1.2.3 is not
a semantic version, though a v is often put in front of a tag. `invalid-version` and `version-not-increased` follow it.

## Formats and the safety of the tool

### RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The memo that describes CSV: each record on its own line, ended by CRLF, an optional header line first, fields
separated by commas, and a field that holds a comma, a double quote or a line break put in double quotes, with a
double quote inside it written twice. `--format csv` writes the findings this way, with CRLF line ends.

### RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON standard. Its section on objects says the names in an object should be unique and that programs behave in
different ways when they are not; the readers of the configuration and of Tauri feeds refuse a repeated name instead of
keeping one of the values. Its section on encoding asks for UTF-8 between systems and lets a reader ignore a byte order
mark; the tool reads UTF-8 and skips a byte order mark.

### CSV Injection (OWASP)

https://community.owasp.org/attacks/CSV_Injection

The page on formulas hidden in CSV files. A spreadsheet may treat a cell that starts with `=`, `+`, `-`, `@`, a tab or
a line break as a formula, and the page warns that no single way of escaping is safe in every program and for every
later reader. The CSV report of the tool puts a single quote in front of such a field, and docs/threat-model.md says
why that is a help and not a guarantee.

### XML External Entity Prevention Cheat Sheet (OWASP)

https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html

The page on XML external entities. A reader that resolves entities from untrusted input can be made to read local
files, reach other systems, or exhaust memory through entities that expand into each other. The safest defence it
names is to turn DTDs off and refuse DOCTYPE declarations. The XML reader of this tool refuses every DOCTYPE and every
entity other than the five of XML, so `unreadable-feed` reports such an appcast and nothing in it is expanded.

### Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The page that describes the `::notice`, `::warning` and `::error` commands with their `file`, `line`, `col` and
`title` properties, which turn a line of output into an annotation on a file. `--format github` writes one such command
per finding, info as a notice, and escapes the characters a command gives a meaning to.
