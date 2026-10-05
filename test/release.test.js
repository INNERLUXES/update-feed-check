import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distFindings, electronPlatformFindings, mixedVersionFindings, parseSemver, previousFindings } from '../src/index.js';
import { BUILT, GOOD, configOf, findingsOf, goodWith, lineOf, releases, reportOf, sha1, tauri, yml } from './helpers.js';

// The checks across feeds and files: the versions of one channel, the feed files a folder must hold, the previous
// feed and the dist folder, each through a whole run and with a near miss on each side.

const at = (r, rule) => findingsOf(r, rule).map((f) => `${f.file}:${f.line}`);

test('release: the folder in good order passes with every kind read and every download found', async () => {
  const r = await reportOf(GOOD);
  assert.equal(r.code, 0);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.input.byKind, { electron: 3, sparkle: 1, tauri: 1, squirrel: 1 });
  assert.deepEqual(r.input.dist, { folder: 'dist', files: Object.keys(BUILT).length });
  assert.deepEqual(r.feeds.map((f) => [f.file, f.version]), [['rel/RELEASES', '1.2.0'], ['rel/appcast.xml', '300'], ['rel/latest-linux.yml', '1.2.0'], ['rel/latest-mac.yml', '1.2.0'], ['rel/latest.yml', '1.2.0'], ['rel/tray.json', '0.4.0']]);
});

test('release: hash-mismatch and size-mismatch against the dist folder, at the line of the value in the feed', async () => {
  const text = yml('1.2.0', ['Kit-Setup-1.2.0.exe']);
  const r = await reportOf(goodWith({ 'dist/Kit-Setup-1.2.0.exe': 'made-up Windows installer, signed again\n' }));
  assert.deepEqual(at(r, 'hash-mismatch'), [`rel/latest.yml:${lineOf(text, 'sha512')}`]);
  assert.deepEqual(at(r, 'size-mismatch'), [`rel/latest.yml:${lineOf(text, 'size')}`]);
  assert.match(findingsOf(r, 'size-mismatch')[0].found, /gives 26 bytes .* has 40$/);
  const squirrel = await reportOf(goodWith({ 'dist/ledger-1.2.0-full.nupkg': 'changed\n' }));
  assert.deepEqual(findingsOf(squirrel, 'hash-mismatch').map((f) => f.found.slice(0, 12)), ['the SHA1 of ']);
  assert.equal(findingsOf(squirrel, 'size-mismatch').length, 1);
  const lower = await reportOf(goodWith({ 'rel/RELEASES': `${releases([['ledger-1.2.0-full.nupkg']]).toLowerCase()}\n` }));
  assert.deepEqual(lower.findings, [], 'a SHA1 in lowercase matches');
  const sparkle = await reportOf(goodWith({ 'dist/Clip-3.0.0.zip': 'another archive\n' }));
  assert.deepEqual(sparkle.findings.map((f) => f.rule), ['size-mismatch']);
});

test('release: dist-file-missing for a file that is not there, a name that differs in case, and an address with no file name', async () => {
  const r = await reportOf(goodWith({ 'dist/Tray_linux.AppImage': null, 'dist/kit-1.2.0.appimage': BUILT['dist/Kit-1.2.0.AppImage'], 'dist/Kit-1.2.0.AppImage': null }));
  const found = findingsOf(r, 'dist-file-missing').map((f) => f.found);
  assert.equal(found.length, 2);
  assert.match(found[0], /"Kit-1\.2\.0\.AppImage" is not in the dist folder dist; "kit-1\.2\.0\.appimage" differs only in the case of its name/);
  assert.match(found[1], /"Tray_linux\.AppImage" is not in the dist folder dist$/);
  const noName = await reportOf(goodWith({ 'rel/tray.json': tauri('0.4.0', { 'windows-x86_64': '', 'darwin-aarch64': 'Tray_mac_arm.tar.gz', 'darwin-x86_64': 'Tray_mac_x64.tar.gz', 'linux-x86_64': 'Tray_linux.AppImage' }) }));
  assert.match(findingsOf(noName, 'dist-file-missing')[0].found, /names no file/);
  const folder = await reportOf(goodWith({ 'dist/Clip-3.0.0.zip': null, 'dist/Clip-3.0.0.zip/x': 'x' }));
  assert.match(findingsOf(folder, 'dist-file-missing')[0].found, /is a folder in the dist folder/);
});

test('release: only the downloads of the newest version are looked for in the dist folder', async () => {
  const r = await reportOf(goodWith({ 'rel/RELEASES': `${sha1('old')} ledger-1.1.0-full.nupkg 9\n${releases([['ledger-1.2.0-delta.nupkg'], ['ledger-1.2.0-full.nupkg']])}\n` }));
  assert.deepEqual(r.findings, []);
});

test('release: without --dist no file is compared and the report says so', async () => {
  const r = await reportOf(goodWith({ 'dist/Kit-Setup-1.2.0.exe': 'changed\n' }), ['rel']);
  assert.deepEqual(r.findings, []);
  assert.equal(r.input.dist, null);
});

test('release: mixed-versions for an electron-updater feed below the others of its channel, and none across channels or kinds', async () => {
  const text = yml('1.1.9', ['Kit-1.2.0.AppImage']);
  const r = await reportOf(goodWith({ 'rel/latest-linux.yml': text }), ['rel']);
  assert.deepEqual(at(r, 'mixed-versions'), [`rel/latest-linux.yml:${lineOf(text, '1.1.9')}`]);
  assert.match(findingsOf(r, 'mixed-versions')[0].found, /latest-linux\.yml offers 1\.1\.9, while latest-mac\.yml and latest\.yml of the channel "latest" offer 1\.2\.0/);
  const beta = await reportOf(goodWith({ 'rel/beta.yml': yml('1.3.0-beta.1', ['Kit-Setup-1.2.0.exe']) }), ['rel']);
  assert.deepEqual(findingsOf(beta, 'mixed-versions'), []);
  assert.deepEqual(findingsOf(await reportOf(goodWith({ 'rel/tray.json': tauri('9.0.0') }), ['rel']), 'mixed-versions'), []);
});

