// A Squirrel.Windows RELEASES file: one package a line, "SHA1 file size", where the file is the name of a full or delta
// package (myapp-1.0.1-full.nupkg) or its address, and a staged rollout adds "# nn%" after the size. The version of each
// line is read from the name of its package. A line that is not of this form makes the whole file unreadable, as it
// does for Squirrel.Windows.

import { FeedError, shown, urlFindings } from './feed.js';
import { urlInfo } from './urls.js';
import { compareVersions, parsePackageVersion } from './versions.js';
import { asciiLower } from './words.js';

const isSha1 = (s) => s.length === 40 && [...s].every((c) => '0123456789abcdefABCDEF'.includes(c));
const isDigits = (s) => /^\d{1,15}$/.test(s);

// The type and version of a package from its file name: { type, parsed } or { reason }.
export function packageOf(name) {
  const lower = asciiLower(name);
  const type = lower.endsWith('-full.nupkg') ? 'full' : lower.endsWith('-delta.nupkg') ? 'delta' : null;
  if (!type) return { reason: 'the name does not end in -full.nupkg or -delta.nupkg' };
  const stem = name.slice(0, name.length - (type === 'full' ? 11 : 12));
  for (let i = stem.indexOf('-'); i > 0; i = stem.indexOf('-', i + 1)) {
    const parsed = parsePackageVersion(stem.slice(i + 1));
    if (!parsed.reason) return { type, parsed };
  }
  return { reason: 'the name holds no version after the id of the app, such as myapp-1.0.1-full.nupkg' };
}

// Reads the text of a RELEASES file named name. lineOf gives the line of an offset.
export function readSquirrel(text, name, lineOf) {
  const findings = [];
  const add = (rule, offset, found) => findings.push({ rule, offset, found });
  const lines = [];
  let start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (let i = start; i <= text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (i === text.length || c === 10 || c === 13) {
      lines.push({ start, text: text.slice(start, i) });
      if (c === 13 && text.charCodeAt(i + 1) === 10) i += 1;
      start = i + 1;
    }
  }
  const packages = [];
  const urls = [];
  const seen = new Map();
  for (const line of lines) {
    if (line.text.trim() === '') continue;
    const hash = line.text.indexOf('#');
    const before = hash < 0 ? line.text : line.text.slice(0, hash);
    const tokens = before.trim().split(/[ \t]+/);
    const places = new Map();
    let from = 0;
    for (const t of tokens) {
      const at = before.indexOf(t, from);
      if (!places.has(t)) places.set(t, line.start + at);
      from = at + t.length;
    }
    const offsetOf = (token) => places.get(token);
    let sha;
    let file;
    let size;
    if (tokens.length === 3) [sha, file, size] = tokens;
    else if (tokens.length === 2 && !isSha1(tokens[0]) && isDigits(tokens[1])) {
      [file, size] = tokens;
      sha = null;
    } else throw new FeedError('a line that is not "SHA1 file size"', line.start);
    if (!isDigits(size)) throw new FeedError(`the size "${shown(size, 30)}" is not a number of bytes`, offsetOf(size));
    const info = urlInfo(file);
    const label = shown(info.name ?? file);
    if (sha === null) add('missing-hash', offsetOf(file), `the line of "${label}" has no SHA1, so Squirrel.Windows cannot check the package`);
    else if (!isSha1(sha)) add('missing-hash', offsetOf(sha), `the SHA1 of "${label}" is not 40 hexadecimal digits`);
    if (info.absolute) urls.push({ value: file, offset: offsetOf(file), download: true });
    if (hash >= 0) {
      const staged = line.text.slice(hash + 1).trim();
      const ok = /^\d{1,3}%$/.test(staged) && Number(staged.slice(0, -1)) <= 100;
      if (!ok) add('invalid-rollout', line.start + hash, `the staged rollout "#${shown(staged, 20)}" is not a percentage from 0% to 100%`);
      else if (/[ \t]$/.test(before)) add('invalid-rollout', line.start + hash, 'a space before # of the staged rollout, which Squirrel.Windows clients older than 1.4.0 do not read');
    }
    const pkg = packageOf(info.name ?? file);
    if (pkg.reason) {
      add('invalid-version', offsetOf(file), `"${label}": ${pkg.reason}`);
      continue;
    }
    const key = `${pkg.type}|${pkg.parsed.parts.map((p) => p.replace(/^0+(?=\d)/, '')).join('.')}-${pkg.parsed.pre.join('.')}`;
    if (seen.has(key)) add('duplicate-version', offsetOf(file), `a ${pkg.type} package of version ${shown(pkg.parsed.text, 40)} appears again; the first is at line ${lineOf(seen.get(key))}`);
    else seen.set(key, offsetOf(file));
    packages.push({ type: pkg.type, parsed: pkg.parsed, url: file, offset: offsetOf(file), size: { value: Number(size), offset: offsetOf(size) }, hash: sha && isSha1(sha) ? { algo: 'sha1', value: sha, offset: offsetOf(sha) } : null });
  }
  if (!lines.some((l) => l.text.trim() !== '')) add('missing-url', 0, 'RELEASES lists no package');
  findings.push(...urlFindings(urls));
  let newest = null;
  for (const p of packages.filter((x) => x.type === 'full')) if (!newest || compareVersions(p.parsed, newest.parsed) > 0) newest = p;
  const downloads = newest ? packages.filter((p) => compareVersions(p.parsed, newest.parsed) === 0).map((p) => ({ url: p.url, offset: p.offset, size: p.size, hash: p.hash })) : [];
  return {
    feed: { kind: 'squirrel', name, version: newest ? { text: newest.parsed.text, parsed: newest.parsed, offset: newest.offset } : null, shownVersion: newest ? newest.parsed.text : null, entries: packages.length, downloads, compare: 'package' },
    findings
  };
}
