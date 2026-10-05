import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, MAX_PROBLEMS, parseJson, parseXml, parseYaml } from '../src/index.js';
import { GOOD, TAURI_SIG, cli, goodWith, run, sha512, withFiles } from './helpers.js';

// Hostile input: feeds and folders built to exhaust the memory, the stack or the time, to make the tool expand an
// entity or follow a link out of the folder, to rewrite the terminal, to start a second workflow command, to slip a
// formula into a spreadsheet or to change how objects behave. Each heavy test also checks the time, because work that
// grows faster than the input is a failure even when the answer is right. Tests that need a symbolic link, a device or
// file permissions are guarded with process.platform, and none of them asserts a line: lines are asserted in the tests
// that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

test('hostile: a YAML feed of sixty thousand lines is read in one pass, and one more value is refused', LIMIT, async () => {
  const text = `version: 1.0.0\nfiles:\n${'  - url: a.exe\n    sha512: abc\n'.repeat(30000)}`;
  const root = await fast(() => parseYaml(text));
  assert.equal(root.entries[1].value.items.length, 30000);
  await fast(() => assert.throws(() => parseYaml(`a:\n${'  - x\n'.repeat(100001)}`), /more than 100000 values/));
});

test('hostile: long lines of quotes, backslashes, colons, hashes and dashes are read in one pass', LIMIT, async () => {
  for (const text of [`a: "${'\\"'.repeat(200000)}"\n`, `a: '${"''".repeat(200000)}'\n`, `a: ${'x #'.repeat(200000)}\n`, `${'- '.repeat(20)}x\n`, `a: ${':'.repeat(400000)}\n`, `${'k'.repeat(400000)}: v\n`, `a: |\n${'  x\n'.repeat(100000)}`]) {
    await fast(() => {
      try {
        parseYaml(text);
      } catch {
        // refused input is fine; the time is what is checked
      }
    });
  }
});

test('hostile: XML with sixty thousand elements, open tags, quotes and references is read in one pass', LIMIT, async () => {
  const wide = `<rss><channel>${'<item><sparkle:version>1</sparkle:version></item>'.repeat(30000)}</channel></rss>`;
  assert.equal((await fast(() => parseXml(wide))).children[0].children.length, 30000);
  await fast(() => assert.throws(() => parseXml(`<r>${'<a/>'.repeat(100000)}</r>`), /more than 100000 elements/));
  for (const text of ['<'.repeat(500000), `<a ${'b="'.repeat(100000)}`, '<!--'.repeat(100000), `<a${' x="1"'.repeat(300)}>`, `<a>${'&amp;'.repeat(200000)}</a>`, `<a>${'&'.repeat(200000)}</a>`, '<![CDATA['.repeat(100000), `${'<a>'.repeat(100000)}`]) {
    await fast(() => {
      try {
        parseXml(text);
      } catch {
        // refused input is fine; the time is what is checked
      }
    });
  }
});

test('hostile: entity expansion and external entities are refused before anything is expanded or fetched', LIMIT, async () => {
  const laughs = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">${Array.from({ length: 9 }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i || ''};`.repeat(10)}">`).join('')}]><rss><channel><item>&lol9;</item></channel></rss>`;
  const r = await fast(() => run(goodWith({ 'rel/appcast.xml': laughs }), ['rel', '--json']));
  const f = JSON.parse(r.out).findings.find((x) => x.rule === 'unreadable-feed');
  assert.match(f.found, /a DOCTYPE declaration; the tool refuses DTDs/);
  const external = await run(goodWith({ 'rel/appcast.xml': '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/hostname">]><rss>&x;</rss>' }), ['rel', '--json']);
  assert.match(JSON.parse(external.out).findings[0].found, /DOCTYPE/);
});

test('hostile: JSON and YAML nested very deep are refused without exhausting the stack', LIMIT, async () => {
  assert.throws(() => parseJson(`${'['.repeat(100000)}${']'.repeat(100000)}`, { maxDepth: 32 }), /nested more than 32 deep/);
  let deep = '';
  for (let i = 0; i < 5000; i += 1) deep += `${' '.repeat(i)}k:\n`;
  await fast(() => assert.throws(() => parseYaml(deep), /nested more than 32 deep/));
  const r = await run(goodWith({ 'rel/tray.json': `${'{"a":'.repeat(5000)}1${'}'.repeat(5000)}` }), ['rel', '--json']);
  assert.match(JSON.parse(r.out).findings[0].found, /nested more than 32 deep/);
});

