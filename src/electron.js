// An electron-updater feed (latest.yml, latest-mac.yml, latest-linux.yml and the files of other channels), read with
// the YAML reader of src/yaml.js. The fields read are version, files with url, sha512 and size of each download, the
// older path and top-level sha512, stagingPercentage and releaseNotes; releaseDate and releaseName are passed over, so
// no date ever changes a result.

import { FeedError, base64Bytes, shown, urlFindings } from './feed.js';
import { channelOf } from './kinds.js';
import { urlInfo } from './urls.js';
import { parseSemver } from './versions.js';
import { entryOf, parseYaml } from './yaml.js';

const isScalar = (node) => node && node.type === 'scalar';
const hasValue = (node) => isScalar(node) && node.style !== 'empty' && node.value.trim() !== '';
const DIGITS = /^\d{1,15}$/;
const PERCENT = /^\d{1,3}(?:\.\d{1,6})?$/;

// Reads the text of an electron-updater feed named name.
export function readElectron(text, name) {
  const root = parseYaml(text);
  if (root.type !== 'map') throw new FeedError('the feed is a list, not a mapping of keys such as version and files', root.offset);
  const findings = [];
  const add = (rule, offset, found) => findings.push({ rule, offset, found });
  const get = (key) => entryOf(root, key);

  let version = null;
  const v = get('version');
  if (!v || !hasValue(v.value)) add('invalid-version', v ? v.keyOffset : root.offset, 'the feed has no version');
  else if (!isScalar(v.value)) add('invalid-version', v.keyOffset, 'version is not a single value');
  else {
    const parsed = parseSemver(v.value.value.trim());
    if (parsed.reason) add('invalid-version', v.value.offset, `the version "${shown(v.value.value)}" is not a semantic version: ${parsed.reason}`);
    else version = { text: v.value.value.trim(), parsed, offset: v.value.offset };
  }

  const entries = [];
  let reported = false;
  const files = get('files');
  if (files && files.value.type === 'seq') {
    for (const item of files.value.items) {
      if (item.type !== 'map') {
        add('missing-url', item.offset, 'an entry of files is not a mapping with url, sha512 and size');
        reported = true;
        continue;
      }
      entries.push({ offset: item.offset, url: entryOf(item, 'url'), sha512: entryOf(item, 'sha512'), size: entryOf(item, 'size') });
    }
  } else if (files && hasValue(files.value)) {
    add('missing-url', files.value.offset, 'files is not a list of downloads');
    reported = true;
  }
  const path = get('path');
  if (path && hasValue(path.value) && !entries.some((e) => e.url && isScalar(e.url.value) && e.url.value.value.trim() === path.value.value.trim())) {
    entries.push({ offset: path.keyOffset, url: { value: path.value }, sha512: get('sha512'), size: null, legacy: true });
  }
  if (!entries.length && !reported) add('missing-url', files ? files.keyOffset : root.offset, 'the feed names no file to download: files is missing or empty and there is no path');

  const urls = [];
  const downloads = [];
  for (const e of entries) {
    if (!e.url || !hasValue(e.url.value)) {
      add('missing-url', e.offset, 'an entry of files has no url');
      continue;
    }
    const url = e.url.value.value.trim();
    const where = e.url.value.offset;
    urls.push({ value: url, offset: where, download: true });
    const label = shown(urlInfo(url).name ?? url);
    let hash = null;
    const field = e.legacy ? 'top-level sha512 beside path' : 'sha512';
    if (!e.sha512 || !hasValue(e.sha512.value)) add('missing-hash', where, `the file "${label}" has no ${field}, so electron-updater cannot check the download`);
    else if (base64Bytes(e.sha512.value.value) !== 64) add('missing-hash', e.sha512.value.offset, `the sha512 of "${label}" is not the base64 of 64 bytes, the length of a SHA-512 checksum`);
    else hash = { algo: 'sha512', value: e.sha512.value.value.trim(), offset: e.sha512.value.offset };
    let size = null;
    if (e.size && isScalar(e.size.value) && DIGITS.test(e.size.value.value.trim())) size = { value: Number(e.size.value.value.trim()), offset: e.size.value.offset };
    downloads.push({ url, name: urlInfo(url).name, offset: where, size, hash });
  }
  findings.push(...urlFindings(urls));

  const staging = get('stagingPercentage');
  if (staging) {
    const s = staging.value;
    const ok = isScalar(s) && s.style === 'plain' && PERCENT.test(s.value) && Number(s.value) <= 100;
    if (!ok) add('invalid-rollout', s.offset, `stagingPercentage is ${isScalar(s) && s.style !== 'empty' ? `"${shown(s.value, 40)}"` : 'not a number'}, not a number from 0 to 100`);
  }

  const notes = get('releaseNotes');
  const hasNotes = notes && (hasValue(notes.value) || (notes.value.type === 'seq' && notes.value.items.length > 0));
  if (!hasNotes) add('missing-release-notes', notes ? notes.keyOffset : (v ? v.keyOffset : root.offset), 'the feed has no releaseNotes, so the update dialog shows none');

  return {
    feed: { kind: 'electron', name, channel: channelOf(name), version, shownVersion: version ? version.text : null, entries: entries.length, downloads, compare: 'semver' },
    findings
  };
}
