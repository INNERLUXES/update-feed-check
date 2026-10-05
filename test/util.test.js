import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { FILE_LIMITS, KINDS, MAX_VERSION_LENGTH, OPEN_FLAGS, RULES, WALK_LIMITS, asciiLower, atOrAbove, base64Bytes, baseName, byCode, capped, channelOf, checkPaths, compareDigits, compareVersions, decide, defaultConfig, digestFile, displayPath, fileError, fileKind, fileNameOf, flat, folderOf, grouped, inspectPath, joinPath, kindLabel, levelOf, listDist, listFolder, listText, parseDotted, parsePackageVersion, parseSemver, plural, readBounded, readFeed, readTextFile, ruleById, safeText, shown, textOf, urlFindings, urlInfo, versionText } from '../src/index.js';
import { GOOD, sha1, sha512, withFiles } from './helpers.js';

test('versions: semantic versions as semver.org writes them, with the reason when one is not', () => {
  assert.deepEqual(parseSemver('1.2.3-rc.1+build.5'), { parts: ['1', '2', '3'], pre: ['rc', '1'], build: ['build', '5'], text: '1.2.3-rc.1+build.5' });
  assert.equal(parseSemver('v1.2.3', { leadingV: true }).text, 'v1.2.3');
  for (const [v, reason] of [['', /empty/], ['v1.2.3', /leading v/], ['1.2', /three numbers/], ['1.02.3', /leading zero/], ['1.2.3-01', /leading zero/], ['1.2.3-a..b', /empty part/], ['1.2.3+a_b', /build metadata/], ['1.2.3x', /three numbers/], ['9'.repeat(MAX_VERSION_LENGTH + 1), /longer than/]]) assert.match(parseSemver(v).reason, reason, v);
  assert.deepEqual(parseDotted(' 1.10.2 ').parts, ['1', '10', '2']);
  assert.match(parseDotted('1.x').reason, /not a number/);
  assert.match(parseDotted('').reason, /empty/);
  assert.deepEqual(parsePackageVersion('1.2.3.4').parts, ['1', '2', '3', '4']);
  assert.match(parsePackageVersion('1.2').reason, /three or four numbers/);
  assert.equal(versionText(parseSemver('1.2.3-beta+x')), '1.2.3-beta');
});

test('versions: the order of semver.org, numbers of any length and a missing number counted as 0', () => {
  const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '2.0.0', '2.1.0', '2.1.1', '99999999999999999999.0.0'];
  for (let i = 1; i < order.length; i += 1) {
    assert.equal(compareVersions(parseSemver(order[i - 1]), parseSemver(order[i])), -1, `${order[i - 1]} < ${order[i]}`);
    assert.equal(compareVersions(parseSemver(order[i]), parseSemver(order[i - 1])), 1);
  }
  assert.equal(compareVersions(parseSemver('1.0.0+a'), parseSemver('1.0.0+b')), 0);
  assert.equal(compareVersions(parseDotted('1.2'), parseDotted('1.2.0')), 0);
  assert.equal(compareVersions(parseDotted('1.10'), parseDotted('1.9')), 1);
  assert.equal(compareDigits('007', '7'), 0);
  assert.equal(compareDigits('10', '9'), 1);
});

test('urls: absolute and relative addresses, their host and the name of their file', () => {
  assert.deepEqual(urlInfo('https://Get.Kit.TEST/a/b%20c.exe?x=1#y'), { absolute: true, scheme: 'https', host: 'get.kit.test', https: true, name: 'b c.exe' });
  assert.deepEqual(urlInfo('Kit-1.0.0.exe'), { absolute: false, scheme: '', host: '', https: false, name: 'Kit-1.0.0.exe' });
  assert.equal(urlInfo('HTTP://a.test/x').scheme, 'http');
  assert.equal(urlInfo('file:///C:/x/a.exe').https, false);
  assert.equal(urlInfo('https://[bad').host, '');
  for (const p of ['', 'a/', 'a/..', 'a/%2F', 'a/%5C', '.']) assert.equal(fileNameOf(p), null, p);
  assert.equal(fileNameOf('a\\b.exe'), 'b.exe');
  assert.equal(fileNameOf('a/%E0%A4%A.exe'), '%E0%A4%A.exe');
  assert.deepEqual(urlFindings([{ value: 'https://a.test/x', offset: 0, download: true }, { value: 'https://b.test/y', offset: 5, download: false }]), []);
});

