// A Sparkle appcast, read with the XML reader of src/xml.js: <rss><channel> with one <item> per update. The fields
// read are sparkle:version (an element of the item or an attribute of its enclosure), sparkle:shortVersionString,
// sparkle:minimumSystemVersion, the enclosure with url, length, sparkle:edSignature and sparkle:dsaSignature, the
// enclosures of sparkle:deltas, sparkle:releaseNotesLink, sparkle:fullReleaseNotesLink, description,
// sparkle:phasedRolloutInterval, sparkle:channel and sparkle:informationalUpdate. pubDate is only looked for, never
// read, so no date ever changes a result. Names are matched with the sparkle: prefix as appcasts write them.

import { FeedError, base64Bytes, shown, urlFindings } from './feed.js';
import { compareVersions, parseDotted } from './versions.js';
import { attrOf, childOf, childrenOf, parseXml } from './xml.js';

const textOf = (el) => (el ? el.text.trim() : '');
const placeOf = (el) => (el.textOffset >= 0 ? el.textOffset : el.offset);

// Reads the text of a Sparkle appcast named name. lineOf gives the line of an offset, for a finding that names another
// place of the file.
export function readSparkle(text, name, lineOf) {
  const root = parseXml(text);
  if (root.name !== 'rss') throw new FeedError(`the root element is <${shown(root.name, 40)}>, not the <rss> of an appcast`, root.offset);
  const channel = childOf(root, 'channel');
  if (!channel) throw new FeedError('the appcast has no <channel>', root.offset);
  const findings = [];
  const add = (rule, offset, found) => findings.push({ rule, offset, found });
  const items = childrenOf(channel, 'item');
  if (!items.length) add('missing-url', channel.offset, 'the appcast has no <item>, so it offers no update');
  const urls = [];
  const versions = [];
  const seen = new Map();

  const checkEnclosure = (enclosure, label) => {
    const url = attrOf(enclosure, 'url');
    if (!url || url.value.trim() === '') add('missing-url', enclosure.offset, `the enclosure of ${label} has no url`);
    else urls.push({ value: url.value.trim(), offset: url.offset, download: true });
    const ed = attrOf(enclosure, 'sparkle:edSignature');
    if (!ed || ed.value.trim() === '') {
      const dsa = attrOf(enclosure, 'sparkle:dsaSignature');
      add('missing-signature', enclosure.offset, `the enclosure of ${label} has no sparkle:edSignature${dsa ? ', only the deprecated sparkle:dsaSignature' : ''}`);
    } else if (base64Bytes(ed.value) !== 64) add('missing-signature', ed.offset, `the sparkle:edSignature of ${label} is not the base64 of 64 bytes, the length of an EdDSA (ed25519) signature`);
    return url ? url.value.trim() : null;
  };

  for (const item of items) {
    const enclosure = childOf(item, 'enclosure');
    const vEl = childOf(item, 'sparkle:version');
    const vAttr = enclosure ? attrOf(enclosure, 'sparkle:version') : undefined;
    const raw = vEl ? textOf(vEl) : vAttr ? vAttr.value.trim() : '';
    const vOffset = vEl ? placeOf(vEl) : vAttr ? vAttr.offset : item.offset;
    const shortEl = childOf(item, 'sparkle:shortVersionString');
    const shortAttr = enclosure ? attrOf(enclosure, 'sparkle:shortVersionString') : undefined;
    const short = shortEl ? textOf(shortEl) : shortAttr ? shortAttr.value.trim() : '';
    let label = 'an item with no version';
    if (raw === '') add('invalid-version', item.offset, 'the item has no sparkle:version, the version Sparkle compares');
    else {
      label = `version ${shown(raw, 40)}`;
      const parsed = parseDotted(raw);
      if (parsed.reason) add('invalid-version', vOffset, `sparkle:version "${shown(raw, 60)}" is not valid: ${parsed.reason}`);
      else {
        const channelName = textOf(childOf(item, 'sparkle:channel'));
        const key = `${parsed.parts.map((p) => p.replace(/^0+(?=\d)/, '')).join('.')}|${channelName}`;
        if (seen.has(key)) add('duplicate-version', vOffset, `sparkle:version ${shown(raw, 40)} appears again${channelName ? ` in the channel ${shown(channelName, 40)}` : ''}; the first item with it is at line ${lineOf(seen.get(key))}`);
        else seen.set(key, vOffset);
        versions.push({ text: raw, parsed, offset: vOffset, short, item, enclosure });
      }
    }
    const minimum = childOf(item, 'sparkle:minimumSystemVersion');
    if (minimum && parseDotted(textOf(minimum)).reason) add('invalid-version', placeOf(minimum), `sparkle:minimumSystemVersion "${shown(textOf(minimum), 60)}" is not a macOS version such as 11.0`);
    if (enclosure) checkEnclosure(enclosure, label);
    else if (!childOf(item, 'sparkle:informationalUpdate')) add('missing-url', item.offset, `the item of ${label} has no enclosure to download`);
    const deltas = childOf(item, 'sparkle:deltas');
    if (deltas) for (const d of childrenOf(deltas, 'enclosure')) checkEnclosure(d, `a delta of ${label}`);
    const links = ['sparkle:releaseNotesLink', 'sparkle:fullReleaseNotesLink'].map((n) => childOf(item, n)).filter((el) => el && textOf(el) !== '');
    for (const el of links) urls.push({ value: textOf(el), offset: placeOf(el), download: false });
    if (!links.length && textOf(childOf(item, 'description')) === '') add('missing-release-notes', item.offset, `the item of ${label} has no release notes: no sparkle:releaseNotesLink and no description`);
    const phased = childOf(item, 'sparkle:phasedRolloutInterval');
    if (phased) {
      const p = textOf(phased);
      if (!/^\d{1,12}$/.test(p) || Number(p) === 0) add('invalid-rollout', placeOf(phased), `sparkle:phasedRolloutInterval is "${shown(p, 40)}", not a whole number of seconds above 0`);
      else if (!childOf(item, 'pubDate')) add('invalid-rollout', placeOf(phased), `the item of ${label} has sparkle:phasedRolloutInterval but no pubDate, which Sparkle needs to place the groups of a phased rollout`);
    }
  }
  findings.push(...urlFindings(urls));

  let newest = null;
  for (const v of versions) if (!newest || compareVersions(v.parsed, newest.parsed) > 0) newest = v;
  if (versions.length > 1 && compareVersions(versions[0].parsed, newest.parsed) < 0) {
    add('item-order', versions[0].offset, `the first item has sparkle:version ${shown(versions[0].text, 40)}, but the item at line ${lineOf(newest.offset)} has ${shown(newest.text, 40)}, which is higher; put the newest item first`);
  }
  const downloads = [];
  if (newest) {
    for (const v of versions.filter((x) => compareVersions(x.parsed, newest.parsed) === 0 && x.enclosure)) {
      const url = attrOf(v.enclosure, 'url');
      if (!url || url.value.trim() === '') continue;
      const length = attrOf(v.enclosure, 'length');
      const size = length && /^\d{1,15}$/.test(length.value.trim()) ? { value: Number(length.value.trim()), offset: length.offset } : null;
      downloads.push({ url: url.value.trim(), offset: url.offset, size, hash: null });
    }
  }
  return {
    feed: { kind: 'sparkle', name, version: newest ? { text: newest.text, parsed: newest.parsed, offset: newest.offset } : null, shownVersion: newest ? (newest.short ? `${newest.short} (${newest.text})` : newest.text) : null, entries: items.length, downloads, compare: 'dotted' },
    findings
  };
}
