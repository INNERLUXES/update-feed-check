import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CSV_COLUMNS, NOTICE, USAGE, VERSION, csvField, escapeData, escapeProperty, parseArgs } from '../src/index.js';
import { GOOD, cli, columnOf, goodWith, lineOf, run, withFiles, yml } from './helpers.js';

const WARN = goodWith({ 'rel/tray.json': GOOD['rel/tray.json'].replace('"linux-x86_64"', '"linux-aarch64"') });
const ERROR = goodWith({ 'rel/latest.yml': GOOD['rel/latest.yml'].replace(/^sha512: .*$/m, 'sha512: x').replace(/^ {4}sha512: .*$/m, '    sha512: x') });
const INFO = goodWith({ 'rel/latest.yml': GOOD['rel/latest.yml'].replace('releaseNotes: Faster start.\n', '') });

test('cli: exit 0 below the fail-on level, 1 at or above it, from the flag or the configuration', async () => {
  const clean = await run(GOOD);
  assert.equal(clean.code, 0, clean.err);
  assert.match(clean.out, /^update-feed-check: rel\ninput: 1 folder and 0 files named; 6 feeds: 3 electron-updater, 1 Sparkle, 1 Tauri, 1 Squirrel\.Windows; 0 other files passed over; 0 folders inside passed over; 0 links not followed\ndist: dist, 10 files\nprevious: not given; versions are not compared with a published feed\nconfig: built-in defaults: Tauri platforms windows-x86_64, darwin-aarch64, darwin-x86_64 and linux-x86_64; electron-updater feeds latest\.yml, latest-mac\.yml and latest-linux\.yml; minimum severity info; fail on error\nrules: missing-hash \(error\); /);
  assert.match(clean.out, /\nfindings: 0\n/);
  assert.match(clean.out, /RESULT: PASS - no finding at or above error\n$/);
  assert.equal(clean.err, '');
  assert.equal((await run(WARN)).code, 0, 'a warning does not fail the run by default');
  assert.equal((await run(WARN, ['rel', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(INFO, ['rel', '--fail-on', 'warning'])).code, 0);
  assert.equal((await run(INFO, ['rel', '--fail-on', 'info'])).code, 1);
  const configured = await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['rel', '--config', 'c.json']);
  assert.equal(configured.code, 1);
  assert.match(configured.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)\n$/);
  assert.equal((await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['rel', '--config', 'c.json', '--fail-on', 'error'])).code, 0, 'the flag wins over the configuration');
  const error = await run(ERROR, ['rel']);
  assert.equal(error.code, 1);
  assert.match(error.out, /RESULT: FAIL - 1 finding at or above error \(1 error\)\n$/);
});

