import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run, withoutFeedDates } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const M = 'examples/messy/release';

test('examples: the messy folder fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean folder passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
  assert.equal((await run([...CLEAN, '--fail-on', 'info'])).code, 0);
  assert.equal((await run([...CLEAN, '--config', 'examples/config.json', '--fail-on', 'info'])).code, 0, 'the clean folder also meets the configuration of the messy one');
});

test('examples: --explain, JSON, CSV, the GitHub commands and the defaults are the reports that are saved', async () => {
  const outputs = { 'messy-explain.txt': [...MESSY, '--explain'], 'messy.json': [...MESSY, '--json', '--explain'], 'messy-findings.csv': [...MESSY, '--format', 'csv'], 'messy-github.txt': [...MESSY, '--format', 'github'], 'defaults.json': ['--print-defaults'] };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the rules that fire on the messy folder, each on the line built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const at = async (file, needle, n = 1) => {
    const lines = (await readFile(resolve(root, `${M}/${file}`), 'utf8')).split('\n');
    return `${M}/${file}:${lines.map((l, i) => [l, i]).filter(([l]) => l.includes(needle))[n - 1][1] + 1}`;
  };
  const byRule = {};
  for (const x of report.findings) (byRule[x.rule] ??= []).push(x.at);
  assert.deepEqual(byRule, {
    'item-order': [await at('appcast.xml', '<sparkle:version>412')],
    'insecure-url': [await at('appcast.xml', 'http://downloads')],
    'invalid-rollout': [await at('appcast.xml', 'phasedRolloutInterval'), await at('latest.yml', 'stagingPercentage')],
    'missing-signature': [await at('appcast.xml', 'dsaSignature'), await at('quillmere-sync.json', '"signature": ""')],
    'version-not-increased': [await at('latest-linux.yml', 'version'), await at('quillmere-sync.json', '"version"')],
    'missing-hash': [await at('latest-linux.yml', 'url:')],
    'size-mismatch': [await at('latest-mac.yml', 'size:')],
    'hash-mismatch': [await at('latest.yml', 'sha512:')],
    'dist-file-missing': [await at('quillmere-sync.json', 'amd64.AppImage')],
    'mixed-hosts': [await at('appcast.xml', 'cdn-eu')],
    'missing-release-notes': [await at('appcast.xml', '<item>', 3), await at('latest-linux.yml', 'version')],
    'mixed-versions': [await at('latest-linux.yml', 'version')],
    'missing-platform': [await at('quillmere-sync.json', '"platforms"')]
  });
  assert.deepEqual(report.feeds.map((f) => [f.file.slice(M.length + 1), f.kind, f.version]), [['appcast.xml', 'sparkle', '4.2.0 (420)'], ['latest-linux.yml', 'electron', '3.1.4'], ['latest-mac.yml', 'electron', '3.2.0'], ['latest.yml', 'electron', '3.2.0'], ['quillmere-sync.json', 'tauri', '1.4.0']]);
});

test('examples: the dates of the feeds are never read, and only their values are blanked for the repository checks', async () => {
  const out = await saved('messy.json');
  assert.ok(!out.includes('releaseDate'));
  assert.doesNotMatch(out, /\d{2}:\d{2}:\d{2}/, 'no time of day of a feed reaches the output');
  const feed = await readFile(resolve(root, `${M}/latest.yml`), 'utf8');
  const blanked = withoutFeedDates(`${M}/latest.yml`, feed);
  assert.match(blanked, /^releaseDate: ''$/m);
  assert.equal(blanked.split('\n').length, feed.split('\n').length);
  assert.equal(withoutFeedDates('docs/limits.md', "releaseDate: 'x'"), "releaseDate: 'x'", 'no other file is blanked');
  assert.equal(withoutFeedDates('examples/messy/README.md', '<pubDate>x</pubDate>'), '<pubDate>x</pubDate>');
  assert.equal(withoutFeedDates(`${M}/appcast.xml`, '<pubDate>x</pubDate>\n"pub_date": "y"'), '<pubDate></pubDate>\n"pub_date": ""');
});

test('examples: the same files written with CRLF line ends give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'update-feed-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    for (const sub of ['examples/messy/release', 'examples/messy/previous', 'examples/clean/release', 'examples/clean/previous']) {
      for (const e of await readdir(resolve(dir, sub))) {
        const rel = `${sub}/${e}`;
        const text = (await readFile(resolve(dir, rel), 'utf8')).split('\r\n').join('\n');
        await writeFile(resolve(dir, rel), text.split('\n').join('\r\n'));
      }
    }
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
