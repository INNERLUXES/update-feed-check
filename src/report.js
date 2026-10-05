// The reports: text for a terminal, JSON for other tools, and GitHub workflow commands that turn each finding into an
// annotation on the file, line and column. The CSV report is in src/csv.js. Every text from the input (a file name, a
// version, an address) was cleaned by safeText before it reached the report object. The GitHub commands also escape
// the characters a command gives a meaning to, so a text in the input cannot end a command early or start another one.

import { KINDS, kindLabel } from './kinds.js';
import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';

const clean = (t, max = 200) => safeText(t, max);

function inputLine(r) {
  const i = r.input;
  const kinds = KINDS.filter((k) => i.byKind[k.kind]).map((k) => `${grouped(i.byKind[k.kind])} ${k.label}`);
  const named = `${plural(i.folders, 'folder')} and ${plural(i.files, 'file')} named`;
  return [named, `${plural(i.feeds, 'feed')}${kinds.length ? `: ${kinds.join(', ')}` : ''}`, `${plural(i.otherFiles, 'other file')} passed over`, `${plural(i.foldersPassedOver, 'folder')} inside passed over`, `${plural(i.links, 'link')} not followed`].join('; ');
}

const distLine = (r) => (r.input.dist ? `${r.input.dist.folder}, ${plural(r.input.dist.files, 'file')}` : 'not given; files, sizes and checksums are not compared with the built files');
const previousLine = (r) => (r.input.previous ? `${r.input.previous.path}, ${plural(r.input.previous.feeds, 'feed')}` : 'not given; versions are not compared with a published feed');

function configLine(r) {
  const c = r.config;
  const where = c.file ? `${c.file}${c.name ? ` (${clean(c.name, 120)})` : ''}` : 'built-in defaults';
  const tauri = c.requiredPlatforms.tauri.length ? listText(c.requiredPlatforms.tauri, 20) : 'none';
  const electron = c.requiredPlatforms.electron.length ? listText(c.requiredPlatforms.electron, 20) : 'none';
  return `${where}: Tauri platforms ${tauri}; electron-updater feeds ${electron}; minimum severity ${c.minSeverity}; fail on ${c.failOn}`;
}

const rulesLine = (r) => r.config.rules.map((x) => `${x.id} (${x.level})`).join('; ');

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.config.minSeverity} not shown` : ''}`;
}

// A table with a header row and its columns padded to the widest cell.
function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const cell = (t, max = 60) => (t === '' || t === null || t === undefined ? '-' : clean(t, max));
const PAD = ' '.repeat(11);

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`update-feed-check: ${r.input.paths.join(', ')}`);
  out.push(`input: ${inputLine(r)}`);
  out.push(`dist: ${distLine(r)}`);
  out.push(`previous: ${previousLine(r)}`);
  out.push(`config: ${configLine(r)}`);
  out.push(`rules: ${rulesLine(r)}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Feeds (${grouped(r.feeds.length)})`, '');
  if (r.feeds.length) out.push(...table(['feed', 'kind', 'version', 'entries', 'error', 'warning', 'info'], r.feeds.map((f) => [cell(f.file, 80), kindLabel(f.kind), f.read ? cell(f.version, 40) : 'not read', grouped(f.entries), grouped(f.byLevel.error), grouped(f.byLevel.warning), grouped(f.byLevel.info)])), '');
  else out.push('  none', '');
  out.push(`Rules (${grouped(r.rules.length)})`, '');
  out.push(...table(['rule', 'level', 'findings'], r.rules.map((x) => [x.id, x.level, grouped(x.findings)])), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...r.config.rules.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.level.toUpperCase().padEnd(8)} ${f.rule.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.found}`);
    out.push(`${PAD}fix: ${f.fix}`);
    if (explain) {
      out.push(`${PAD}rule: ${r.config.rules.find((x) => x.id === f.rule).rule}`);
      for (const b of f.basis) out.push(`${PAD}basis: ${b.text} (${b.source}, ${b.url})`);
      if (f.own) out.push(`${PAD}the tool's own choice: ${f.own}`);
    }
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined, own: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

// The message of a workflow command: %, CR and LF escaped.
export const escapeData = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// A property of a workflow command: also : and , escaped.
export const escapeProperty = (t) => escapeData(t).replace(/:/g, '%3A').replace(/,/g, '%2C');

const COMMANDS = { error: 'error', warning: 'warning', info: 'notice' };

export function toGithub(r) {
  const out = [];
  for (const f of r.findings) {
    const props = [`file=${escapeProperty(f.file)}`, `line=${f.line}`, ...(f.column ? [`col=${f.column}`] : []), `title=${escapeProperty(`update-feed-check ${f.rule}`)}`];
    out.push(`::${COMMANDS[f.level]} ${props.join(',')}::${escapeData(`${f.found}; fix: ${f.fix}`)}`);
  }
  out.push(`update-feed-check: ${plural(r.totals.feeds, 'feed')}, ${plural(r.totals.findings, 'finding')}; RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}
