// Words compared as the tool compares them: the letters A to Z lowered whatever the locale. Used for the names of
// files, the kinds of feeds, the targets of Tauri and the suggestions of the configuration.

// Lowercase for the letters A to Z only, so the result does not depend on the locale.
export const asciiLower = (text) => String(text).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

// The last part of a path with forward slashes: "a/b/latest.yml" is "latest.yml".
export const baseName = (path) => String(path).slice(String(path).lastIndexOf('/') + 1);

// A path with forward slashes and no trailing slash, the parts joined: joinPath("a", "b") is "a/b", and "." is left out.
export const joinPath = (a, b) => (a === '' || a === '.' ? b : b === '' || b === '.' ? a : `${a}/${b}`);

// The folder of a path with forward slashes: "a/b/latest.yml" is "a/b", and "latest.yml" is ".".
export function folderOf(path) {
  const at = String(path).lastIndexOf('/');
  return at < 0 ? '.' : String(path).slice(0, at);
}

// Two texts in the order of their UTF-16 code units, with no locale.
export const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
