// The web addresses of a feed, read with the URL class of Node and never fetched. An address with a scheme is absolute
// and must use https; an address with no scheme is relative to where the feed is served, as electron-updater feeds
// usually write the names of their files. The name of the file an address points at is used to find it in the dist
// folder.

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{0,31}:/;

// What an address is: { absolute, scheme, host, https, name }, where scheme and host are lowered, host is '' when the
// address has none, and name is the last part of its path, decoded, or null when it cannot be a file name.
export function urlInfo(value) {
  const text = String(value).trim();
  if (!SCHEME.test(text)) return { absolute: false, scheme: '', host: '', https: false, name: fileNameOf(text) };
  const scheme = text.slice(0, text.indexOf(':')).toLowerCase();
  let host = '';
  let path = text.slice(text.indexOf(':') + 1);
  try {
    const u = new URL(text);
    host = u.hostname;
    path = u.pathname;
  } catch {
    host = '';
  }
  return { absolute: true, scheme, host, https: scheme === 'https', name: fileNameOf(path) };
}

// The last part of a path with its query and fragment cut off, percent-decoded; null for a name that is empty, a dot
// name or holds a slash or a backslash after decoding.
export function fileNameOf(path) {
  let p = String(path);
  for (const mark of ['?', '#']) {
    const at = p.indexOf(mark);
    if (at >= 0) p = p.slice(0, at);
  }
  const raw = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
  let name;
  try {
    name = decodeURIComponent(raw);
  } catch {
    name = raw;
  }
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) return null;
  return name;
}
