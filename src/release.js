// The checks across feeds and files: the versions of the electron-updater feeds of one channel in one folder
// (mixed-versions), the feed files a folder of electron-updater feeds must hold (missing-platform), the version of
// each feed against the previous feed (version-not-increased), and the downloads of the newest version against the
// files of the dist folder (dist-file-missing, size-mismatch, hash-mismatch). A feed here is { file, group,
// fromFolder, kind, name, feed } with the feed of its reader; a finding is { rule, file, offset, found }.

import { kindLabel } from './kinds.js';
import { shown } from './feed.js';
import { grouped, listText } from './size.js';
import { urlInfo } from './urls.js';
import { compareVersions } from './versions.js';
import { asciiLower, byCode } from './words.js';

// The groups of feeds by the folder they sit in, in the order of the folders.
function groups(feeds) {
  const out = new Map();
  for (const f of feeds) {
    if (!out.has(f.group)) out.set(f.group, []);
    out.get(f.group).push(f);
  }
  return [...out.values()];
}

// mixed-versions: each electron-updater feed below the highest version of its channel in its folder.
export function mixedVersionFindings(feeds) {
  const findings = [];
  for (const group of groups(feeds)) {
    const channels = new Map();
    for (const f of group.filter((x) => x.kind === 'electron' && x.feed && x.feed.version)) {
      if (!channels.has(f.feed.channel)) channels.set(f.feed.channel, []);
      channels.get(f.feed.channel).push(f);
    }
    for (const [channel, list] of channels) {
      let top = list[0];
      for (const f of list) if (compareVersions(f.feed.version.parsed, top.feed.version.parsed) > 0) top = f;
      const highest = list.filter((f) => compareVersions(f.feed.version.parsed, top.feed.version.parsed) === 0);
      for (const f of list.filter((x) => !highest.includes(x))) {
        findings.push({ rule: 'mixed-versions', file: f.file, offset: f.feed.version.offset, found: `${shown(f.name, 60)} offers ${shown(f.feed.version.text, 40)}, while ${listText(highest.map((h) => shown(h.name, 60)), 4)} of the channel "${shown(channel, 40)}" ${highest.length === 1 ? 'offers' : 'offer'} ${shown(top.feed.version.text, 40)}` });
      }
    }
  }
  return findings;
}

// missing-platform: the electron-updater feed files of requiredPlatforms.electron that a folder of feeds lacks, when
// it holds at least one electron-updater feed. The finding is placed on the first of them.
export function electronPlatformFindings(feeds, config) {
  const findings = [];
  for (const group of groups(feeds)) {
    const electron = group.filter((f) => f.kind === 'electron' && f.fromFolder).sort((a, b) => byCode(a.name, b.name));
    if (!electron.length) continue;
    const present = new Set(electron.map((f) => asciiLower(f.name)));
    for (const name of config.requiredPlatforms.electron.filter((n) => !present.has(asciiLower(n)))) {
      findings.push({ rule: 'missing-platform', file: electron[0].file, offset: 0, found: `the folder ${shown(electron[0].group, 120)} has no ${shown(name, 60)}, which requiredPlatforms.electron asks for, so the app on that platform finds no update` });
    }
  }
  return findings;
}

// version-not-increased: the newest version of each feed against the feed of the same name in previous, or the one
// feed of its kind there when the input also has one feed of that kind. Returns { findings, unmatched }.
export function previousFindings(feeds, previous) {
  const findings = [];
  let unmatched = 0;
  for (const f of feeds.filter((x) => x.feed && x.feed.version)) {
    let match = previous.find((p) => p.kind === f.kind && asciiLower(p.name) === asciiLower(f.name));
    const sameKind = previous.filter((p) => p.kind === f.kind);
    if (!match && sameKind.length === 1 && feeds.filter((x) => x.kind === f.kind).length === 1) match = sameKind[0];
    if (!match || !match.feed.version) {
      unmatched += 1;
      continue;
    }
    const c = compareVersions(f.feed.version.parsed, match.feed.version.parsed);
    if (c <= 0) {
      findings.push({ rule: 'version-not-increased', file: f.file, offset: f.feed.version.offset, found: `the version ${shown(f.feed.version.text, 40)} is ${c === 0 ? 'the same as' : 'lower than'} ${shown(match.feed.version.text, 40)} in the previous ${kindLabel(match.kind)} feed ${shown(match.file, 160)}, so clients that have it will not update` });
    }
  }
  return { findings, unmatched };
}

// dist-file-missing, size-mismatch and hash-mismatch: the downloads of the newest version of each feed against the dist
// folder. dist is the listing of src/walk.js with its shown path; digest(full, algo) gives { size, digest }.
export async function distFindings(feeds, dist, digest) {
  const findings = [];
  const cache = new Map();
  for (const f of feeds.filter((x) => x.feed)) {
    for (const d of f.feed.downloads) {
      const add = (rule, offset, found) => findings.push({ rule, file: f.file, offset, found });
      const name = urlInfo(d.url).name;
      if (name === null) {
        add('dist-file-missing', d.offset, `the address "${shown(d.url, 200)}" names no file to look for in the dist folder`);
        continue;
      }
      const label = shown(name);
      const full = dist.files.get(name);
      if (full === undefined) {
        let why = `"${label}" is not in the dist folder ${shown(dist.shown, 160)}`;
        if (dist.links.has(name)) why = `"${label}" is a symbolic link in the dist folder, which is not followed`;
        else if (dist.folders.has(name)) why = `"${label}" is a folder in the dist folder, not a file`;
        else if (dist.lower.has(asciiLower(name))) why += `; "${shown(dist.lower.get(asciiLower(name)))}" differs only in the case of its name, and names on a web server keep their case`;
        add('dist-file-missing', d.offset, why);
        continue;
      }
      const algo = d.hash ? d.hash.algo : null;
      const key = `${name}|${algo}`;
      if (!cache.has(key)) {
        try {
          cache.set(key, await digest(full, algo));
        } catch (error) {
          cache.set(key, { error: error.reason ?? error.message });
        }
      }
      const real = cache.get(key);
      if (real.error) {
        add('dist-file-missing', d.offset, `"${label}" in the dist folder cannot be read: ${shown(real.error, 200)}`);
        continue;
      }
      if (d.size && d.size.value !== real.size) add('size-mismatch', d.size.offset, `the feed gives ${grouped(d.size.value)} bytes for "${label}", and the file in the dist folder has ${grouped(real.size)}`);
      if (d.hash) {
        const same = d.hash.algo === 'sha1' ? asciiLower(d.hash.value) === real.digest : d.hash.value === real.digest;
        if (!same) add('hash-mismatch', d.hash.offset, `the ${d.hash.algo === 'sha1' ? 'SHA1' : 'sha512'} of "${label}" does not match the file in the dist folder, so the updater will refuse the download`);
      }
    }
  }
  return findings;
}
