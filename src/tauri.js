// A Tauri updater feed: the static JSON file with version, notes, pub_date and platforms, each platform with a
// signature and a url, read with the strict JSON reader of src/json.js. The answer of a dynamic update server, with
// url, version and signature at the top, is read too. pub_date is passed over, so no date ever changes a result.

import { FeedError, shown, urlFindings } from './feed.js';
import { isObject } from './config.js';
import { lineStarts, parseJson } from './json.js';
import { parseSemver } from './versions.js';

const FEED_JSON = { maxDepth: 32, maxValues: 100000, maxStringLength: 1000000, linesUpTo: 3 };

// A signature that names a file or an address in place of the content of the .sig file.
const looksLikePath = (s) => s.includes('://') || s.endsWith('.sig') || s.startsWith('./') || s.startsWith('../') || s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s);

// Reads the text of a Tauri updater feed named name, with the configuration for the platforms it must cover.
export function readTauri(text, name, config) {
  const { value: root, lines, columns } = parseJson(text, FEED_JSON);
  if (!isObject(root)) throw new FeedError('the feed is not a JSON object with version and platforms', 0);
  const starts = lineStarts(text);
  const at = (path) => (lines.has(path) ? starts[lines.get(path) - 1] + columns.get(path) - 1 : 0);
  const findings = [];
  const add = (rule, offset, found) => findings.push({ rule, offset, found });

  let version = null;
  if (!Object.hasOwn(root, 'version')) add('invalid-version', 0, 'the feed has no version');
  else if (typeof root.version !== 'string') add('invalid-version', at('version'), 'version is not a string');
  else {
    const parsed = parseSemver(root.version.trim(), { leadingV: true });
    if (parsed.reason) add('invalid-version', at('version'), `the version "${shown(root.version)}" is not a semantic version: ${parsed.reason}`);
    else version = { text: root.version.trim(), parsed, offset: at('version') };
  }
  if (!Object.hasOwn(root, 'notes') || typeof root.notes !== 'string' || root.notes.trim() === '') add('missing-release-notes', Object.hasOwn(root, 'notes') ? at('notes') : at('version'), 'the feed has no notes, so the update shows no release notes');

  const entries = [];
  const dynamic = !Object.hasOwn(root, 'platforms') && Object.hasOwn(root, 'url');
  if (dynamic) entries.push({ label: 'the response', key: null, value: root, path: '' });
  else if (!Object.hasOwn(root, 'platforms')) add('missing-url', 0, 'the feed has no platforms, so no app can find its download');
  else if (!isObject(root.platforms)) add('missing-url', at('platforms'), 'platforms is not an object of OS-ARCH keys');
  else {
    for (const key of Object.keys(root.platforms)) entries.push({ label: `the platform "${shown(key, 60)}"`, key, value: root.platforms[key], path: `platforms.${key}` });
    for (const target of config.requiredPlatforms.tauri) {
      if (!Object.hasOwn(root.platforms, target)) add('missing-platform', at('platforms'), `the feed has no platform "${shown(target, 60)}", which requiredPlatforms.tauri asks for, so that platform gets no update`);
    }
  }

  const urls = [];
  const downloads = [];
  const sub = (path, key) => (path ? `${path}.${key}` : key);
  for (const e of entries) {
    if (!isObject(e.value)) {
      add('missing-url', at(e.path), `${e.label} is not an object with signature and url`);
      continue;
    }
    const url = e.value.url;
    if (typeof url !== 'string' || url.trim() === '') add('missing-url', at(e.path), `${e.label} has no url`);
    else {
      urls.push({ value: url.trim(), offset: at(sub(e.path, 'url')), download: true });
      downloads.push({ url: url.trim(), offset: at(sub(e.path, 'url')), size: null, hash: null });
    }
    const sig = e.value.signature;
    if (typeof sig !== 'string' || sig.trim() === '') add('missing-signature', Object.hasOwn(e.value, 'signature') ? at(sub(e.path, 'signature')) : at(e.path), `${e.label} has no signature, so the updater refuses the download`);
    else if (looksLikePath(sig.trim())) add('missing-signature', at(sub(e.path, 'signature')), `the signature of ${e.label.replace(/^the /, '')} is a path or an address, not the content of the .sig file`);
  }
  findings.push(...urlFindings(urls));
  return {
    feed: { kind: 'tauri', name, version, shownVersion: version ? version.text : null, entries: entries.length, downloads, compare: 'semver' },
    findings
  };
}
