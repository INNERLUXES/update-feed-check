// The rules and the result. Each rule names the points of the public pages it rests on (src/data.js), says where it is
// the tool's own choice, and what to change before the release goes out. docs/method.md says exactly what each rule
// looks at and what it cannot see. The checks of one feed are in src/electron.js, src/sparkle.js, src/tauri.js and
// src/squirrel.js, and the checks across feeds and files in src/release.js.

import { LEVELS } from './data.js';
import { grouped, listText, plural } from './size.js';

export const RULES = [
  {
    id: 'missing-hash',
    key: 'missingHash',
    title: 'a download has no checksum, or one of the wrong form',
    basis: ['electronSha512', 'squirrelSha1'],
    own: 'an entry of files, or a path with no entry of files, with no sha512 or with a sha512 that is not the base64 of 64 bytes, and a line of RELEASES with no SHA1 of 40 hexadecimal digits; Sparkle and Tauri feeds carry signatures, not checksums, and are checked by missing-signature',
    rule: () => 'a download of an electron-updater feed with no sha512, or a package of RELEASES with no SHA1',
    fix: 'build the feed again with the tool that made it, so that each download has its checksum, rather than writing the value by hand'
  },
  {
    id: 'missing-signature',
    key: 'missingSignature',
    title: 'a download has no signature, or one of the wrong form',
    basis: ['sparkleEdOnly', 'sparkleKeys', 'tauriSignature'],
    own: 'an enclosure of an appcast, delta enclosures too, with no sparkle:edSignature or one that is not the base64 of 64 bytes, and a Tauri platform with no signature or with a path or address in its place; the tool cannot check a signature against the public key of the app',
    rule: () => 'an appcast enclosure with no EdDSA signature, or a Tauri platform with no signature',
    fix: 'sign the archive with the private key of the app (generate_appcast for Sparkle, the signer of the Tauri CLI) and put the signature itself in the feed'
  },
  {
    id: 'missing-url',
    key: 'missingUrl',
    title: 'an entry offers no download',
    basis: ['electronFields', 'sparkleItem', 'tauriPlatforms'],
    own: 'a feed with no file to download, an entry of files or a Tauri platform with no url, an appcast item with no enclosure unless it is a sparkle:informationalUpdate, an enclosure with no url, an appcast with no item and a RELEASES file with no package',
    rule: () => 'a feed or an entry of it that names no file to download',
    fix: 'add the address of the download to the entry, or take the entry out of the feed'
  },
  {
    id: 'insecure-url',
    key: 'insecureUrl',
    title: 'an address does not use https',
    basis: ['tauriTls', 'sparkleKeys'],
    own: 'every absolute address of a download, a release notes link or a package of RELEASES whose scheme is not https; an address with no scheme is relative to the feed and is served the way the feed is; namespace declarations of XML are not addresses and are not read',
    rule: () => 'an absolute address of a download or of release notes that is not https',
    fix: 'serve the file over https and write the https address in the feed'
  },
  {
    id: 'mixed-hosts',
    key: 'mixedHosts',
    title: 'the downloads of one feed sit on more than one host',
    basis: ['electronFields', 'sparkleItem', 'tauriPlatforms'],
    own: 'the tool\'s own choice: every absolute download address of a feed whose host differs from the host of the first one; release notes links are not counted; a second host is often a leftover of an old server or a typo',
    rule: () => 'a download on another host than the first download of the same feed',
    fix: 'serve every download of the release from one host, or check that each host is one you run and that it holds the file'
  },
  {
    id: 'invalid-version',
    key: 'invalidVersion',
    title: 'a version is missing or not valid',
    basis: ['semverForm', 'tauriFormat', 'sparkleItem', 'sparkleMinSystem'],
    own: 'an electron-updater version that is not a semantic version, a Tauri version that is not one with or without a leading v, a sparkle:version or sparkle:minimumSystemVersion that is not numbers separated by dots, and a package of RELEASES with no version of three or four numbers in its name',
    rule: () => 'a version that the updater cannot read or compare',
    fix: 'write the version as the updater compares it: MAJOR.MINOR.PATCH for electron-updater and Tauri, a build number of digits and dots for sparkle:version, name-1.2.3-full.nupkg for Squirrel.Windows'
  },
  {
    id: 'item-order',
    key: 'itemOrder',
    title: 'the newest item of an appcast is not the first',
    basis: ['sparkleItem'],
    own: 'the tool\'s own choice: the first item of an appcast must have the highest sparkle:version; Sparkle picks the best item itself, but people, other tools and scripts that read the appcast take the first item as the newest',
    rule: () => 'an appcast whose first item is not the one with the highest sparkle:version',
    fix: 'put the items in order, newest first, as generate_appcast writes them'
  },
  {
    id: 'duplicate-version',
    key: 'duplicateVersion',
    title: 'one version is offered twice',
    basis: ['sparkleItem', 'squirrelLines'],
    own: 'two appcast items with the same sparkle:version in the same sparkle:channel, compared as numbers, and two full or two delta packages of RELEASES with the same version',
    rule: () => 'the same version in two entries of one feed',
    fix: 'keep one entry for each version, and give a rebuilt release a higher version'
  },
  {
    id: 'version-not-increased',
    key: 'versionNotIncreased',
    title: 'the version does not go up from the previous feed',
    basis: ['electronNoReuse', 'squirrelStaging', 'semverOrder'],
    own: 'only with --previous: the newest version of a feed against the newest version of the feed of the same name in --previous, or of the one feed of the same kind there; equal or lower is reported, because clients that have the previous version will not take it',
    rule: () => 'a version that is equal to or lower than the one of the previous feed',
    fix: 'give the release a version higher than the one already published; never publish a version again with other files'
  },
  {
    id: 'dist-file-missing',
    key: 'distFileMissing',
    title: 'a download is not in the dist folder',
    basis: ['electronFeeds', 'squirrelLines'],
    own: 'only with --dist: the file named by the last part of the address of each download of the newest version is looked for in the top of the dist folder, by its exact name; a file that differs only in the case of its name, a symbolic link, a folder and a file that cannot be read are reported too',
    rule: () => 'a file the feed offers that is not in the dist folder',
    fix: 'upload the file with the feed, or correct its name in the feed; names on a web server are compared with their case'
  },
  {
    id: 'size-mismatch',
    key: 'sizeMismatch',
    title: 'the size in the feed is not the size of the file',
    basis: ['electronFields', 'sparkleItem', 'squirrelLines'],
    own: 'only with --dist: the size of an entry of files, the length of an appcast enclosure and the size of a line of RELEASES, against the size of the file in the dist folder',
    rule: () => 'a size or length in the feed that differs from the file in the dist folder',
    fix: 'build the feed again from the files that are uploaded, so that the sizes and checksums are theirs'
  },
  {
    id: 'hash-mismatch',
    key: 'hashMismatch',
    title: 'the checksum in the feed is not the checksum of the file',
    basis: ['electronSha512', 'squirrelSha1'],
    own: 'only with --dist: the sha512 of an electron-updater feed (base64) and the SHA1 of RELEASES (hexadecimal, of any case) against the file in the dist folder, worked out with node:crypto; a mismatch means the updater will refuse the download',
    rule: () => 'a checksum in the feed that differs from the one of the file in the dist folder',
    fix: 'build the feed again from the files that are uploaded; a file signed or changed after the feed was written needs a new checksum'
  },
  {
    id: 'missing-platform',
    key: 'missingPlatform',
    title: 'a platform the release must cover has no feed or entry',
    basis: ['tauriPlatforms', 'electronFeeds'],
    own: 'a Tauri feed with no key of requiredPlatforms.tauri, and a folder of feeds that holds an electron-updater feed but not every file of requiredPlatforms.electron; files named one by one are not checked for the files beside them',
    rule: (config) => `a Tauri feed without one of ${listText(config.requiredPlatforms.tauri, 4) || 'no platform'}, or a folder without one of ${listText(config.requiredPlatforms.electron, 3) || 'no file'}`,
    fix: 'add the platform to the release, or take it out of requiredPlatforms when the app is not built for it'
  },
  {
    id: 'invalid-rollout',
    key: 'invalidRollout',
    title: 'a staged or phased rollout is not valid',
    basis: ['electronStaging', 'sparklePhased', 'squirrelStaging'],
    own: 'a stagingPercentage that is not a number from 0 to 100, a sparkle:phasedRolloutInterval that is not a whole number of seconds above 0 or that has no pubDate in its item, and a "# nn%" of RELEASES that is not from 0% to 100% or has a space before #',
    rule: () => 'a rollout value that the updater cannot use',
    fix: 'write the share as a number from 0 to 100 (a percentage for Squirrel.Windows, with # right after the size), and give a phased Sparkle item its pubDate'
  },
  {
    id: 'mixed-versions',
    key: 'mixedVersions',
    title: 'the feeds of one channel offer different versions',
    basis: ['electronFeeds', 'electronChannels'],
    own: 'the electron-updater feeds of one folder and one channel (latest.yml, latest-mac.yml and latest-linux.yml are the channel latest); each feed below the highest version of its channel is reported; Sparkle, Tauri and Squirrel.Windows feeds each hold one app and are not compared with others',
    rule: () => 'an electron-updater feed whose version is lower than another feed of the same channel in the folder',
    fix: 'upload the feeds of every platform of the release together, or note why one platform stays behind'
  },
  {
    id: 'missing-release-notes',
    key: 'missingReleaseNotes',
    title: 'an update has no release notes',
    basis: ['electronFields', 'sparkleNotes', 'tauriFormat'],
    own: 'an electron-updater feed with no releaseNotes, an appcast item with no sparkle:releaseNotesLink, sparkle:fullReleaseNotesLink or description, and a Tauri feed with no notes; RELEASES has no place for notes',
    rule: () => 'an update with no release notes in the feed',
    fix: 'add release notes so that users see what the update changes'
  },
  {
    id: 'unreadable-feed',
    key: null,
    title: 'a feed that cannot be read',
    basis: ['xxeDoctype', 'jsonRepeatedNames'],
    own: 'a file over its size limit, a binary file, a file that is not valid UTF-8, and a feed that its reader refuses: YAML outside the subset read, XML with a DOCTYPE or not well formed, JSON that is not strict or repeats a name, a line of RELEASES that is not "SHA1 file size"; nothing in it is checked; this rule cannot be set lower or off',
    rule: () => 'a feed file that the tool could not read as its kind',
    fix: 'save the feed as UTF-8 in the form its updater reads, or name the right kind with --kind'
  },
  {
    id: 'scan-limit',
    key: null,
    title: 'the input is larger than the limits of a run',
    basis: ['xxeDoctype'],
    own: 'a folder with more entries, or more feeds in all, than the limits of docs/limits.md; the rest is not read, so the run fails; this rule cannot be set lower or off',
    rule: () => 'a folder or a set of inputs past a limit of the run',
    fix: 'check each release folder in its own run'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at or above the level failOn. { pass, failOn, failing, byLevel, text }.
export function decide(findings, failOn) {
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const counts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${grouped(byLevel[l])} ${l}`);
  const text = failing
    ? `FAIL - ${plural(failing, 'finding')} at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`
    : `PASS - no finding at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`;
  return { pass: failing === 0, failOn, failing, byLevel, text };
}
