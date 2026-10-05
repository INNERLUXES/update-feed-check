// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// release folders to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy/release', '--dist', 'examples/messy/dist', '--previous', 'examples/messy/previous', '--config', 'examples/config.json'];
export const CLEAN = ['examples/clean/release', '--dist', 'examples/clean/dist', '--previous', 'examples/clean/previous'];
const M = 'examples/messy/release';

// The example feeds are the one place where a date is written: a feed has a releaseDate, a pubDate or a pub_date, and
// the tool reads none of them. The repository checks blank the value of those three fields, in the feeds of the
// examples only, before they look for a number that reads like a year; every other file, and every other line of
// these feeds, is checked in full.
const FEED_FILE = /^examples\/(?:messy|clean)\/(?:release|previous)\/[^/]+$/;
export function withoutFeedDates(name, text) {
  if (!FEED_FILE.test(name)) return text;
  return text.replace(/^releaseDate: '[^'\n]*'$/gm, "releaseDate: ''").replace(/<pubDate>[^<\n]*<\/pubDate>/g, '<pubDate></pubDate>').replace(/"pub_date": "[^"\n]*"/g, '"pub_date": ""');
}

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy folder: the counts, the feeds, one finding of every rule that fires, and the
// result.
export const EXPECTED = [
  'input: 1 folder and 0 files named; 5 feeds: 3 electron-updater, 1 Sparkle, 1 Tauri',
  'dist: examples/messy/dist, 7 files',
  'previous: examples/messy/previous, 4 feeds',
  'config: examples/config.json (Quillmere release review)',
  'findings: 17 (12 error, 5 warning)',
  `${M}/appcast.xml          Sparkle           4.2.0 (420)`,
  'the first item has sparkle:version 412, but the item at line 16 has 420, which is higher; put the newest item first',
  'the download "http://downloads.quillmere.test/clip/QuillmereClip-4.1.2.zip" uses http, not https',
  'the item of version 420 has sparkle:phasedRolloutInterval but no pubDate',
  'the enclosure of version 400 has no sparkle:edSignature, only the deprecated sparkle:dsaSignature',
  'the version 3.1.4 is the same as 3.1.4 in the previous electron-updater feed examples/messy/previous/latest-linux.yml',
  'the file "Quillmere-Notes-3.1.4.AppImage" has no sha512',
  'the feed gives 132 bytes for "Quillmere-Notes-3.2.0-mac.zip", and the file in the dist folder has 123',
  'the sha512 of "Quillmere-Notes-Setup-3.2.0.exe" does not match the file in the dist folder',
  'stagingPercentage is "120", not a number from 0 to 100',
  'the version 1.4.0 is lower than 1.5.0 in the previous Tauri feed examples/messy/previous/quillmere-sync.json',
  'the platform "windows-x86_64" has no signature',
  '"Quillmere.Sync_1.4.0_amd64.AppImage" is not in the dist folder examples/messy/dist',
  'the download is on cdn-eu.quillmere.test, while the first download of the feed is on downloads.quillmere.test',
  'the item of version 400 has no release notes',
  'the feed has no releaseNotes',
  'latest-linux.yml offers 3.1.4, while latest-mac.yml and latest.yml of the channel "latest" offer 3.2.0',
  'the feed has no platform "darwin-aarch64"',
  'not a signature verification and not a certification',
  'RESULT: FAIL - 12 findings at or above error (12 error, 5 warning)'
];
// What must not be reported: the files that match, the signed enclosures, the dates, which are never read, and the
// namespace of the appcast, which is not an address.
export const UNWANTED = ['latest-mac.yml:3', 'Quillmere-Notes-3.2.0.dmg', 'QuillmereClip-4.2.0.zip"', 'Quillmere.Sync_x64.app.tar.gz', 'releaseDate', 'pub_date', 'andymatuschak', 'RESULT: PASS', 'ERROR    unreadable-feed', 'ERROR    scan-limit'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy folder', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean folder', clean, 0, ['6 feeds: 3 electron-updater, 1 Sparkle, 1 Tauri, 1 Squirrel.Windows', 'dist: examples/clean/dist, 11 files', 'previous: examples/clean/previous, 6 feeds', 'findings: 0', 'RESULT: PASS - no finding at or above error'], ['  WARNING  ', '  ERROR  ', '  INFO  ', 'RESULT: FAIL', 'note:']);

  // Without --dist and --previous, only the checks of the feeds themselves run.
  expect('messy, feeds alone', await run(MESSY.slice(0, 1)), 1, ['dist: not given', 'previous: not given', 'INFO     missing-release-notes', 'insecure-url'], ['ERROR    hash-mismatch', 'ERROR    version-not-increased']);
  // Only the errors are shown with --min-severity error.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 12 (12 error); 5 below error not shown', 'RESULT: FAIL - 12 findings at or above error'], ['WARNING  ', 'INFO  ']);
  // The clean folder passes when every level fails the run.
  expect('clean, fail on info', await run([...CLEAN, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // A file of no known kind stops the run.
  expect('a file of no known kind', await run(['examples/messy/README.md']), 2, ['examples/messy/README.md: the kind of the feed is not known from its name'], [], 'err');

  // The README shows the whole report of the messy folder, the --explain lines of one finding, the GitHub annotations
  // of two findings, the start of the CSV report and the report of the clean folder.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy folder differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean folder differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('hash-mismatch') && l.includes(`${M}/latest.yml:4`));
  const sample = lines.slice(at, at + 8).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the checksum differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  const picked = github.out.split('\n').filter((x) => x.includes('title=update-feed-check hash-mismatch::') || x.includes('title=update-feed-check mixed-versions::'));
  if (picked.length !== 2) problems.push('github: the sample lines are not in the output');
  for (const l of picked) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const csv = await run([...MESSY, '--format', 'csv']);
  if (csv.code !== 1) problems.push(`csv: exit code ${csv.code}, expected 1`);
  const head = csv.out.split('\r\n').slice(0, 4).join('\n');
  if (!readme.includes(head)) problems.push('README: the CSV sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-findings.csv'), csv.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
