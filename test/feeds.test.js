import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedError, JsonError, XmlError, YamlError, packageOf } from '../src/index.js';
import { TAURI_SIG, appcast, configOf, edSig, feedOf, item, lineOf, rulesOf, sha1, sha512, tauri, yml } from './helpers.js';

// The checks of one feed, read in memory, for each of the four kinds, each with the form that is reported and the
// form next to it that is not.

const A = 'https://get.kit.test/clip/Clip-3.0.0.zip';

test('electron: a feed in good order gives no finding, and its version, channel and downloads are read', () => {
  const r = feedOf(yml('1.2.0', ['Kit-1.2.0-mac.zip']), 'electron', 'beta-mac.yml');
  assert.deepEqual(r.findings, []);
  assert.equal(r.feed.version.text, '1.2.0');
  assert.equal(r.feed.channel, 'beta');
  assert.deepEqual(r.feed.downloads.map((d) => [d.url, d.size.value, d.hash.algo]), [['Kit-1.2.0-mac.zip', 22, 'sha512']]);
});

test('electron: missing-hash for a file with no sha512 and for one that is not the base64 of 64 bytes, at the line of each', () => {
  const none = 'version: 1.2.0\nfiles:\n  - url: a.exe\n    size: 3\nreleaseNotes: x\n';
  assert.deepEqual(feedOf(none, 'electron').findings.map((f) => [f.rule, f.line]), [['missing-hash', lineOf(none, 'a.exe')]]);
  const short = `version: 1.2.0\nfiles:\n  - url: a.exe\n    sha512: ${sha1('x')}\nreleaseNotes: x\n`;
  const f = feedOf(short, 'electron').findings;
  assert.deepEqual(f.map((x) => x.rule), ['missing-hash']);
  assert.match(f[0].found, /not the base64 of 64 bytes/);
  assert.deepEqual(rulesOf(`version: 1.2.0\nfiles:\n  - url: a.exe\n    sha512: ${sha512('x')}\nreleaseNotes: x\n`, 'electron'), []);
});

test('electron: path with no entry of files is a download of its own, and its top-level sha512 is needed', () => {
  assert.deepEqual(rulesOf('version: 1.2.0\npath: a.exe\nreleaseNotes: x\n', 'electron'), ['missing-hash']);
  assert.match(feedOf('version: 1.2.0\npath: a.exe\nreleaseNotes: x\n', 'electron').findings[0].found, /top-level sha512 beside path/);
  assert.deepEqual(rulesOf(`version: 1.2.0\npath: a.exe\nsha512: ${sha512('a')}\nreleaseNotes: x\n`, 'electron'), []);
});

test('electron: missing-url for a feed with no files and for an entry with no url', () => {
  assert.deepEqual(rulesOf('version: 1.2.0\nreleaseNotes: x\n', 'electron'), ['missing-url']);
  assert.deepEqual(rulesOf('version: 1.2.0\nfiles: []\nreleaseNotes: x\n', 'electron'), ['missing-url']);
  assert.deepEqual(rulesOf(`version: 1.2.0\nfiles:\n  - sha512: ${sha512('a')}\nreleaseNotes: x\n`, 'electron'), ['missing-url']);
  assert.deepEqual(rulesOf('version: 1.2.0\nfiles:\n  - just-a-name\nreleaseNotes: x\n', 'electron'), ['missing-url']);
  assert.deepEqual(rulesOf('version: 1.2.0\nfiles: a.exe\nreleaseNotes: x\n', 'electron'), ['missing-url']);
});

test('electron: invalid-version for a version that is missing, not semantic or written with a v', () => {
  const ok = (v) => `version: ${v}\npath: a.exe\nsha512: ${sha512('a')}\nreleaseNotes: x\n`;
  for (const v of ['1.2', '1.2.3.4', 'v1.2.3', '01.2.3', '1.2.3-', '1.2.3-01', '1.2.3+', 'latest']) assert.deepEqual(rulesOf(ok(v), 'electron'), ['invalid-version'], v);
  for (const v of ['1.2.3', '0.0.0', '1.2.3-beta.1', '1.2.3-rc.1+build.5', "'10.20.30'"]) assert.deepEqual(rulesOf(ok(v), 'electron'), [], v);
  assert.deepEqual(rulesOf(`path: a.exe\nsha512: ${sha512('a')}\nreleaseNotes: x\n`, 'electron'), ['invalid-version']);
  assert.deepEqual(rulesOf(`version:\n  - 1.2.3\npath: a.exe\nsha512: ${sha512('a')}\nreleaseNotes: x\n`, 'electron'), ['invalid-version']);
});

