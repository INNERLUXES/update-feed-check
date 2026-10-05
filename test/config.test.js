import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, DEFAULT_REQUIRED_PLATFORMS, DEFAULT_RULES, KEYS, defaultConfig, defaultsAsConfig, distance, isTauriTarget, kindOf, readConfig, suggestion, validateConfig } from '../src/index.js';
import { GOOD, configOf, run } from './helpers.js';

// The configuration file: every key with a good value and a bad one, unknown keys with their line and a suggestion,
// and a key named twice refused.

const problems = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  return [];
};

test('config: the defaults, and --print-defaults read back give the same configuration', () => {
  const d = defaultConfig();
  assert.deepEqual(d.rules, DEFAULT_RULES);
  assert.deepEqual(d.requiredPlatforms, DEFAULT_REQUIRED_PLATFORMS);
  assert.equal(d.minSeverity, 'info');
  assert.equal(d.failOn, 'error');
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null }, d);
  assert.deepEqual(Object.keys(KEYS), ['name', 'rules', 'requiredPlatforms', 'minSeverity', 'failOn']);
});

test('config: every key with a good value is taken', () => {
  const c = configOf({ name: 'Release review', rules: { mixedHosts: 'error', missingReleaseNotes: 'off' }, requiredPlatforms: { tauri: ['windows-aarch64', 'linux-armv7'], electron: ['beta.yml'] }, minSeverity: 'warning', failOn: 'warning' });
  assert.equal(c.name, 'Release review');
  assert.equal(c.rules.mixedHosts, 'error');
  assert.equal(c.rules.missingReleaseNotes, 'off');
  assert.deepEqual(c.requiredPlatforms, { tauri: ['windows-aarch64', 'linux-armv7'], electron: ['beta.yml'] });
  assert.equal(c.minSeverity, 'warning');
  assert.equal(c.failOn, 'warning');
  assert.deepEqual(configOf({ requiredPlatforms: { tauri: [] } }).requiredPlatforms.electron, DEFAULT_REQUIRED_PLATFORMS.electron, 'a list not given keeps its default');
  assert.deepEqual(configOf({ requiredPlatforms: { tauri: ['linux-x86_64', 'linux-x86_64'] } }).requiredPlatforms.tauri, ['linux-x86_64'], 'a target named twice is kept once');
});

test('config: an unknown key is an error with its line and a suggestion, at the top, in rules and in requiredPlatforms', () => {
  assert.deepEqual(problems('{\n  "failOm": "error"\n}'), ['c.json: line 2: "failOm" is not a key of the configuration; did you mean "failOn"?']);
  assert.deepEqual(problems('{\n  "rules": {\n    "mixedHost": "off"\n  }\n}'), ['c.json: line 3: "mixedHost" is not a key of rules; did you mean "mixedHosts"?']);
  assert.deepEqual(problems('{"requiredPlatforms": {"tuari": []}}'), ['c.json: line 1: "tuari" is not a key of requiredPlatforms; did you mean "tauri"?']);
  assert.deepEqual(problems('{"colour": 1}'), ['c.json: line 1: "colour" is not a key of the configuration']);
});

test('config: a value of the wrong kind is an error, and all problems are listed in the order of their lines', () => {
  const p = problems('{\n  "name": "",\n  "rules": {"mixedHosts": "loud", "itemOrder": 3},\n  "requiredPlatforms": {"tauri": ["windows-x64", 5], "electron": ["latest.exe"]},\n  "minSeverity": "fatal",\n  "failOn": null\n}');
  assert.deepEqual(p, [
    'c.json: line 2: name must be a text of 1 to 120 characters',
    'c.json: line 3: rules.mixedHosts must be one of info, warning, error, off, not "loud"',
    'c.json: line 3: rules.itemOrder must be one of info, warning, error, off, not 3',
    'c.json: line 4: requiredPlatforms.tauri[0]: "windows-x64" is not a Tauri target OS-ARCH, with OS linux, darwin, windows and ARCH x86_64, aarch64, i686, armv7',
    'c.json: line 4: requiredPlatforms.tauri[1] must be a text, not a number',
    'c.json: line 4: requiredPlatforms.electron[0]: "latest.exe" is not the name of a feed file such as latest-mac.yml',
    'c.json: line 5: minSeverity must be one of info, warning, error',
    'c.json: line 6: failOn must be one of info, warning, error'
  ]);
  assert.deepEqual(problems('{"rules": []}'), ['c.json: line 1: rules must be an object, not a list']);
  assert.deepEqual(problems('{"requiredPlatforms": {"tauri": "linux-x86_64"}}'), ['c.json: line 1: requiredPlatforms.tauri must be a list, not a string']);
  assert.deepEqual(problems('{"requiredPlatforms": []}'), ['c.json: line 1: requiredPlatforms must be an object, not a list']);
  assert.deepEqual(problems(`{"requiredPlatforms": {"tauri": ${JSON.stringify(Array(51).fill('linux-x86_64'))}}}`), ['c.json: line 1: requiredPlatforms.tauri holds more than 50 entries']);
});

test('config: JSON that is not strict, a name given twice and a value that is not an object are refused', () => {
  assert.match(problems('{"failOn": "error",}')[0], /c\.json: line 1, column 20: a comma before the closing brace/);
  assert.match(problems('{"failOn": "error", "failOn": "info"}')[0], /appears twice in one object/);
  assert.match(problems('// comment\n{}')[0], /a comment; JSON has no comments/);
  assert.deepEqual(problems('[]'), ['c.json: line 1: the configuration must be a JSON object, not a list']);
  assert.throws(() => validateConfig('x'), ConfigError);
});

test('config: the suggestion and the target checks', () => {
  assert.equal(distance('nmae', 'name'), 1);
  assert.equal(suggestion('x'.repeat(70), ['name']), '');
  assert.equal(suggestion('zzzzzz', ['name']), '');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf({}), 'an object');
  assert.ok(isTauriTarget('darwin-aarch64'));
  assert.ok(!isTauriTarget('darwin-arm64'));
  assert.ok(!isTauriTarget('macos-x86_64'));
  assert.ok(!isTauriTarget('linux'));
});

test('config: through a run, a rule set to off gives no finding and a note, and a bad configuration stops the run with exit code 2', async () => {
  const r = await run({ ...GOOD, 'rel/latest.yml': GOOD['rel/latest.yml'].replace('releaseNotes: Faster start.\n', ''), 'c.json': '{"rules": {"missingReleaseNotes": "off"}}' }, ['rel', '--config', 'c.json']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0\n/);
  assert.match(r.out, /note: 1 rule is off: missing-release-notes\n/);
  const bad = await run({ ...GOOD, 'c.json': '{"failon": "info"}' }, ['rel', '--config', 'c.json']);
  assert.equal(bad.code, 2);
  assert.equal(bad.out, '');
  assert.match(bad.err, /^update-feed-check: no result, the input has a problem:\n {2}c\.json: line 1: "failon" is not a key of the configuration; did you mean "failOn"\?\n$/);
  const missing = await run(GOOD, ['rel', '--config', 'none.json']);
  assert.match(missing.err, /none\.json: no such file or folder/);
});