test('cli: files and folders named together, --kind for a file of another name, and a file of no known kind', async () => {
  const r = await run(goodWith({ 'x/feed.txt': GOOD['rel/tray.json'] }), ['rel/latest.yml', 'rel/appcast.xml', 'x/feed.txt', '--kind', 'tauri', '--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(JSON.parse(r.out).findings.filter((f) => f.rule === 'unreadable-feed').map((f) => f.file), ['rel/appcast.xml', 'rel/latest.yml'], 'latest.yml and appcast.xml are not Tauri feeds');
  const ok = await run(goodWith({ 'x/feed.txt': GOOD['rel/tray.json'] }), ['x/feed.txt', '--kind', 'tauri', '--json']);
  assert.equal(ok.code, 0, ok.err);
  assert.deepEqual(JSON.parse(ok.out).input.byKind, { electron: 0, sparkle: 0, tauri: 1, squirrel: 0 });
  const both = await run(GOOD, ['rel/latest.yml', 'rel', '--json']);
  assert.equal(JSON.parse(both.out).input.feeds, 7);
  const filtered = await run(GOOD, ['rel', '--kind', 'squirrel', '--json']);
  const fr = JSON.parse(filtered.out);
  assert.equal(fr.input.feeds, 1);
  assert.equal(fr.input.otherFiles, 5);
  const unknown = await run(goodWith({ 'notes.txt': 'x' }), ['notes.txt']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /notes\.txt: the kind of the feed is not known from its name; give --kind electron, sparkle, tauri or squirrel/);
});

test('cli: a feed that cannot be read is an unreadable-feed error at its place, and the run goes on', async () => {
  const bad = 'version: 1.2.0\nfiles: [a.exe]\n';
  const r = await run(goodWith({ 'rel/latest.yml': bad }), ['rel', '--json']);
  assert.equal(r.code, 1);
  const out = JSON.parse(r.out);
  const f = out.findings.filter((x) => x.rule === 'unreadable-feed');
  assert.deepEqual(f.map((x) => [x.file, x.line, x.column]), [['rel/latest.yml', lineOf(bad, '[a.exe]'), columnOf(bad, '[a.exe]')]]);
  assert.match(f[0].found, /cannot be read as an electron-updater feed: a flow collection/);
  assert.equal(out.feeds.find((x) => x.file === 'rel/latest.yml').read, false);
  assert.match((await run(goodWith({ 'rel/latest.yml': bad }))).out, /rel\/latest\.yml\s+electron-updater\s+not read/);
  const binary = await run(goodWith({ 'rel/RELEASES': Buffer.from([0x41, 0, 0x42]) }), ['rel', '--json']);
  assert.match(JSON.parse(binary.out).findings[0].found, /holds binary data/);
  const latin = await run(goodWith({ 'rel/tray.json': Buffer.from([0x7b, 0xe9, 0x7d]) }), ['rel', '--json']);
  assert.match(JSON.parse(latin.out).findings[0].found, /not valid UTF-8/);
  const off = await run(goodWith({ 'rel/latest.yml': bad, 'c.json': '{"rules": {"unreadableFeed": "off"}}' }), ['rel', '--config', 'c.json']);
  assert.equal(off.code, 2, 'the rule of input problems has no key');
});

test('cli: --min-severity hides the findings below it and says so', async () => {
  const r = await run(WARN, ['rel', '--min-severity', 'error']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0; 1 below error not shown/);
  assert.match(r.out, /note: 1 finding below error is not shown/);
});

test('cli: --dist and --previous must be usable, or the run stops with no result', async () => {
  const notFolder = await run(GOOD, ['rel', '--dist', 'rel/latest.yml']);
  assert.equal(notFolder.code, 2);
  assert.match(notFolder.err, /--dist rel\/latest\.yml: is a file; give the folder that holds the built files/);
  assert.match((await run(GOOD, ['rel', '--dist', 'nowhere'])).err, /--dist nowhere: no such file or folder/);
  const prevBad = await run(goodWith({ 'old/latest.yml': 'a: [1]\n' }), ['rel', '--previous', 'old']);
  assert.equal(prevBad.code, 2);
  assert.match(prevBad.err, /--previous old\/latest\.yml: the file cannot be read as an electron-updater feed: a flow collection/);
  const prevEmpty = await run(goodWith({ 'old/readme.txt': 'x' }), ['rel', '--previous', 'old']);
  assert.match(prevEmpty.err, /--previous old: holds no feed of the kinds the tool reads/);
  const twice = await run(GOOD, ['rel', 'rel/']);
  assert.match(twice.err, /rel: is named twice/);
});

test('cli: usage errors give exit code 2 and the usage', async () => {
  for (const argv of [[], ['--format', 'xml', 'rel'], ['--kind', 'msix', 'rel'], ['--min-severity', 'fatal', 'rel'], ['--fail-on'], ['rel', '--bogus'], ['rel', '--dist', 'a', '--dist', 'b'], ['rel', '--explain', '--format', 'csv'], ['rel', '--json', '--format', 'csv'], ['-'], ['rel', '--previous', '-'], ['https://example.test/latest.yml'], ['rel', '--dist', 'https://a.test/d']]) {
    const r = await cli(argv, process.cwd());
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.out, '');
    assert.match(r.err, /^update-feed-check: .+\n\nUsage: update-feed-check/, argv.join(' '));
  }
  assert.match((await cli(['https://example.test/latest.yml'], process.cwd())).err, /never fetches a URL/);
  assert.throws(() => parseArgs(Array.from({ length: 101 }, (_, i) => `f${i}`)), /more than 100 files and folders/);
  assert.equal(parseArgs(['a', 'b']).paths.length, 2);
});

test('cli: --help, --version and --print-defaults', async () => {
  const help = await cli(['--help'], process.cwd());
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const s of ['--kind', '--dist', '--previous', '--config', '--format', '--json', '--min-severity', '--fail-on', '--explain', '--print-defaults', 'Exit codes: 0', 'missing-hash (rules.missingHash)', 'unreadable-feed (always error)']) assert.ok(USAGE.includes(s), s);
  assert.equal((await cli(['-v'], process.cwd())).out, `${VERSION}\n`);
  const d = await cli(['--print-defaults'], process.cwd());
  assert.equal(JSON.parse(d.out).name, 'built-in defaults');
});

