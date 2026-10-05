// The kinds of feed the tool reads, and the kind of a file from its name. A file named on the command line or found in
// a folder is read when its name says what it is, or as the kind given with --kind. The names of the build files of
// electron-builder (builder-debug.yml, builder-effective-config.yaml) and the files an app carries inside it
// (app-update.yml, dev-app-update.yml) are not feeds and are passed over.

import { asciiLower } from './words.js';

export const KINDS = [
  { kind: 'electron', label: 'electron-updater', names: 'latest.yml, latest-mac.yml, latest-linux.yml and other .yml or .yaml files' },
  { kind: 'sparkle', label: 'Sparkle', names: '.xml and .rss files' },
  { kind: 'tauri', label: 'Tauri', names: '.json files' },
  { kind: 'squirrel', label: 'Squirrel.Windows', names: 'files named RELEASES' }
];

export const kindLabel = (kind) => KINDS.find((k) => k.kind === kind)?.label ?? kind;

const NOT_FEEDS = ['app-update.yml', 'dev-app-update.yml'];

// The kind of a file from its name, or null when the name is not one of a feed.
export function fileKind(name) {
  const lower = asciiLower(name);
  if (lower === 'releases') return 'squirrel';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return lower.startsWith('builder-') || NOT_FEEDS.includes(lower) ? null : 'electron';
  if (lower.endsWith('.xml') || lower.endsWith('.rss')) return 'sparkle';
  if (lower.endsWith('.json')) return 'tauri';
  return null;
}

// The suffixes electron-updater puts after the channel in the name of a feed, longest first.
const PLATFORM_SUFFIXES = ['-linux-arm64', '-linux-armv7l', '-mac', '-linux'];

// The channel of an electron-updater feed from its name: "latest-mac.yml" is the channel "latest", "beta.yml" is
// "beta".
export function channelOf(name) {
  const lower = asciiLower(name);
  const stem = lower.slice(0, lower.lastIndexOf('.'));
  const suffix = PLATFORM_SUFFIXES.find((s) => stem.endsWith(s) && stem.length > s.length);
  return suffix ? stem.slice(0, -suffix.length) : stem;
}