test('electron: invalid-rollout for a stagingPercentage outside 0 to 100 or not a number, and none for 0, 50 and 100', () => {
  const s = (v) => `version: 1.2.0\npath: a.exe\nsha512: ${sha512('a')}\nreleaseNotes: x\nstagingPercentage: ${v}\n`;
  for (const v of ['101', '120', '-5', 'half', "'50'", '50%', '']) assert.deepEqual(rulesOf(s(v), 'electron'), ['invalid-rollout'], v);
  for (const v of ['0', '50', '100', '12.5']) assert.deepEqual(rulesOf(s(v), 'electron'), [], v);
});

test('electron: missing-release-notes for no notes or empty notes, and none for a text or a list of notes', () => {
  const n = (more) => `version: 1.2.0\npath: a.exe\nsha512: ${sha512('a')}\n${more}`;
  assert.deepEqual(rulesOf(n(''), 'electron'), ['missing-release-notes']);
  assert.deepEqual(rulesOf(n("releaseNotes: ''\n"), 'electron'), ['missing-release-notes']);
  assert.deepEqual(rulesOf(n('releaseNotes: |\n  Faster.\n'), 'electron'), []);
  assert.deepEqual(rulesOf(n('releaseNotes:\n  - version: 1.2.0\n    note: Faster.\n'), 'electron'), []);
});

test('electron: insecure-url and mixed-hosts for absolute addresses, and none for relative names', () => {
  const two = `version: 1.2.0\nfiles:\n  - url: http://a.test/a.exe\n    sha512: ${sha512('a')}\n  - url: https://b.test/b.exe\n    sha512: ${sha512('b')}\nreleaseNotes: x\n`;
  assert.deepEqual(rulesOf(two, 'electron'), ['insecure-url', 'mixed-hosts']);
  const rel = `version: 1.2.0\nfiles:\n  - url: a.exe\n    sha512: ${sha512('a')}\n  - url: sub/b.exe\n    sha512: ${sha512('b')}\nreleaseNotes: x\n`;
  assert.deepEqual(rulesOf(rel, 'electron'), []);
  assert.throws(() => feedOf('- a\n', 'electron'), FeedError);
  assert.throws(() => feedOf('a: [1]\n', 'electron'), YamlError);
});

test('sparkle: an appcast in good order gives no finding, and its newest item and downloads are read', () => {
  const r = feedOf(appcast([item('300', A), item('290', 'https://get.kit.test/clip/Clip-2.9.0.zip')]), 'sparkle');
  assert.deepEqual(r.findings, []);
  assert.equal(r.feed.version.text, '300');
  assert.equal(r.feed.entries, 2);
  assert.deepEqual(r.feed.downloads.map((d) => d.url), [A]);
});

test('sparkle: missing-signature for an enclosure with no edSignature, with a DSA signature only, or one of the wrong length', () => {
  const sig = (attrs) => rulesOf(appcast([item('300', A, undefined, attrs)]), 'sparkle');
  assert.deepEqual(sig('length="5"'), ['missing-signature']);
  assert.match(feedOf(appcast([item('300', A, undefined, 'sparkle:dsaSignature="MCwC"')]), 'sparkle').findings[0].found, /only the deprecated sparkle:dsaSignature/);
  assert.deepEqual(sig(`sparkle:edSignature="${sha1('x')}"`), ['missing-signature']);
  assert.deepEqual(sig('sparkle:edSignature=""'), ['missing-signature']);
  assert.deepEqual(sig(`sparkle:edSignature="${edSig(1)}"`), []);
  const deltas = appcast([item('300', A, '      <sparkle:releaseNotesLink>https://a.test/n</sparkle:releaseNotesLink>\n      <sparkle:deltas>\n        <enclosure url="https://get.kit.test/d.delta" sparkle:deltaFrom="290"/>\n      </sparkle:deltas>\n')]);
  assert.deepEqual(rulesOf(deltas, 'sparkle'), ['missing-signature']);
});

