import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YamlError, entryOf, parseYaml } from '../src/index.js';
import { lineOf } from './helpers.js';

// The YAML reader: what electron-updater feeds use is read with its places, and everything outside the subset is
// refused with its place rather than read in another way than the reader of the app reads it.

const value = (node, key) => entryOf(node, key).value;
const refused = (text, reason) => assert.throws(() => parseYaml(text), (e) => e instanceof YamlError && reason.test(e.reason), text);

test('yaml: a feed of electron-updater with a list of mappings under a key, in both indents', () => {
  for (const text of ['version: 1.2.0\nfiles:\n  - url: a.exe\n    sha512: abc\n    size: 12\n  - url: b.exe\npath: a.exe\n', 'version: 1.2.0\nfiles:\n- url: a.exe\n  sha512: abc\n  size: 12\n- url: b.exe\npath: a.exe\n']) {
    const root = parseYaml(text);
    assert.equal(value(root, 'version').value, '1.2.0');
    const files = value(root, 'files');
    assert.equal(files.type, 'seq');
    assert.deepEqual(files.items.map((i) => value(i, 'url').value), ['a.exe', 'b.exe']);
    assert.equal(value(files.items[0], 'size').value, '12');
    assert.equal(value(root, 'path').value, 'a.exe');
  }
});

test('yaml: every value keeps the offset of its first character', () => {
  const text = 'version: 1.2.0\nfiles:\n  - url: a.exe\n    sha512: abc\n';
  const root = parseYaml(text);
  assert.equal(value(root, 'version').offset, text.indexOf('1.2.0'));
  assert.equal(value(value(root, 'files').items[0], 'sha512').offset, text.indexOf('abc'));
  assert.equal(entryOf(root, 'files').keyOffset, text.indexOf('files'));
});

test('yaml: quoted scalars, escapes, comments and an empty value', () => {
  const root = parseYaml("a: 'it''s'\nb: \"tab\\tend \\u0041\"\nc: plain # a comment\nd:\n# a line of comment\ne: x#not-a-comment\n");
  assert.equal(value(root, 'a').value, "it's");
  assert.equal(value(root, 'a').style, 'single');
  assert.equal(value(root, 'b').value, 'tab\tend A');
  assert.equal(value(root, 'c').value, 'plain');
  assert.equal(value(root, 'd').style, 'empty');
  assert.equal(value(root, 'e').value, 'x#not-a-comment');
});

test('yaml: literal and folded block scalars with their chomping', () => {
  const root = parseYaml('a: |\n  one\n  two\nb: |-\n  one\n\nc: >\n  one\n  two\n\n  three\nd: x\n');
  assert.equal(value(root, 'a').value, 'one\ntwo\n');
  assert.equal(value(root, 'b').value, 'one');
  assert.equal(value(root, 'c').value, 'one two\nthree\n');
  assert.equal(value(root, 'd').value, 'x');
});

test('yaml: a --- at the start, a ... at the end, a byte order mark and CRLF line ends', () => {
  const root = parseYaml('\ufeff---\r\nversion: 1.0.0\r\nfiles: []\r\n...\r\n');
  assert.equal(value(root, 'version').value, '1.0.0');
  assert.deepEqual(value(root, 'files').items, []);
});

test('yaml: anchors, aliases, tags, flow collections, complex keys and directives are refused', () => {
  refused('a: &x 1\n', /anchor/);
  refused('a: *x\n', /anchor or an alias/);
  refused('a: !!str 1\n', /tag/);
  refused('a: [1, 2]\n', /flow collection/);
  refused('a: {b: 1}\n', /flow collection/);
  refused('? a\n: b\n', /key that starts with \?/);
  refused('%YAML 1.2\n---\na: 1\n', /directive/);
  refused('&a: 1\n', /key that starts with &/);
});

test('yaml: a second document, a tab, a bad indentation and a continued plain value are refused, with their place', () => {
  const second = 'a: 1\n---\nb: 2\n';
  assert.throws(() => parseYaml(second), (e) => /second document/.test(e.reason) && e.offset === second.indexOf('---'));
  refused('a:\n\t- 1\n', /tab/);
  refused('a: 1\n  b: 2\n', /indentation matches no open block/);
  refused('files:\n  - url: a\n  bad: 1\n', /indentation matches no open block/);
  refused('a: one\n  two\n', /indentation/);
  refused('  a: 1\n', /starts indented/);
});

test('yaml: a key named twice, a value with ": ", text after a quote and quotes that do not close are refused', () => {
  const twice = 'version: 1.0.0\nversion: 2.0.0\n';
  assert.throws(() => parseYaml(twice), (e) => /appears twice/.test(e.reason) && e.offset === twice.lastIndexOf('version'));
  refused('a: b: c\n', /holds ": "/);
  refused('a: "x" y\n', /after the closing quote/);
  refused('a: "x\n', /not closed on its line/);
  refused('a: "\\q"\n', /escape \\q/);
  refused('just a line\n', /neither "key: value" nor "- item"/);
  refused('\n# only a comment\n', /no YAML content/);
});

test('yaml: a list at the root, nested lists and a list item on its own line', () => {
  const root = parseYaml('- a\n- - b\n  - c\n-\n  k: v\n');
  assert.equal(root.type, 'seq');
  assert.equal(root.items[0].value, 'a');
  assert.deepEqual(root.items[1].items.map((x) => x.value), ['b', 'c']);
  assert.equal(value(root.items[2], 'k').value, 'v');
});

test('yaml: names such as __proto__ and constructor are plain keys', () => {
  const root = parseYaml('__proto__: 1\nconstructor: 2\ntoString: 3\n');
  assert.deepEqual(root.entries.map((e) => [e.key, e.value.value]), [['__proto__', '1'], ['constructor', '2'], ['toString', '3']]);
  assert.equal({}.polluted, undefined);
});

test('yaml: the limits of depth and of values hold', () => {
  let deep = '';
  for (let i = 0; i < 40; i += 1) deep += `${' '.repeat(i * 2)}k${i}:\n`;
  deep += `${' '.repeat(80)}v: 1\n`;
  refused(deep, /nested more than 32 deep/);
  assert.throws(() => parseYaml('a: 1\nb: 2\nc: 3\n', { maxNodes: 2 }), /more than 2 values/);
  const text = 'version: 1.0.0\nfiles:\n  - url: a\n';
  assert.equal(lineOf(text, 'url'), 3);
});