test('report: the JSON report holds the input, the configuration, the feeds, the rules, the findings, the totals and the result', async () => {
  const r = await run(ERROR, ['rel', '--json']);
  const out = JSON.parse(r.out);
  assert.deepEqual(Object.keys(out), ['tool', 'version', 'input', 'config', 'feeds', 'rules', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.equal(out.tool, 'update-feed-check');
  assert.equal(out.notice, NOTICE);
  const f = out.findings[0];
  assert.deepEqual(Object.keys(f), ['rule', 'level', 'kind', 'file', 'line', 'column', 'at', 'found', 'fix']);
  assert.equal(f.at, `rel/latest.yml:${f.line}`);
  assert.equal(out.rules.length, 18);
  const explained = JSON.parse((await run(ERROR, ['rel', '--json', '--explain'])).out);
  assert.ok(explained.findings[0].basis.length > 0);
  assert.ok(explained.findings[0].own.length > 0);
});

test('report: --explain adds the rule, the points of the public pages and the own choice to the text', async () => {
  const r = await run(ERROR, ['rel', '--explain']);
  assert.match(r.out, /\n {11}rule: a download of an electron-updater feed with no sha512, or a package of RELEASES with no SHA1\n {11}basis: electron-updater checks each download against its SHA-512 checksum.+\(Auto Update \(electron-builder\), https:\/\/www\.electron\.build\/docs\/features\/auto-update\)\n/);
  assert.match(r.out, /\n {11}the tool's own choice: /);
});

test('report: CSV with one record per finding, CRLF line ends, quotes and a neutralized formula', async () => {
  const r = await run(goodWith({ 'rel/tray.json': GOOD['rel/tray.json'].replace('"0.4.0"', '"=1+2"') }), ['rel', '--format', 'csv']);
  assert.equal(r.code, 1);
  const lines = r.out.split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.at(-1), '');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^error,invalid-version,tauri,rel\/tray\.json,2,14,"the version ""=1\+2"" is not a semantic version/);
  assert.equal(csvField('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvField('-1'), "'-1");
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('a"b'), '"a""b"');
  assert.equal(csvField(null), '');
});

test('report: GitHub commands with file, line, column and title, escaped, and a summary line', async () => {
  const r = await run(ERROR, ['rel', '--format', 'github']);
  const text = GOOD['rel/latest.yml'];
  const lines = r.out.trimEnd().split('\n');
  assert.match(lines[0], new RegExp(`^::error file=rel/latest\\.yml,line=${lineOf(text, '    sha512')},col=13,title=update-feed-check missing-hash::the sha512 of "Kit-Setup-1\\.2\\.0\\.exe" is not the base64`));
  assert.equal(lines.at(-1), 'update-feed-check: 6 feeds, 1 finding; RESULT: FAIL - 1 finding at or above error (1 error)');
  assert.equal(escapeData('50%\r\nx'), '50%25%0D%0Ax');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
  const info = await run(INFO, ['rel', '--format', 'github']);
  assert.match(info.out, /^::notice file=rel\/latest\.yml,line=1,col=1,title=update-feed-check missing-release-notes::/);
});

test('report: the text names each feed with its kind, version and counts, and every report ends with the notice and the result', async () => {
  const r = await run(goodWith({ 'rel/latest-linux.yml': yml('1.1.0', ['Kit-1.2.0.AppImage']) }), ['rel']);
  assert.ok(r.out.includes('\n  rel/latest-linux.yml  electron-updater  1.1.0    1        0      1        0\n'), r.out);
  assert.ok(r.out.includes(`\n${NOTICE}\n\nRESULT: PASS - no finding at or above error (1 warning)\n`));
  const empty = await withFiles({ 'e/readme.txt': 'x', 'e/sub/latest.yml': GOOD['rel/latest.yml'] }, (dir) => cli(['e'], dir));
  assert.equal(empty.code, 0);
  assert.match(empty.out, /0 feeds; 1 other file passed over; 1 folder inside passed over/);
  assert.match(empty.out, /\nFeeds \(0\)\n\n {2}none\n/);
  assert.match(empty.out, /note: the input holds no feed of the kinds the tool reads/);
});

test('cli: a run writes nothing to the folders it reads', async () => {
  await withFiles(GOOD, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    const r = await cli(['rel', '--dist', 'dist', '--previous', 'rel', '--format', 'csv'], dir);
    assert.equal(r.code, 1, 'the same version as the previous feed');
    assert.deepEqual((await readdir(dir, { recursive: true })).sort(), before);
    assert.ok(resolve(dir).length > 0);
  });
});