test('feeds: base64 of a given number of bytes, and values shown short', () => {
  assert.equal(base64Bytes(sha512('x')), 64);
  assert.equal(base64Bytes('YQ=='), 1);
  assert.equal(base64Bytes('YWI='), 2);
  for (const v of ['', 'YQ=', 'Y Q==', 'YQ==YQ==', 'Y*==', 'YR==']) assert.equal(base64Bytes(v), -1, v);
  assert.equal(base64Bytes(sha1('x')), 30, 'forty hexadecimal digits are base64 of 30 bytes, not 64');
  assert.equal(shown('x'.repeat(200), 10), 'xxxxxxx...');
});

test('kinds: the kind of a file from its name, the channel of an electron-updater feed and the labels', () => {
  for (const [n, k] of [['latest.yml', 'electron'], ['beta-mac.YAML', 'electron'], ['appcast.xml', 'sparkle'], ['feed.RSS', 'sparkle'], ['update.json', 'tauri'], ['RELEASES', 'squirrel'], ['releases', 'squirrel'], ['builder-debug.yml', null], ['builder-effective-config.yaml', null], ['app-update.yml', null], ['dev-app-update.yml', null], ['Setup.exe', null], ['RELEASES.txt', null]]) assert.equal(fileKind(n), k, n);
  for (const [n, c] of [['latest.yml', 'latest'], ['latest-mac.yml', 'latest'], ['latest-linux-arm64.yml', 'latest'], ['beta-linux.yml', 'beta'], ['alpha.yaml', 'alpha'], ['-mac.yml', '-mac']]) assert.equal(channelOf(n), c, n);
  assert.deepEqual(KINDS.map((k) => kindLabel(k.kind)), ['electron-updater', 'Sparkle', 'Tauri', 'Squirrel.Windows']);
  assert.equal(kindLabel('other'), 'other');
});

test('words, sizes and text: ASCII lowercase, paths, lists, plurals and cleaned text', () => {
  assert.equal(asciiLower('LATEST-Mac.YML'), 'latest-mac.yml');
  assert.equal(baseName('a/b/latest.yml'), 'latest.yml');
  assert.equal(folderOf('a/b/latest.yml'), 'a/b');
  assert.equal(folderOf('latest.yml'), '.');
  assert.equal(joinPath('.', 'a'), 'a');
  assert.equal(joinPath('a', ''), 'a');
  assert.equal(byCode('B', 'a'), -1);
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(plural(1, 'feed'), '1 feed');
  assert.equal(safeText('a\u0007b\u202ec\u2028d', 100), 'a b c d');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n b '), 'a b');
});

test('rules: the levels, the result and the input problems', () => {
  assert.ok(atOrAbove('error', 'warning'));
  assert.ok(!atOrAbove('info', 'warning'));
  assert.equal(ruleById('item-order').key, 'itemOrder');
  assert.equal(levelOf(ruleById('unreadable-feed'), defaultConfig()), 'error');
  assert.deepEqual(decide([{ level: 'warning' }], 'error'), { pass: true, failOn: 'error', failing: 0, byLevel: { error: 0, warning: 1, info: 0 }, text: 'PASS - no finding at or above error (1 warning)' });
  assert.equal(decide([{ level: 'error' }, { level: 'error' }], 'error').text, 'FAIL - 2 findings at or above error (2 error)');
  assert.equal(capped(Array.from({ length: 25 }, (_, i) => `p${i}`)).at(-1), 'and 5 more');
  assert.equal(RULES.filter((r) => r.key === null).length, 2);
});