test('sparkle: item-order when the first item is not the highest, compared as numbers, and duplicate-version within a channel', () => {
  const order = appcast([item('99', A), item('100', A)]);
  const f = feedOf(order, 'sparkle').findings;
  assert.deepEqual(f.map((x) => [x.rule, x.line]), [['item-order', lineOf(order, '<sparkle:version>99')]]);
  assert.match(f[0].found, new RegExp(`at line ${lineOf(order, '<sparkle:version>100')} has 100`));
  assert.deepEqual(rulesOf(appcast([item('1.10', A), item('1.9', A)]), 'sparkle'), []);
  const dup = appcast([item('300', A), item('0300', A)]);
  assert.deepEqual(feedOf(dup, 'sparkle').findings.map((x) => [x.rule, x.line]), [['duplicate-version', lineOf(dup, '0300')]]);
  const channels = appcast([item('300', A), item('300', A, '      <sparkle:channel>beta</sparkle:channel>\n      <sparkle:releaseNotesLink>https://a.test/n</sparkle:releaseNotesLink>\n')]);
  assert.deepEqual(rulesOf(channels, 'sparkle'), []);
});

test('sparkle: invalid-version for a missing or non-numeric sparkle:version and a bad minimumSystemVersion; the attribute of the enclosure counts', () => {
  assert.deepEqual(rulesOf(appcast([item('3.0b', A)]), 'sparkle'), ['invalid-version']);
  const noVersion = appcast([`    <item>\n      <description>x</description>\n      <enclosure url="${A}" sparkle:edSignature="${edSig(1)}"/>\n    </item>\n`]);
  assert.deepEqual(rulesOf(noVersion, 'sparkle'), ['invalid-version']);
  const attr = appcast([`    <item>\n      <description>x</description>\n      <enclosure url="${A}" sparkle:version="301" sparkle:edSignature="${edSig(1)}"/>\n    </item>\n`]);
  assert.deepEqual(rulesOf(attr, 'sparkle'), []);
  assert.deepEqual(rulesOf(appcast([item('300', A, '      <description>x</description>\n      <sparkle:minimumSystemVersion>eleven</sparkle:minimumSystemVersion>\n')]), 'sparkle'), ['invalid-version']);
  assert.deepEqual(rulesOf(appcast([item('300', A, '      <description>x</description>\n      <sparkle:minimumSystemVersion>11.0.1</sparkle:minimumSystemVersion>\n')]), 'sparkle'), []);
});

test('sparkle: missing-url for an item with no enclosure unless it is informational, and for an appcast with no item', () => {
  const noEnclosure = appcast(['    <item>\n      <sparkle:version>300</sparkle:version>\n      <description>x</description>\n    </item>\n']);
  assert.deepEqual(rulesOf(noEnclosure, 'sparkle'), ['missing-url']);
  const info = appcast(['    <item>\n      <sparkle:version>300</sparkle:version>\n      <description>x</description>\n      <sparkle:informationalUpdate/>\n    </item>\n']);
  assert.deepEqual(rulesOf(info, 'sparkle'), []);
  assert.deepEqual(rulesOf(appcast([]), 'sparkle'), ['missing-url']);
  assert.deepEqual(rulesOf(appcast([item('300', '', undefined)]), 'sparkle'), ['missing-url']);
});

