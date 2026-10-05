// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists every page with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

const SPARKLE = 'https://sparkle-project.org/documentation';
const SQUIRREL = 'https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using';

export const SOURCES = [
  { id: 'electronAutoUpdate', title: 'Auto Update (electron-builder)', url: 'https://www.electron.build/docs/features/auto-update' },
  { id: 'electronChannels', title: 'Release Using Channels (electron-builder)', url: 'https://www.electron.build/docs/tutorials/release-using-channels' },
  { id: 'sparklePublishing', title: 'Publishing an update (Sparkle)', url: `${SPARKLE}/publishing/` },
  { id: 'sparkleBasics', title: 'Documentation, basic setup and EdDSA signatures (Sparkle)', url: `${SPARKLE}/` },
  { id: 'sparkleEddsa', title: 'Migrating to EdDSA from DSA (Sparkle)', url: `${SPARKLE}/eddsa-migration/` },
  { id: 'tauriUpdater', title: 'Updater plugin (Tauri)', url: 'https://v2.tauri.app/plugin/updater/' },
  { id: 'squirrelUpdate', title: 'Update Process (Squirrel.Windows docs on GitHub)', url: `${SQUIRREL}/update-process.md` },
  { id: 'squirrelStaged', title: 'Staged Rollouts (Squirrel.Windows docs on GitHub)', url: `${SQUIRREL}/staged-rollouts.md` },
  { id: 'semver', title: 'Semantic Versioning', url: 'https://semver.org/' },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'owaspCsv', title: 'CSV Injection (OWASP)', url: 'https://community.owasp.org/attacks/CSV_Injection' },
  { id: 'owaspXxe', title: 'XML External Entity Prevention Cheat Sheet (OWASP)', url: 'https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  electronFeeds: { source: 'electronAutoUpdate', text: 'electron-builder writes latest.yml for Windows, latest-mac.yml for macOS and latest-linux.yml for Linux, and these files must be uploaded with the release for the app to find its update' },
  electronFields: { source: 'electronAutoUpdate', text: 'an update info file holds the version, a files list with the url, sha512 and size of each download, and the release name, notes and date; path and a top-level sha512 are kept for older clients' },
  electronSha512: { source: 'electronAutoUpdate', text: 'electron-updater checks each download against its SHA-512 checksum, and on Windows it also checks the code signature' },
  electronStaging: { source: 'electronAutoUpdate', text: 'a staged rollout is set by hand with stagingPercentage in the update info file, a number from 0 to 100 that is the share of users who get the version' },
  electronNoReuse: { source: 'electronAutoUpdate', text: 'a release that is pulled must be followed by a higher version number, not by the same version released again' },
  electronChannels: { source: 'electronChannels', text: 'the prerelease tag of the version picks the channel, latest, beta or alpha, and each channel gets update info files of its own' },
  sparkleItem: { source: 'sparklePublishing', text: 'an appcast item has sparkle:version, the version the machine compares, sparkle:shortVersionString for people, and an enclosure with the url, length and type of the archive' },
  sparkleNotes: { source: 'sparklePublishing', text: 'release notes of an item come from sparkle:releaseNotesLink or from its description' },
  sparkleMinSystem: { source: 'sparklePublishing', text: 'sparkle:minimumSystemVersion gives the lowest macOS version, written as major.minor.patch' },
  sparklePhased: { source: 'sparklePublishing', text: 'sparkle:phasedRolloutInterval gives the number of seconds between seven groups of users, and the item must then have a pubDate' },
  sparkleKeys: { source: 'sparkleBasics', text: 'an app keeps its EdDSA public key in SUPublicEDKey, every update is signed with the private key, and updates should be served over HTTPS' },
  sparkleEdOnly: { source: 'sparkleEddsa', text: 'DSA signatures are deprecated and kept only for the move to EdDSA; after it, every update in the appcast carries its sparkle:edSignature' },
  tauriFormat: { source: 'tauriUpdater', text: 'the static JSON file needs version, a valid SemVer with or without a leading v, and platforms; notes is optional, and pub_date, when present, is RFC 3339' },
  tauriPlatforms: { source: 'tauriUpdater', text: 'each platform key is OS-ARCH, with OS linux, darwin or windows and ARCH x86_64, aarch64, i686 or armv7, and each platform needs a url and a signature' },
  tauriSignature: { source: 'tauriUpdater', text: 'the signature is the content of the .sig file of the build; a path or a URL in its place does not work' },
  tauriTls: { source: 'tauriUpdater', text: 'the updater enforces TLS in production unless a setting lets it accept endpoints that are not HTTPS' },
  squirrelSha1: { source: 'squirrelUpdate', text: 'the update manager downloads RELEASES, compares it with its own copy, and checks each package against its SHA1 in that file' },
  squirrelLines: { source: 'squirrelStaged', text: 'each line of RELEASES holds the SHA1, the file name and the size of a full or delta package' },
  squirrelStaging: { source: 'squirrelStaged', text: 'a staged rollout adds # and a percentage after the size, with no space before # for clients older than 1.4.0, and a pulled version must be followed by a higher one' },
  semverForm: { source: 'semver', text: 'a version is MAJOR.MINOR.PATCH of non-negative integers with no leading zeros, with an optional pre-release after a hyphen and build metadata after a plus; v1.2.3 is not a semantic version' },
  semverOrder: { source: 'semver', text: 'versions compare part by part as numbers, a pre-release ranks below its release, and build metadata is left out of the comparison' },
  csvRecords: { source: 'rfc4180', text: 'each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice' },
  csvInjection: { source: 'owaspCsv', text: 'a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file' },
  jsonUtf8: { source: 'rfc8259', text: 'JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behavior of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name' },
  xxeDoctype: { source: 'owaspXxe', text: 'the safest defence against XML external entities is to refuse DOCTYPE declarations, which also stops entity expansion that exhausts memory' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest.
export const LEVELS = ['info', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This check reads the feed files and the files beside them on disk and fetches nothing. A finding is a lead with a file and a line, and a clean result is not a signature verification and not a certification (docs/limits.md).';