test('files: bounded reading, digests in blocks, UTF-8 only, and paths as shown', async () => {
  await withFiles({ 'a/latest.yml': 'version: 1.0.0\n', 'a/big.bin': Buffer.alloc(3000, 1), 'a/latin.yml': Buffer.from([0x61, 0xe9]) }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a/latest.yml'), 100)).toString(), 'version: 1.0.0\n');
    await assert.rejects(readBounded(resolve(dir, 'a/big.bin'), 100), /3,000 bytes is over the 100 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'a'), 100), /is a folder/);
    await assert.rejects(readBounded(resolve(dir, 'none'), 100), /no such file/);
    assert.deepEqual(await digestFile(resolve(dir, 'a/latest.yml'), 'sha1', 100), { size: 15, digest: sha1('version: 1.0.0\n').toLowerCase() });
    assert.equal((await digestFile(resolve(dir, 'a/big.bin'), 'sha512', FILE_LIMITS.maxDistBytes)).digest, sha512(Buffer.alloc(3000, 1)));
    assert.deepEqual(await digestFile(resolve(dir, 'a/big.bin'), null, 5000), { size: 3000, digest: null });
    assert.equal(displayPath(resolve(dir, 'a/latest.yml'), dir), 'a/latest.yml');
    assert.equal(displayPath(dir, dir), '.');
    assert.ok(!displayPath(resolve(dir, '..', 'x'), dir).startsWith('..'));
    assert.equal((await inspectPath('a', dir)).folder, true);
    await assert.rejects(inspectPath('none', dir), /no such file or folder/);
    await assert.rejects(readTextFile('a', dir, 100), /is a folder; give the file itself/);
    assert.equal(textOf(Buffer.from('\ufeffx'), 'f'), 'x');
    assert.throws(() => textOf(Buffer.from([0xff]), 'f'), /not valid UTF-8/);
    assert.equal(fileError('p', 'r').reason, 'r');
    assert.equal(typeof OPEN_FLAGS, 'number');
    const r = await readFeed(resolve(dir, 'a/latin.yml'), 'a/latin.yml', 'electron', 'latin.yml', defaultConfig(), 100);
    assert.equal(r.feed, null);
    assert.match(r.findings[0].found, /not valid UTF-8/);
  });
});

test('walk: the top of a folder in the order of the names, with folders inside, other files and the dist listing', async () => {
  await withFiles({ 'r/b.json': '{}', 'r/a.yml': 'x', 'r/notes.txt': 'x', 'r/sub/c.xml': '<a/>', 'd/Kit.exe': 'x', 'd/sub/y': 'y' }, async (dir) => {
    const l = await listFolder(resolve(dir, 'r'));
    assert.deepEqual(l.feeds.map((f) => [f.name, f.kind]), [['a.yml', 'electron'], ['b.json', 'tauri']]);
    assert.deepEqual([l.others, l.folders, l.links, l.limit], [1, 1, 0, null]);
    assert.deepEqual((await listFolder(resolve(dir, 'r'), { kind: 'tauri' })).feeds.map((f) => f.name), ['b.json']);
    const d = await listDist(resolve(dir, 'd'));
    assert.deepEqual([...d.files.keys()], ['Kit.exe']);
    assert.deepEqual([...d.folders], ['sub']);
    assert.equal(d.lower.get('kit.exe'), 'Kit.exe');
    assert.equal(WALK_LIMITS.maxEntries, 10000);
  });
});

test('check: checkPaths builds the report of a run without the command line', async () => {
  await withFiles(GOOD, async (dir) => {
    const r = await checkPaths({ paths: ['rel'], dist: 'dist', base: dir, version: '9.9.9' });
    assert.equal(r.version, '9.9.9');
    assert.equal(r.result.pass, true);
    assert.equal(r.input.feeds, 6);
  });
});