test('hostile: two thousand feeds in a folder are read in seconds, and the limits of a folder and of feeds hold', LIMIT, async () => {
  const files = {};
  for (let i = 0; i < LIMITS.maxFeeds * 2; i += 1) files[`rel/f${i}.json`] = JSON.stringify({ version: '1.0.0', notes: 'x', platforms: { 'linux-x86_64': { url: 'https://a.test/a', signature: TAURI_SIG } } });
  const r = await fast(() => run(files, ['rel', '--json']), 60000);
  const out = JSON.parse(r.out);
  assert.equal(out.input.feeds, LIMITS.maxFeeds);
  assert.equal(out.findings.filter((f) => f.rule === 'scan-limit').length, 1);
  assert.equal(out.findings.filter((f) => f.rule === 'missing-platform').length, LIMITS.maxFindingsPerRule);
  assert.equal(out.totals.notListed, LIMITS.maxFeeds * 3 - LIMITS.maxFindingsPerRule);
  const entries = await run(GOOD, ['rel', '--json'], { maxEntries: 3 });
  assert.match(JSON.parse(entries.out).findings[0].found, /the folder holds more than 3 files and folders/);
  const dist = await run(GOOD, ['rel', '--dist', 'dist', '--json'], { maxEntries: 8 });
  assert.ok(JSON.parse(dist.out).findings.some((f) => f.rule === 'scan-limit' && f.file === 'dist'));
});

test('hostile: a feed over its size limit is an unreadable-feed error, and a configuration over its limit stops the run', LIMIT, async () => {
  const big = await run(goodWith({ 'rel/latest.yml': `version: 1.0.0\n#${'x'.repeat(LIMITS.maxFeedBytes)}\n` }), ['rel', '--json']);
  assert.match(JSON.parse(big.out).findings[0].found, /bytes is over the 4 MB limit/);
  const config = await run(goodWith({ 'c.json': ' '.repeat(LIMITS.maxConfigBytes + 1) }), ['rel', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const many = await run(goodWith({ 'c.json': JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 1]))) }), ['rel', '--config', 'c.json']);
  assert.match(many.err, /\n {2}and 10 more\n$/);
  assert.equal(many.err.split('\n').filter((l) => l.startsWith('  c.json')).length, MAX_PROBLEMS);
});

test('hostile: a large file of the dist folder is hashed in blocks', LIMIT, async () => {
  const data = Buffer.alloc(24 * 1024 * 1024, 7);
  const feed = `version: 1.0.0\nfiles:\n  - url: big.exe\n    sha512: ${sha512(data)}\n    size: ${data.length}\nreleaseNotes: x\n`;
  const r = await fast(() => run({ 'rel/latest.yml': feed, 'dist/big.exe': data, 'c.json': '{"requiredPlatforms": {"electron": []}}' }, ['rel', '--dist', 'dist', '--config', 'c.json']), 30000);
  assert.equal(r.code, 0, r.out);
});

test('hostile: control, escape, direction and line separator characters in values are removed from every format', async () => {
  const evil = `1.0\u001b[31m\u202e\u2028x`;
  const files = goodWith({ 'rel/tray.json': JSON.stringify({ version: evil, notes: 'x', platforms: {} }) });
  for (const format of ['text', 'json', 'csv', 'github']) {
    const r = await run(files, ['rel', '--format', format]);
    assert.equal(r.code, 1);
    for (const c of ['\u001b', '\u202e', '\u2028']) assert.ok(!r.out.includes(c) && !JSON.stringify(JSON.parse(format === 'json' ? r.out : '{}')).includes(c), `${format}: ${JSON.stringify(c)}`);
  }
});

