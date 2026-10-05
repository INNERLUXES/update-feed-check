// A small reader of the part of YAML that electron-updater feeds use: one document of block mappings and block
// sequences, with plain, single-quoted and double-quoted scalars on one line, literal (|) and folded (>) block
// scalars, comments and an optional --- at the start. It reads the text once, a line at a time, with a list of open
// blocks of its own and no recursion. Everything else is refused with its place, rather than read in a way that
// differs from the reader of the app: anchors and aliases (& and *), tags (!), flow collections other than the empty
// [] and {}, complex keys (?), directives (%), a second document, tabs in the indentation, a quoted scalar over several
// lines, a plain scalar continued on the next line, and a key named twice in one mapping. Every scalar is kept as text
// with its offset; the checks decide what a value means.

export const YAML_LIMITS = { maxDepth: 32, maxNodes: 100000 };

export class YamlError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

const ESCAPES = { '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\' };
const INDICATORS = '&*!%@`{[?|>';

// The lines of a text: [{ start, end }], end before the line break; a line ends at LF, CR LF or CR.
function splitLines(text, from) {
  const lines = [];
  let start = from;
  for (let i = from; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13) {
      lines.push({ start, end: i });
      if (c === 13 && text.charCodeAt(i + 1) === 10) i += 1;
      start = i + 1;
    }
  }
  if (start < text.length) lines.push({ start, end: text.length });
  return lines;
}

const isItem = (c) => c === '-' || c.startsWith('- ');

// The offset where a comment starts in a plain value (a # after a space), or -1.
function commentAt(text) {
  for (let i = 1; i < text.length; i += 1) if (text[i] === '#' && text[i - 1] === ' ') return i;
  return -1;
}

