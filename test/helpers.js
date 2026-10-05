// Shared test helpers: release folders built inline, read in memory or written into a temporary folder that is
// removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux,
// macOS and Windows. The line a test expects is found with lineOf(), which counts lines the way the tool does, so a
// test never holds a line number worked out by hand for one system only. No test reads the clock, the time zone or the
// locale.

import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { defaultConfig, lineStarts, main, positionOf, readConfig, readElectron, readSparkle, readSquirrel, readTauri } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'update-feed-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// The column (from 1) of the n-th place where needle starts in text.
export const columnOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).column;

// The configuration of a configuration object, through the real reader, or the defaults.
export const configOf = (object = null) => (object === null ? defaultConfig() : readConfig(JSON.stringify(object), 'config.json'));

// The checksums a feed writes for a text.
export const sha512 = (text) => createHash('sha512').update(text).digest('base64');
export const sha1 = (text) => createHash('sha1').update(text).digest('hex').toUpperCase();
// A value of the form of an EdDSA signature: the base64 of 64 bytes.
export const edSig = (seed) => createHash('sha512').update(String(seed)).digest('base64');

// One feed read in memory: { feed, findings: [{ rule, line, column, found }] }.
export function feedOf(text, kind, name = 'feed', config = defaultConfig()) {
  const starts = lineStarts(text);
  const lineAt = (o) => positionOf(starts, o).line;
  const readers = { electron: () => readElectron(text, name), sparkle: () => readSparkle(text, name, lineAt), tauri: () => readTauri(text, name, config), squirrel: () => readSquirrel(text, name, lineAt) };
  const r = readers[kind]();
  return { feed: r.feed, findings: r.findings.map((f) => ({ rule: f.rule, ...positionOf(starts, f.offset), found: f.found })) };
}

// The rule ids of the findings of one feed read in memory.
export const rulesOf = (text, kind, name, config) => feedOf(text, kind, name, config).findings.map((f) => f.rule);

// The built files of a small release, and the feeds that describe them, in good order.
export const BUILT = {
  'dist/Kit-Setup-1.2.0.exe': 'made-up Windows installer\n',
  'dist/Kit-1.2.0-mac.zip': 'made-up macOS archive\n',
  'dist/Kit-1.2.0.AppImage': 'made-up Linux image\n',
  'dist/Clip-3.0.0.zip': 'made-up Sparkle archive\n',
  'dist/Tray_win.exe': 'made-up Tauri installer\n',
  'dist/Tray_mac_arm.tar.gz': 'made-up Tauri archive for Apple silicon\n',
  'dist/Tray_mac_x64.tar.gz': 'made-up Tauri archive for Intel\n',
  'dist/Tray_linux.AppImage': 'made-up Tauri image\n',
  'dist/ledger-1.2.0-full.nupkg': 'made-up full package\n',
  'dist/ledger-1.2.0-delta.nupkg': 'made-up delta package\n'
};
const b = (name) => BUILT[`dist/${name}`];
export const yml = (version, files, more = 'releaseNotes: Faster start.\n') => `version: ${version}\nfiles:\n${files.map((f) => `  - url: ${f}\n    sha512: ${sha512(b(f))}\n    size: ${Buffer.byteLength(b(f))}\n`).join('')}path: ${files[0]}\nsha512: ${sha512(b(files[0]))}\n${more}`;
export const appcast = (items) => `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">\n  <channel>\n    <title>Clip</title>\n${items.join('')}  </channel>\n</rss>\n`;
export const item = (version, url, more = '      <sparkle:releaseNotesLink>https://clip.test/notes.html</sparkle:releaseNotesLink>\n', attrs = `length="${Buffer.byteLength(b('Clip-3.0.0.zip'))}" sparkle:edSignature="${edSig(version)}"`) => `    <item>\n      <title>Clip</title>\n      <sparkle:version>${version}</sparkle:version>\n${more}      <enclosure url="${url}" ${attrs} type="application/octet-stream"/>\n    </item>\n`;
export const TAURI_SIG = Buffer.from('untrusted comment: signature from a made-up key\nRWQ\n').toString('base64');
export const tauri = (version = '0.4.0', platforms = { 'windows-x86_64': 'Tray_win.exe', 'darwin-aarch64': 'Tray_mac_arm.tar.gz', 'darwin-x86_64': 'Tray_mac_x64.tar.gz', 'linux-x86_64': 'Tray_linux.AppImage' }, notes = 'Tray menu fixes.') => JSON.stringify({ version, notes, platforms: Object.fromEntries(Object.entries(platforms).map(([k, f]) => [k, { signature: TAURI_SIG, url: `https://get.kit.test/tray/${f}` }])) }, null, 2);
export const releases = (lines) => lines.map(([name, text, extra = '']) => `${sha1(text ?? b(name))} ${name} ${Buffer.byteLength(text ?? b(name))}${extra}`).join('\n');

// A release folder of every kind in good order, with its dist folder: the folder every test of a whole run changes.
export const GOOD = {
  ...BUILT,
  'rel/latest.yml': yml('1.2.0', ['Kit-Setup-1.2.0.exe']),
  'rel/latest-mac.yml': yml('1.2.0', ['Kit-1.2.0-mac.zip']),
  'rel/latest-linux.yml': yml('1.2.0', ['Kit-1.2.0.AppImage']),
  'rel/appcast.xml': appcast([item('300', 'https://get.kit.test/clip/Clip-3.0.0.zip'), item('290', 'https://get.kit.test/clip/Clip-2.9.0.zip')]),
  'rel/tray.json': tauri(),
  'rel/RELEASES': `${releases([['ledger-1.2.0-delta.nupkg'], ['ledger-1.2.0-full.nupkg']])}\n`
};

// The folder with some files changed or added; null takes a file out.
export function goodWith(changes = {}) {
  const out = { ...GOOD };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = ['rel', '--dist', 'dist'], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// The JSON report of a folder of files, with more arguments.
export async function reportOf(files, args = ['rel', '--dist', 'dist']) {
  const r = await run(files, [...args, '--json']);
  if (r.code === 2) throw new Error(r.err);
  return { ...JSON.parse(r.out), code: r.code };
}

// The findings of a report, of one rule or of all.
export const findingsOf = (r, rule) => r.findings.filter((f) => !rule || f.rule === rule);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}