test('sparkle: invalid-rollout for a phased interval that is not a number above 0 or has no pubDate, missing-release-notes, and the release notes link must be https', () => {
  const phased = (v, pub) => appcast([item('300', A, `      <description>x</description>\n${pub ? '      <pubDate>a date</pubDate>\n' : ''}      <sparkle:phasedRolloutInterval>${v}</sparkle:phasedRolloutInterval>\n`)]);
  assert.deepEqual(rulesOf(phased('86400', true), 'sparkle'), []);
  assert.deepEqual(rulesOf(phased('86400', false), 'sparkle'), ['invalid-rollout']);
  for (const v of ['0', 'a day', '-1', '']) assert.deepEqual(rulesOf(phased(v, true), 'sparkle'), ['invalid-rollout'], v);
  assert.deepEqual(rulesOf(appcast([item('300', A, '')]), 'sparkle'), ['missing-release-notes']);
  assert.deepEqual(rulesOf(appcast([item('300', A, '      <sparkle:releaseNotesLink>http://a.test/notes</sparkle:releaseNotesLink>\n')]), 'sparkle'), ['insecure-url']);
  assert.deepEqual(rulesOf(appcast([item('300', 'ftp://get.kit.test/a.zip')]), 'sparkle'), ['insecure-url']);
});

test('sparkle: an appcast that is not <rss><channel>, or not well formed, cannot be read', () => {
  assert.throws(() => feedOf('<feed/>', 'sparkle'), FeedError);
  assert.throws(() => feedOf('<rss/>', 'sparkle'), FeedError);
  assert.throws(() => feedOf('<!DOCTYPE rss><rss/>', 'sparkle'), XmlError);
});

test('tauri: a feed in good order gives no finding, with a leading v, and its downloads are read', () => {
  const r = feedOf(tauri('v0.4.0'), 'tauri');
  assert.deepEqual(r.findings, []);
  assert.equal(r.feed.version.parsed.parts.join('.'), '0.4.0');
  assert.equal(r.feed.downloads.length, 4);
});

test('tauri: missing-platform for each required target, from the defaults or the configuration, at the line of platforms', () => {
  const text = tauri('0.4.0', { 'windows-x86_64': 'a.exe', 'linux-x86_64': 'a.AppImage' });
  const f = feedOf(text, 'tauri').findings;
  assert.deepEqual(f.map((x) => [x.rule, x.line]), [['missing-platform', lineOf(text, '"platforms"')], ['missing-platform', lineOf(text, '"platforms"')]]);
  assert.match(f[0].found, /"darwin-aarch64"/);
  assert.deepEqual(rulesOf(text, 'tauri', 'x', configOf({ requiredPlatforms: { tauri: ['windows-x86_64'] } })), []);
  assert.deepEqual(rulesOf(text, 'tauri', 'x', configOf({ requiredPlatforms: { tauri: [] } })), []);
});

test('tauri: missing-signature for an empty signature or a path or address in its place, and missing-url for no url', () => {
  const one = (entry) => rulesOf(JSON.stringify({ version: '1.0.0', notes: 'x', platforms: { 'linux-x86_64': entry } }), 'tauri', 'x', configOf({ requiredPlatforms: { tauri: [] } }));
  assert.deepEqual(one({ url: 'https://a.test/a', signature: '' }), ['missing-signature']);
  assert.deepEqual(one({ url: 'https://a.test/a' }), ['missing-signature']);
  for (const s of ['https://a.test/a.sig', 'dist/app.AppImage.sig', './x', '/tmp/x', 'C:\\x.sig']) assert.deepEqual(one({ url: 'https://a.test/a', signature: s }), ['missing-signature'], s);
  assert.deepEqual(one({ url: 'https://a.test/a', signature: TAURI_SIG }), []);
  assert.deepEqual(one({ signature: TAURI_SIG }), ['missing-url']);
  assert.deepEqual(one('https://a.test/a'), ['missing-url']);
  assert.deepEqual(one({ url: 'http://a.test/a', signature: TAURI_SIG }), ['insecure-url']);
});