// Reads a quoted scalar that starts at text[0]; returns { value, end } where end is the index after the closing quote.
function readQuoted(text, offset, fail) {
  const q = text[0];
  let out = '';
  let i = 1;
  for (;;) {
    if (i >= text.length) fail(`a ${q === '"' ? 'double' : 'single'}-quoted value that is not closed on its line; the tool reads quoted values on one line only`, offset);
    const c = text[i];
    if (q === "'" && c === "'") {
      if (text[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, end: i + 1 };
    }
    if (q === '"' && c === '"') return { value: out, end: i + 1 };
    if (q === '"' && c === '\\') {
      const e = text[i + 1];
      if (e === 'x' || e === 'u' || e === 'U') {
        const width = e === 'x' ? 2 : e === 'u' ? 4 : 8;
        const hex = text.slice(i + 2, i + 2 + width);
        if (hex.length !== width || ![...hex].every((h) => '0123456789abcdefABCDEF'.includes(h))) fail(`an escape \\${e} that is not followed by ${width} hexadecimal digits`, offset + i);
        const code = parseInt(hex, 16);
        if (code > 0x10ffff) fail('an escape of a code point above U+10FFFF', offset + i);
        out += String.fromCodePoint(code);
        i += 2 + width;
        continue;
      }
      if (e === undefined || !Object.hasOwn(ESCAPES, e)) fail(`an escape \\${(e ?? '').slice(0, 1)} that YAML does not have`, offset + i);
      out += ESCAPES[e];
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
}

// Reads a YAML text. Returns the root node: { type: 'map', entries: [{ key, keyOffset, value }], offset },
// { type: 'seq', items, offset } or, for values, { type: 'scalar', value, style, offset } where style is plain,
// single, double, literal, folded or empty. Throws YamlError with the offset of the problem.
export function parseYaml(text, limits = YAML_LIMITS) {
  const lim = { ...YAML_LIMITS, ...limits };
  const lines = splitLines(text, text.charCodeAt(0) === 0xfeff ? 1 : 0);
  const fail = (reason, offset) => {
    throw new YamlError(reason, offset);
  };
  let nodes = 0;
  const count = (node) => {
    nodes += 1;
    if (nodes > lim.maxNodes) fail(`more than ${lim.maxNodes} values`, node.offset);
    return node;
  };
  const scalar = (value, style, offset) => count({ type: 'scalar', value, style, offset });
  const newMap = (offset) => count({ type: 'map', entries: [], offset });
  const newSeq = (offset) => count({ type: 'seq', items: [], offset });

  let root = null;
  const stack = [];
  let pending = null;
  let started = false;
  let ended = false;
  let li = 0;

  const push = (node, indent, offset) => {
    if (stack.length >= lim.maxDepth) fail(`values nested more than ${lim.maxDepth} deep`, offset);
    stack.push({ node, indent });
  };

  // A block scalar after | or >: the lines below that are more indented than the parent, or blank.
  const blockScalar = (header, offset, parentIndent) => {
    const style = header[0] === '|' ? 'literal' : 'folded';
    let chomp = 'clip';
    let rest = header.slice(1);
    if (rest[0] === '-' || rest[0] === '+') {
      chomp = rest[0] === '-' ? 'strip' : 'keep';
      rest = rest.slice(1);
    }
    rest = rest.trim();
    if (rest !== '' && !rest.startsWith('#')) fail('a block scalar header with an indentation number or other text; the tool reads |, |-, |+, >, >- and >+ only', offset);
    const body = [];
    let indent = -1;
    while (li + 1 < lines.length) {
      const next = lines[li + 1];
      const raw = text.slice(next.start, next.end);
      let n = 0;
      while (raw[n] === ' ') n += 1;
      const blank = raw.trim() === '';
      if (!blank && n <= parentIndent) break;
      if (!blank && raw[n] === '\t' && indent < 0) fail('a tab in the indentation', next.start + n);
      if (!blank && indent < 0) indent = n;
      if (!blank && n < indent) fail('a line of a block scalar that is less indented than its first line', next.start + n);
      body.push(blank ? '' : raw.slice(indent));
      li += 1;
    }
    let value;
    if (style === 'literal') value = body.join('\n');
    else {
      value = '';
      for (let i = 0; i < body.length; i += 1) {
        const line = body[i];
        if (i === 0) value = line;
        else if (line === '' || body[i - 1] === '' || line[0] === ' ' || body[i - 1][0] === ' ') value += `\n${line}`;
        else value += ` ${line}`;
      }
      value = value.replace(/\n\n/g, '\n');
    }
    const trimmed = value.replace(/\n+$/, '');
    if (chomp === 'strip') value = trimmed;
    else if (chomp === 'clip') value = trimmed === '' ? '' : `${trimmed}\n`;
    else value = body.length ? `${value}\n` : '';
    return scalar(value, style, offset);
  };

  // A value written after "key:" or "- ".
  const readValue = (raw, offset, parentIndent) => {
    const v = raw;
    if (v[0] === '"' || v[0] === "'") {
      const q = readQuoted(v, offset, fail);
      const after = v.slice(q.end).trim();
      if (after !== '' && !after.startsWith('#')) fail('text after the closing quote', offset + q.end);
      return scalar(q.value, v[0] === '"' ? 'double' : 'single', offset);
    }
    if (v[0] === '|' || v[0] === '>') return blockScalar(v, offset, parentIndent);
    const at = commentAt(v);
    const plain = (at < 0 ? v : v.slice(0, at)).trimEnd();
    if (plain === '[]') return newSeq(offset);
    if (plain === '{}') return newMap(offset);
    if (plain[0] === '&' || plain[0] === '*') fail('an anchor or an alias; the tool does not read them, write the value itself', offset);
    if (plain[0] === '!') fail('a tag; the tool does not read tags', offset);
    if (plain[0] === '[' || plain[0] === '{') fail('a flow collection; write the list or mapping as a block, one entry a line', offset);
    if (INDICATORS.includes(plain[0])) fail(`a value that starts with ${plain[0]}; put it in quotes`, offset);
    if (plain.includes(': ') || plain.endsWith(':')) fail('a value that holds ": "; put it in quotes', offset);
    return scalar(plain, 'plain', offset);
  };

  // Splits "key: rest" into the key and the rest, or fails.
  const splitKey = (c, offset) => {
    let key;
    let after;
    if (c[0] === '"' || c[0] === "'") {
      const q = readQuoted(c, offset, fail);
      key = q.value;
      after = q.end;
      while (c[after] === ' ') after += 1;
      if (c[after] !== ':' || (after + 1 < c.length && c[after + 1] !== ' ')) fail('a quoted key that is not followed by a colon', offset);
    } else {
      if (INDICATORS.includes(c[0])) fail(`a key that starts with ${c[0]}; the tool does not read anchors, tags, flow collections or complex keys`, offset);
      after = -1;
      for (let i = 0; i < c.length; i += 1) {
        if (c[i] === '#' && i > 0 && c[i - 1] === ' ') break;
        if (c[i] === ':' && (i + 1 === c.length || c[i + 1] === ' ')) {
          after = i;
          break;
        }
      }
      if (after < 0) fail('a line that is neither "key: value" nor "- item"', offset);
      key = c.slice(0, after).trimEnd();
      if (key === '') fail('an empty key', offset);
      if (INDICATORS.includes(key[0])) fail(`a key that starts with ${key[0]}; the tool does not read anchors, tags, flow collections or complex keys`, offset);
    }
    let restAt = after + 1;
    while (c[restAt] === ' ') restAt += 1;
    return { key, rest: c.slice(restAt), restOffset: offset + restAt };
  };

  const attachPending = (child) => {
    if (pending.kind === 'key') pending.entry.value = child;
    else pending.seq.items.push(child);
  };

  for (; li < lines.length; li += 1) {
    const { start, end } = lines[li];
    const raw = text.slice(start, end);
    let indent = 0;
    while (raw[indent] === ' ') indent += 1;
    const c = raw.slice(indent).trimEnd();
    if (c === '' || c[0] === '#') continue;
    if (raw[indent] === '\t') fail('a tab in the indentation; YAML indents with spaces', start + indent);
    if (ended) fail('content after the end of the document (...)', start);
    if (indent === 0 && (c === '---' || c.startsWith('--- '))) {
      if (started || root !== null) fail('a second document; a feed holds one', start);
      started = true;
      const rest = c.slice(3).trim();
      if (rest !== '' && rest[0] !== '#') fail('a value on the line of ---', start);
      continue;
    }
    if (indent === 0 && c === '...') {
      ended = true;
      continue;
    }
    if (indent === 0 && c[0] === '%') fail('a directive; the tool does not read directives', start);
    const offset = start + indent;
    if (root === null) {
      if (indent !== 0) fail('the document starts indented', offset);
      root = isItem(c) ? newSeq(offset) : newMap(offset);
      push(root, 0, offset);
    }
    if (pending) {
      const item = isItem(c);
      if (indent > pending.indent || (pending.kind === 'key' && indent === pending.indent && item)) {
        const child = item ? newSeq(offset) : newMap(offset);
        attachPending(child);
        push(child, indent, offset);
      } else attachPending(scalar('', 'empty', pending.offset));
      pending = null;
    }
    while (stack.length && stack.at(-1).indent > indent) stack.pop();
    let top = stack.at(-1);
    if (!top || top.indent !== indent) fail('a line whose indentation matches no open block', offset);
    if (top.node.type === 'seq' && !isItem(c) && stack.length > 1) {
      stack.pop();
      top = stack.at(-1);
      if (top.indent !== indent || top.node.type !== 'map') fail('a line whose indentation matches no open block', offset);
    }
    let cur = c;
    let curIndent = indent;
    let curOffset = offset;
    for (;;) {
      top = stack.at(-1);
      if (isItem(cur)) {
        if (top.node.type !== 'seq') fail('a list item where a key was expected', curOffset);
        let spaces = 1;
        while (cur[spaces] === ' ') spaces += 1;
        const rest = cur.slice(spaces);
        const restOffset = curOffset + spaces;
        if (rest === '' || rest[0] === '#') {
          pending = { kind: 'item', seq: top.node, indent: curIndent, offset: curOffset };
          break;
        }
        if (isItem(rest)) {
          const s = newSeq(restOffset);
          top.node.items.push(s);
          push(s, curIndent + spaces, restOffset);
          cur = rest;
          curIndent += spaces;
          curOffset = restOffset;
          continue;
        }
        const looksLikeKey = rest[0] !== '"' && rest[0] !== "'" && rest[0] !== '|' && rest[0] !== '>' ? (rest.includes(': ') || rest.endsWith(':')) && !rest.startsWith('[') && !rest.startsWith('{') : /^(?:"[^"]*"|'[^']*')\s*:(?: |$)/.test(rest);
        if (looksLikeKey) {
          const m = newMap(restOffset);
          top.node.items.push(m);
          push(m, curIndent + spaces, restOffset);
          cur = rest;
          curIndent += spaces;
          curOffset = restOffset;
          continue;
        }
        top.node.items.push(readValue(rest, restOffset, curIndent));
        break;
      }
      if (top.node.type !== 'map') fail('a key where a list item was expected', curOffset);
      const { key, rest, restOffset } = splitKey(cur, curOffset);
      if (top.node.entries.some((e) => e.key === key)) fail(`the key "${key.slice(0, 60)}" appears twice in one mapping, so which value a reader keeps cannot be predicted`, curOffset);
      const entry = { key, keyOffset: curOffset, value: null };
      top.node.entries.push(entry);
      if (rest === '' || rest[0] === '#') {
        pending = { kind: 'key', entry, indent: curIndent, offset: restOffset };
        break;
      }
      entry.value = readValue(rest, restOffset, curIndent);
      break;
    }
  }
  if (pending) attachPending(scalar('', 'empty', pending.offset));
  if (root === null) fail('the file holds no YAML content', 0);
  return root;
}

// The value of a key of a mapping node, or undefined.
export const entryOf = (map, key) => (map && map.type === 'map' ? map.entries.find((e) => e.key === key) : undefined);
