// What the readers of the four kinds of feed share: the error of a file that cannot be read as its kind, the check of
// base64 values, and the checks of the web addresses of one feed. Each reader returns { feed, findings }, where feed
// describes the feed for the checks across files (src/release.js) and findings are [{ rule, offset, found }] with the
// offset of the place in the text.

import { urlInfo } from './urls.js';
import { safeText } from './text.js';

export class FeedError extends Error {
  constructor(reason, offset = 0) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// The number of bytes a value of standard base64 with its padding stands for, or -1 when it is not such a value.
export function base64Bytes(value) {
  const s = String(value).trim();
  if (s.length === 0 || s.length % 4 !== 0 || s.length > 1000000) return -1;
  let pad = 0;
  if (s.endsWith('==')) pad = 2;
  else if (s.endsWith('=')) pad = 1;
  for (let i = 0; i < s.length - pad; i += 1) if (!BASE64.includes(s[i])) return -1;
  const bytes = (s.length / 4) * 3 - pad;
  return Buffer.from(Buffer.from(s, 'base64')).toString('base64') === s ? bytes : -1;
}

// A value as a finding shows it: cleaned and short.
export const shown = (value, max = 120) => safeText(String(value), max);

// The checks of the addresses of one feed: every absolute address must use https (insecure-url), and the downloads of
// one feed should all sit on one host (mixed-hosts); a relative address is served from where the feed is and has no
// host. urls are [{ value, offset, download }].
export function urlFindings(urls) {
  const findings = [];
  let first = null;
  for (const u of urls) {
    const info = urlInfo(u.value);
    if (info.absolute && !info.https) findings.push({ rule: 'insecure-url', offset: u.offset, found: `the ${u.download ? 'download' : 'address'} "${shown(u.value, 200)}" uses ${shown(info.scheme, 20)}, not https, so it can be read or changed on the way` });
    if (!u.download || !info.host) continue;
    if (first === null) first = info.host;
    else if (info.host !== first) findings.push({ rule: 'mixed-hosts', offset: u.offset, found: `the download is on ${shown(info.host, 100)}, while the first download of the feed is on ${shown(first, 100)}` });
  }
  return findings;
}