test('tauri: invalid-version, missing-release-notes, missing platforms, and the answer of a dynamic server', () => {
  const cfg = configOf({ requiredPlatforms: { tauri: [] } });
  assert.deepEqual(rulesOf(JSON.stringify({ version: '1.0', notes: 'x', platforms: {} }), 'tauri', 'x', cfg), ['invalid-version']);
  assert.deepEqual(rulesOf(JSON.stringify({ version: 100, notes: 'x', platforms: {} }), 'tauri', 'x', cfg), ['invalid-version']);
  assert.deepEqual(rulesOf(JSON.stringify({ notes: 'x', platforms: {} }), 'tauri', 'x', cfg), ['invalid-version']);
  assert.deepEqual(rulesOf(JSON.stringify({ version: '1.0.0', platforms: {} }), 'tauri', 'x', cfg), ['missing-release-notes']);
  assert.deepEqual(rulesOf(JSON.stringify({ version: '1.0.0', notes: 'x' }), 'tauri', 'x', cfg), ['missing-url']);
  assert.deepEqual(rulesOf(JSON.stringify({ version: '1.0.0', notes: 'x', platforms: [] }), 'tauri', 'x', cfg), ['missing-url']);
  assert.deepEqual(rulesOf(JSON.stringify({ version: '1.0.0', notes: 'x', url: 'https://a.test/a', signature: TAURI_SIG }), 'tauri'), []);
  assert.throws(() => feedOf('[]', 'tauri'), FeedError);
  assert.throws(() => feedOf('{"version": "1.0.0", "version": "2.0.0"}', 'tauri'), JsonError);
});

test('squirrel: a RELEASES file in good order gives no finding, and the packages of the newest version are its downloads', () => {
  const text = `${sha1('a')} app-1.0.0-full.nupkg 10\n${sha1('b')} app-1.0.1-delta.nupkg 2\n${sha1('c')} app-1.0.1-full.nupkg 11\n`;
  const r = feedOf(text, 'squirrel');
  assert.deepEqual(r.findings, []);
  assert.equal(r.feed.version.text, '1.0.1');
  assert.deepEqual(r.feed.downloads.map((d) => d.url), ['app-1.0.1-delta.nupkg', 'app-1.0.1-full.nupkg']);
  assert.deepEqual(packageOf('my-app-2.0.0-beta.1-full.nupkg').parsed.text, '2.0.0-beta.1');
  assert.equal(packageOf('app-1.0.0.4-delta.nupkg').type, 'delta');
});

test('squirrel: missing-hash, invalid-version, duplicate-version and a line that is not "SHA1 file size"', () => {
  assert.deepEqual(rulesOf('app-1.0.0-full.nupkg 10\n', 'squirrel'), ['missing-hash']);
  assert.deepEqual(rulesOf('ABC app-1.0.0-full.nupkg 10\n', 'squirrel'), ['missing-hash']);
  assert.deepEqual(rulesOf(`${sha1('a')} app-full.nupkg 10\n`, 'squirrel'), ['invalid-version']);
  assert.deepEqual(rulesOf(`${sha1('a')} app-1.0.0.zip 10\n`, 'squirrel'), ['invalid-version']);
  const dup = `${sha1('a')} app-1.0.0-full.nupkg 10\n${sha1('b')} app-1.0.0-full.nupkg 10\n`;
  assert.deepEqual(feedOf(dup, 'squirrel').findings.map((f) => [f.rule, f.line]), [['duplicate-version', 2]]);
  assert.throws(() => feedOf(`${sha1('a')} app-1.0.0-full.nupkg ten\n`, 'squirrel'), FeedError);
  assert.throws(() => feedOf('one two three four\n', 'squirrel'), FeedError);
  assert.deepEqual(rulesOf('\n\n', 'squirrel'), ['missing-url']);
});

test('squirrel: the staged rollout "# nn%" right after the size, and a size that equals part of the SHA1 is placed on the size', () => {
  const s = (tail) => rulesOf(`${sha1('a')} app-1.0.0-full.nupkg 10${tail}\n`, 'squirrel');
  assert.deepEqual(s('# 10%'), []);
  assert.deepEqual(s('#50%'), []);
  assert.deepEqual(s(' # 10%'), ['invalid-rollout']);
  for (const tail of ['# 150%', '# ten', '#']) assert.deepEqual(s(tail), ['invalid-rollout'], tail);
  const hash = '1000000000000000000000000000000000000000';
  const text = `${hash} https://a.test/app-1.0.0-full.nupkg 10\n`;
  const r = feedOf(text, 'squirrel');
  assert.deepEqual(r.findings, []);
  assert.equal(r.feed.downloads[0].size.offset, text.lastIndexOf('10'));
  assert.deepEqual(rulesOf(`${hash} http://a.test/app-1.0.0-full.nupkg 10\n`, 'squirrel'), ['insecure-url']);
});