test('hostile: a value cannot end a workflow command or start another one, and a formula is neutralized in CSV', async () => {
  const files = goodWith({ 'rel/tray.json': JSON.stringify({ version: '%0A::error file=x::y\n::warning::z', notes: 'x', platforms: {} }) });
  const github = await run(files, ['rel', '--format', 'github']);
  const lines = github.out.trimEnd().split('\n');
  assert.ok(lines.slice(0, -1).every((l) => /^::(?:error|warning|notice) file=/.test(l)), github.out);
  assert.ok(github.out.includes('%250A::error file=x::y ::warning::z'));
  const csv = await run(goodWith({ 'rel/RELEASES': `${'A'.repeat(40)} =cmd-1.0.0-full.nupkg 5\n` }), ['rel', '--format', 'csv', '--min-severity', 'error']);
  assert.ok(csv.out.split('\r\n').slice(1, -1).every((l) => !/,[=+@-]/.test(l.replace(/,"[^"]*"/g, ','))), csv.out);
});

test('hostile: __proto__, constructor and toString as names of platforms, keys and attributes change nothing', async () => {
  const tauri = '{"version": "1.0.0", "notes": "x", "platforms": {"__proto__": {"url": "https://a.test/a", "signature": "s"}, "constructor": {"url": "https://a.test/b", "signature": "s"}, "toString": {"url": "https://a.test/c", "signature": "s"}}}';
  const r = await run(goodWith({ 'rel/tray.json': tauri }), ['rel', '--json']);
  const found = JSON.parse(r.out).findings.filter((f) => f.file === 'rel/tray.json').map((f) => f.rule);
  assert.deepEqual(found, ['missing-platform', 'missing-platform', 'missing-platform', 'missing-platform']);
  const yml = await run(goodWith({ 'rel/latest.yml': `__proto__: 1\nconstructor: 2\nversion: 1.2.0\npath: a.exe\nsha512: ${sha512('a')}\nreleaseNotes: x\n` }), ['rel', '--json']);
  assert.equal(JSON.parse(yml.out).findings.filter((f) => f.rule === 'unreadable-feed').length, 0);
  assert.equal({}.polluted, undefined);
});

test('hostile: CRLF, CR and a byte order mark give the same report as LF', async () => {
  const lf = await run(GOOD, ['rel', '--dist', 'dist', '--json']);
  for (const [name, change] of [['CRLF', (t) => t.split('\n').join('\r\n')], ['CR', (t) => t.split('\n').join('\r')], ['BOM', (t) => `\ufeff${t}`]]) {
    const files = { ...GOOD };
    for (const k of Object.keys(files).filter((x) => x.startsWith('rel/'))) files[k] = change(files[k]);
    const other = await run(files, ['rel', '--dist', 'dist', '--json']);
    assert.deepEqual(JSON.parse(other.out).findings, JSON.parse(lf.out).findings, name);
    assert.equal(other.code, 0, name);
  }
});

test('hostile: a symbolic link in the folder is counted and not followed, a link named is refused, and a link in dist is not read', async (t) => {
  if (process.platform === 'win32') {
    t.skip('symbolic links need extra rights on Windows');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    await mkdir(resolve(dir, 'outside'));
    await writeFile(resolve(dir, 'outside/latest-beta.yml'), 'version: 9.9.9\n');
    await symlink(resolve(dir, 'outside/latest-beta.yml'), resolve(dir, 'rel/beta.yml'));
    await symlink(resolve(dir, 'outside'), resolve(dir, 'rel/loop'));
    await symlink(resolve(dir, 'rel'), resolve(dir, 'rel-link'));
    const r = await cli(['rel', '--json'], dir);
    const out = JSON.parse(r.out);
    assert.equal(out.input.links, 2);
    assert.equal(out.input.feeds, 6);
    assert.match(out.notes.join('\n'), /2 symbolic links are not followed/);
    const named = await cli(['rel-link'], dir);
    assert.equal(named.code, 2);
    assert.match(named.err, /is a symbolic link, which is not followed/);
    await writeFile(resolve(dir, 'outside/Kit-Setup-1.2.0.exe'), 'x');
    await symlink(resolve(dir, 'outside/Kit-Setup-1.2.0.exe'), resolve(dir, 'dist/Kit-Setup-1.2.0.exe.lnk'));
    const dist = await cli(['rel', '--dist', 'rel-link', '--json'], dir);
    assert.equal(dist.code, 2);
  });
});

test('hostile: a device named as a feed is refused, and a feed with no read access is an unreadable-feed error', async (t) => {
  if (process.platform === 'win32') {
    t.skip('devices and file modes work differently on Windows');
    return;
  }
  const device = await cli(['/dev/zero', '--kind', 'electron'], process.cwd());
  assert.equal(device.code, 2);
  assert.match(device.err, /is not a regular file or folder/);
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user reads every file whatever its mode');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    await chmod(resolve(dir, 'rel/latest.yml'), 0o000);
    const r = await cli(['rel', '--json'], dir);
    assert.match(JSON.parse(r.out).findings.find((f) => f.rule === 'unreadable-feed').found, /cannot be read \(EACCES\)/);
    await chmod(resolve(dir, 'rel/latest.yml'), 0o644);
  });
});
