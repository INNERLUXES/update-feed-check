// Versions as the feeds write them, read by hand with no regular expression that can backtrack. A semantic version
// follows semver.org: MAJOR.MINOR.PATCH of numbers with no leading zero, an optional pre-release after a hyphen and
// build metadata after a plus. Tauri also takes a leading v. Sparkle compares sparkle:version as numbers separated by
// dots, and Squirrel.Windows reads the version in the name of a package, which may have a fourth number as NuGet
// versions do. Numbers are compared as strings of digits, so a version of any length compares exactly.

export const MAX_VERSION_LENGTH = 256;

const isDigits = (s) => s.length > 0 && [...s].every((c) => c >= '0' && c <= '9');
const isIdent = (s) => s.length > 0 && [...s].every((c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '-');
const noLeadingZero = (s) => s === '0' || s[0] !== '0';

// The parts after the numbers: "-rc.1+build.5" is { pre: ['rc', '1'], build: ['build', '5'] }, or a reason.
function tail(rest) {
  let pre = [];
  let build = [];
  let text = rest;
  const plus = text.indexOf('+');
  if (plus >= 0) {
    build = text.slice(plus + 1).split('.');
    text = text.slice(0, plus);
    if (!build.every(isIdent)) return { reason: 'the build metadata after + holds an empty part or a character other than letters, digits and hyphens' };
  }
  if (text.length) {
    if (text[0] !== '-') return { reason: 'a pre-release must follow a hyphen' };
    pre = text.slice(1).split('.');
    if (!pre.every(isIdent)) return { reason: 'the pre-release holds an empty part or a character other than letters, digits and hyphens' };
    if (!pre.every((p) => !isDigits(p) || noLeadingZero(p))) return { reason: 'a number of the pre-release has a leading zero' };
  }
  return { pre, build };
}

// Splits "1.2.3-rc.1" into its numbers and the rest at the first hyphen or plus.
function head(text) {
  let end = text.length;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '-' || text[i] === '+') {
      end = i;
      break;
    }
  }
  return { numbers: text.slice(0, end).split('.'), rest: text.slice(end) };
}

// A semantic version: { parts, pre, build, text } or { reason }.
export function parseSemver(value, { leadingV = false } = {}) {
  let text = String(value);
  if (text.length === 0) return { reason: 'the version is empty' };
  if (text.length > MAX_VERSION_LENGTH) return { reason: `the version is longer than ${MAX_VERSION_LENGTH} characters` };
  if (text[0] === 'v' || text[0] === 'V') {
    if (!leadingV) return { reason: 'a leading v is not part of a semantic version' };
    text = text.slice(1);
  }
  const { numbers, rest } = head(text);
  if (numbers.length !== 3 || !numbers.every(isDigits)) return { reason: 'a semantic version is three numbers, MAJOR.MINOR.PATCH' };
  if (!numbers.every(noLeadingZero)) return { reason: 'a number of the version has a leading zero' };
  const t = tail(rest);
  if (t.reason) return t;
  return { parts: numbers, pre: t.pre, build: t.build, text: String(value) };
}

// A Sparkle version or a minimum system version: numbers separated by dots, { parts, pre: [], build: [] } or
// { reason }.
export function parseDotted(value) {
  const text = String(value).trim();
  if (text.length === 0) return { reason: 'the version is empty' };
  if (text.length > MAX_VERSION_LENGTH) return { reason: `the version is longer than ${MAX_VERSION_LENGTH} characters` };
  const parts = text.split('.');
  if (!parts.every(isDigits)) return { reason: 'it is not a number or numbers separated by dots' };
  return { parts, pre: [], build: [], text };
}

// The version in the name of a Squirrel.Windows package: three or four numbers and an optional pre-release.
export function parsePackageVersion(value) {
  const text = String(value);
  if (text.length === 0 || text.length > MAX_VERSION_LENGTH) return { reason: 'the version is empty or too long' };
  const { numbers, rest } = head(text);
  if (numbers.length < 3 || numbers.length > 4 || !numbers.every(isDigits)) return { reason: 'a package version is three or four numbers separated by dots' };
  const t = tail(rest);
  if (t.reason) return t;
  return { parts: numbers, pre: t.pre, build: t.build, text };
}

// Two strings of digits compared as numbers, of any length.
export function compareDigits(a, b) {
  const x = a.replace(/^0+(?=\d)/, '');
  const y = b.replace(/^0+(?=\d)/, '');
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  return x < y ? -1 : x > y ? 1 : 0;
}

// Two parsed versions compared as semver.org orders them: the numbers first, a missing number counted as 0, then a
// pre-release below its release, identifiers compared one by one (numbers below words), and build metadata left out.
export function compareVersions(a, b) {
  const n = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < n; i += 1) {
    const c = compareDigits(a.parts[i] ?? '0', b.parts[i] ?? '0');
    if (c) return c;
  }
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i += 1) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const dx = isDigits(x);
    const dy = isDigits(y);
    if (dx && dy) {
      const c = compareDigits(x, y);
      if (c) return c;
    } else if (dx !== dy) return dx ? -1 : 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// The version as the reports show it, with a leading v removed and no build metadata.
export function versionText(parsed) {
  return `${parsed.parts.join('.')}${parsed.pre.length ? `-${parsed.pre.join('.')}` : ''}`;
}
