// A run: read the configuration, list the folders and files named, read each feed with the reader of its kind, run the
// checks across feeds, the previous feed and the dist folder, and build the report of the run. A path on the command
// line that cannot be used (missing, a link, a file of no known kind, a dist that is not a folder, a previous feed that
// cannot be read) or a configuration with a problem stops the run with an InputError and no result. A feed that cannot
// be read, and input past the limits of a run, are error findings of their own, so the run fails at the default level
// and never passes because a part of the input was passed over.

import { ConfigError, defaultConfig, readConfig } from './config.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { readElectron } from './electron.js';
import { FeedError } from './feed.js';
import { FILE_LIMITS, digestFile, inspectPath, readText, readTextFile } from './files.js';
import { JsonError, lineStarts, positionOf } from './json.js';
import { KINDS, fileKind, kindLabel } from './kinds.js';
import { distFindings, electronPlatformFindings, mixedVersionFindings, previousFindings } from './release.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { grouped, plural } from './size.js';
import { readSparkle } from './sparkle.js';
import { readSquirrel } from './squirrel.js';
import { readTauri } from './tauri.js';
import { safeText } from './text.js';
import { WALK_LIMITS, listDist, listFolder } from './walk.js';
import { XmlError } from './xml.js';
import { YamlError } from './yaml.js';
import { baseName, byCode, folderOf, joinPath } from './words.js';

export const LIMITS = { ...FILE_LIMITS, ...WALK_LIMITS, maxFeeds: 1000, maxFindingsPerRule: 500, maxInputs: 100 };
export const MAX_PROBLEMS = 20;

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

// The level of a rule under a configuration: the rules of input problems are always errors.
export function levelOf(rule, config) {
  return rule.key === null ? 'error' : config.rules[rule.key];
}

const READERS = { electron: readElectron, sparkle: readSparkle, tauri: readTauri, squirrel: readSquirrel };

// Reads one feed of a kind: { feed, findings: [{ rule, offset, found }], place } where place gives the line and column
// of an offset. A file that cannot be read gives one unreadable-feed finding and no feed.
export async function readFeed(full, shown, kind, name, config, maxBytes) {
  let text;
  try {
    ({ text } = await readText(full, shown, maxBytes));
  } catch (error) {
    return { feed: null, findings: [{ rule: 'unreadable-feed', offset: 0, found: `the file cannot be read: ${error.reason ?? error.message}; nothing in it is checked` }], place: () => ({ line: 1, column: 1 }) };
  }
  const starts = lineStarts(text);
  const place = (offset) => positionOf(starts, Math.max(0, Math.min(offset, text.length)));
  const lineOf = (offset) => place(offset).line;
  try {
    const r = READERS[kind](text, name, kind === 'tauri' ? config : lineOf);
    return { ...r, place };
  } catch (error) {
    if (error instanceof YamlError || error instanceof XmlError || error instanceof JsonError || error instanceof FeedError) {
      return { feed: null, findings: [{ rule: 'unreadable-feed', offset: error.offset, found: `the file cannot be read as a${kind === 'electron' ? 'n' : ''} ${kindLabel(kind)} feed: ${error.reason}; nothing in it is checked` }], place };
    }
    throw error;
  }
}