test('release: missing-platform for the electron-updater feed files a folder lacks, only for a folder, and off with an empty list', async () => {
  const r = await reportOf(goodWith({ 'rel/latest-linux.yml': null }), ['rel']);
  assert.deepEqual(at(r, 'missing-platform'), ['rel/latest-mac.yml:1']);
  assert.match(findingsOf(r, 'missing-platform')[0].found, /the folder rel has no latest-linux\.yml, which requiredPlatforms\.electron asks for/);
  assert.deepEqual(findingsOf(await reportOf(goodWith({ 'rel/latest-linux.yml': null }), ['rel/latest.yml', 'rel/latest-mac.yml']), 'missing-platform'), []);
  const off = await reportOf(goodWith({ 'rel/latest-linux.yml': null, 'c.json': '{"requiredPlatforms": {"electron": []}}' }), ['rel', '--config', 'c.json']);
  assert.deepEqual(findingsOf(off, 'missing-platform'), []);
  const noElectron = await reportOf(goodWith({ 'rel/latest.yml': null, 'rel/latest-mac.yml': null, 'rel/latest-linux.yml': null }), ['rel']);
  assert.deepEqual(findingsOf(noElectron, 'missing-platform'), []);
});

test('release: version-not-increased against the feed of the same name, or the one feed of the kind, in --previous', async () => {
  const prev = { 'old/latest.yml': yml('1.2.0', ['Kit-Setup-1.2.0.exe']), 'old/latest-mac.yml': yml('1.1.0', ['Kit-1.2.0-mac.zip']), 'old/other.json': tauri('0.5.0'), 'old/appcast.xml': GOOD['rel/appcast.xml'].replace('>300<', '>301<').replace('>290<', '>280<') };
  const r = await reportOf(goodWith(prev), ['rel', '--previous', 'old']);
  assert.deepEqual(findingsOf(r, 'version-not-increased').map((f) => [f.file, f.found.slice(0, 40)]), [
    ['rel/appcast.xml', 'the version 300 is lower than 301 in the'],
    ['rel/latest.yml', 'the version 1.2.0 is the same as 1.2.0 i'],
    ['rel/tray.json', 'the version 0.4.0 is lower than 0.5.0 in']
  ]);
  assert.match(r.notes.join('\n'), /2 feeds have no feed of the same name or kind in --previous/);
  assert.deepEqual(r.input.previous, { path: 'old', feeds: 4 });
  const file = await reportOf(goodWith({ 'old.json': tauri('0.3.9') }), ['rel', '--previous', 'old.json']);
  assert.deepEqual(findingsOf(file, 'version-not-increased'), []);
});

test('release: versions compare by semver.org, a pre-release below its release and build metadata left out', async () => {
  const prev = (v) => goodWith({ 'old/latest.yml': yml(v, ['Kit-Setup-1.2.0.exe']) });
  assert.equal(findingsOf(await reportOf(prev('1.2.0-rc.1'), ['rel', '--previous', 'old']), 'version-not-increased').length, 0);
  assert.equal(findingsOf(await reportOf(prev('1.2.0+build.9'), ['rel', '--previous', 'old']), 'version-not-increased').length, 1);
  assert.equal(findingsOf(await reportOf(prev('1.10.0'), ['rel', '--previous', 'old']), 'version-not-increased').length, 1);
});

test('release: the functions across feeds work on feeds read in memory', async () => {
  const v = (t) => ({ text: t, parsed: parseSemver(t), offset: 0 });
  const f = (name, version, group = 'r') => ({ file: `${group}/${name}`, group, fromFolder: true, kind: 'electron', name, feed: { channel: 'latest', version: v(version), downloads: [] } });
  assert.equal(mixedVersionFindings([f('latest.yml', '2.0.0'), f('latest-mac.yml', '1.0.0'), f('latest-linux.yml', '1.0.0', 's')]).length, 1);
  assert.deepEqual(electronPlatformFindings([f('latest.yml', '1.0.0')], configOf()).map((x) => x.found.match(/no ([^ ,]+)/)[1]), ['latest-mac.yml', 'latest-linux.yml']);
  assert.equal(previousFindings([f('latest.yml', '1.0.0')], [f('latest.yml', '1.0.1', 'old')]).findings.length, 1);
  const dist = { shown: 'd', files: new Map([['a.exe', 'full']]), lower: new Map(), links: new Set(['b.exe']), folders: new Set() };
  const feed = { ...f('latest.yml', '1.0.0'), feed: { downloads: [{ url: 'a.exe', offset: 0, size: { value: 3, offset: 0 }, hash: null }, { url: 'b.exe', offset: 0, size: null, hash: null }] } };
  const found = await distFindings([feed], dist, async () => ({ size: 4, digest: null }));
  assert.deepEqual(found.map((x) => x.rule), ['size-mismatch', 'dist-file-missing']);
  assert.match(found[1].found, /symbolic link/);
  const unreadable = await distFindings([feed], dist, async () => {
    throw Object.assign(new Error('x'), { reason: 'not a regular file' });
  });
  assert.match(unreadable[0].found, /cannot be read: not a regular file/);
});