// The run as a report object. inputs is what was named and listed; feeds are the feeds read, [{ file, kind, feed }];
// raw are the findings, [{ rule, file, line, column, found }].
export function buildReport({ inputs, feeds, raw, config, minSeverity, failOn, version, notes: extraNotes = [], limits = LIMITS }) {
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const level = (id) => levelOf(RULES.find((r) => r.id === id), config);
  const kindOfFile = new Map(feeds.map((f) => [f.file, f.kind]));
  const all = raw
    .filter((f) => level(f.rule) !== 'off')
    .map((f) => ({ ...f, level: level(f.rule), kind: kindOfFile.get(f.file) ?? null }))
    .sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || byCode(a.file, b.file) || a.line - b.line || a.column - b.column || ruleOrder.get(a.rule) - ruleOrder.get(b.rule));
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) {
      cut += 1;
      continue;
    }
    const rule = RULES.find((r) => r.id === f.rule);
    findings.push({
      rule: f.rule,
      level: f.level,
      kind: f.kind,
      file: safeText(f.file),
      line: f.line,
      column: f.column,
      at: `${safeText(f.file)}:${f.line}`,
      found: safeText(f.found, 800),
      fix: rule.fix,
      basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })),
      own: rule.own
    });
  }
  const result = decide(shown, failOn);
  const shownFeeds = feeds.map((f) => {
    const mine = all.filter((x) => x.file === f.file);
    const byLevel = { error: 0, warning: 0, info: 0 };
    for (const x of mine) byLevel[x.level] += 1;
    return { file: safeText(f.file), kind: f.kind, version: f.feed && f.feed.shownVersion !== null ? safeText(f.feed.shownVersion, 80) : null, entries: f.feed ? f.feed.entries : 0, read: f.feed !== null, findings: mine.length, byLevel };
  });
  const rules = RULES.map((r) => ({ id: r.id, level: level(r.id), findings: all.filter((f) => f.rule === r.id).length }));
  const byKind = Object.fromEntries(KINDS.map((k) => [k.kind, feeds.filter((f) => f.kind === k.kind).length]));
  const notes = [];
  if (!feeds.length) notes.push('the input holds no feed of the kinds the tool reads');
  if (inputs.links) notes.push(`${plural(inputs.links, 'symbolic link')} ${inputs.links === 1 ? 'is' : 'are'} not followed`);
  notes.push(...extraNotes);
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown`);
  const off = RULES.filter((r) => r.key !== null && levelOf(r, config) === 'off');
  if (off.length) notes.push(`${plural(off.length, 'rule')} ${off.length === 1 ? 'is' : 'are'} off: ${off.map((r) => r.id).join(', ')}`);
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  return {
    tool: 'update-feed-check',
    version,
    input: {
      paths: inputs.paths.map((p) => safeText(p)),
      folders: inputs.folders,
      files: inputs.files,
      feeds: feeds.length,
      byKind,
      otherFiles: inputs.others,
      foldersPassedOver: inputs.subfolders,
      links: inputs.links,
      dist: inputs.dist ? { folder: safeText(inputs.dist.shown), files: inputs.dist.count } : null,
      previous: inputs.previous ? { path: safeText(inputs.previous.shown), feeds: inputs.previous.feeds } : null
    },
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      requiredPlatforms: config.requiredPlatforms,
      minSeverity,
      failOn,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: levelOf(r, config), rule: safeText(r.rule(config), 600) }))
    },
    feeds: shownFeeds,
    rules,
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut, feeds: shownFeeds.length },
    result,
    notes: notes.map((n) => safeText(n, 600)),
    notice: NOTICE
  };
}

// The feeds named on the command line: folders are listed, files kept as they are. Returns { list, inputs, problems }
// where list is [{ full, shown, kind, name, group, fromFolder }].
async function gather(paths, kind, base, lim, what) {
  const problems = [];
  const list = [];
  const inputs = { paths: [], folders: 0, files: 0, others: 0, subfolders: 0, links: 0, limits: [] };
  const seen = new Set();
  for (const p of paths) {
    let info;
    try {
      info = await inspectPath(p, base);
    } catch (error) {
      problems.push(`${what}${error.message}`);
      continue;
    }
    if (seen.has(info.full)) {
      problems.push(`${what}${info.shown}: is named twice`);
      continue;
    }
    seen.add(info.full);
    inputs.paths.push(info.shown);
    if (info.folder) {
      inputs.folders += 1;
      let listed;
      try {
        listed = await listFolder(info.full, { kind, limits: lim });
      } catch (error) {
        problems.push(`${what}${info.shown}: the folder cannot be read (${error.code ?? error.message})`);
        continue;
      }
      inputs.others += listed.others;
      inputs.subfolders += listed.folders;
      inputs.links += listed.links;
      if (listed.limit) inputs.limits.push({ shown: info.shown, limit: listed.limit });
      for (const f of listed.feeds) list.push({ full: f.full, shown: joinPath(info.shown, f.name), kind: f.kind, name: f.name, group: info.shown, fromFolder: true });
    } else {
      inputs.files += 1;
      const name = baseName(info.shown);
      const k = kind ?? fileKind(name);
      if (k === null) problems.push(`${what}${info.shown}: the kind of the feed is not known from its name; give --kind electron, sparkle, tauri or squirrel`);
      else list.push({ full: info.full, shown: info.shown, kind: k, name, group: folderOf(info.shown), fromFolder: false });
    }
  }
  return { list, inputs, problems };
}

// Reads the inputs, runs every check and builds the report object of the run.
export async function checkPaths({ paths, kind = null, dist: distPath = null, previous: previousPath = null, config: configPath = null, minSeverity = null, failOn = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  const lim = { ...LIMITS, ...limits };
  let config;
  try {
    if (configPath) {
      const c = await readTextFile(configPath, base, lim.maxConfigBytes);
      config = readConfig(c.text, c.file);
    } else config = defaultConfig();
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  const { list, inputs, problems } = await gather(paths, kind, base, lim, '');

  let dist = null;
  if (distPath !== null) {
    try {
      const info = await inspectPath(distPath, base);
      if (!info.folder) problems.push(`--dist ${info.shown}: is a file; give the folder that holds the built files of the release`);
      else dist = { shown: info.shown, ...(await listDist(info.full, { limits: lim })) };
    } catch (error) {
      problems.push(`--dist ${error.code ? `${distPath}: the folder cannot be read (${error.code})` : error.message}`);
    }
  }

  let previous = null;
  if (previousPath !== null) {
    const g = await gather([previousPath], kind, base, lim, '--previous ');
    problems.push(...g.problems);
    if (!g.problems.length) {
      const feeds = [];
      for (const f of g.list) {
        const r = await readFeed(f.full, f.shown, f.kind, f.name, config, lim.maxFeedBytes);
        if (!r.feed) problems.push(`--previous ${f.shown}: ${r.findings[0].found.replace('; nothing in it is checked', '')}`);
        else feeds.push({ file: f.shown, kind: f.kind, name: f.name, feed: r.feed });
      }
      if (!feeds.length && !problems.length) problems.push(`--previous ${g.inputs.paths[0]}: holds no feed of the kinds the tool reads`);
      previous = { shown: g.inputs.paths[0], feeds: feeds.length, list: feeds };
    }
  }
  if (problems.length) throw new InputError(capped(problems));

  const raw = [];
  const feeds = [];
  const places = new Map();
  for (const l of inputs.limits) raw.push({ rule: 'scan-limit', file: l.shown, line: 1, column: 1, found: `the folder holds ${l.limit}; the listing stopped there, and the rest of the folder is not read` });
  let read = list;
  if (list.length > lim.maxFeeds) {
    raw.push({ rule: 'scan-limit', file: inputs.paths[0], line: 1, column: 1, found: `the input holds more than ${grouped(lim.maxFeeds)} feeds; the first ${grouped(lim.maxFeeds)} are read and the rest is not` });
    read = list.slice(0, lim.maxFeeds);
  }
  for (const f of read) {
    const r = await readFeed(f.full, f.shown, f.kind, f.name, config, lim.maxFeedBytes);
    places.set(f.shown, r.place);
    for (const x of r.findings) raw.push({ rule: x.rule, file: f.shown, ...r.place(x.offset), found: x.found });
    feeds.push({ file: f.shown, kind: f.kind, name: f.name, group: f.group, fromFolder: f.fromFolder, feed: r.feed });
  }
  const across = [...mixedVersionFindings(feeds), ...electronPlatformFindings(feeds, config)];
  const extraNotes = [];
  if (previous) {
    const p = previousFindings(feeds, previous.list);
    across.push(...p.findings);
    if (p.unmatched) extraNotes.push(`${plural(p.unmatched, 'feed')} ${p.unmatched === 1 ? 'has' : 'have'} no feed of the same name or kind in --previous, so ${p.unmatched === 1 ? 'its version is' : 'their versions are'} not compared`);
  }
  if (dist) {
    across.push(...(await distFindings(feeds, dist, (full, algo) => digestFile(full, algo, lim.maxDistBytes))));
    if (dist.limit) raw.push({ rule: 'scan-limit', file: dist.shown, line: 1, column: 1, found: `the dist folder holds ${dist.limit}; the listing stopped there, so a file past it is reported as missing` });
  }
  for (const x of across) raw.push({ rule: x.rule, file: x.file, ...places.get(x.file)(x.offset), found: x.found });
  return buildReport({
    inputs: { ...inputs, dist: dist ? { shown: dist.shown, count: dist.count } : null, previous: previous ? { shown: previous.shown, feeds: previous.feeds } : null },
    feeds,
    raw,
    config,
    minSeverity: minSeverity ?? config.minSeverity,
    failOn: failOn ?? config.failOn,
    version,
    notes: extraNotes,
    limits: lim
  });
}
