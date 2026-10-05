import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XmlError, attrOf, childOf, childrenOf, decodeReferences, parseXml } from '../src/index.js';

// The XML reader of appcasts: a tree with places, a refused DOCTYPE and entity, and well-formedness kept.

const refused = (text, reason) => assert.throws(() => parseXml(text), (e) => e instanceof XmlError && reason.test(e.reason), text);

test('xml: an appcast is read into elements with their attributes, text and places', () => {
  const text = '<?xml version="1.0"?>\n<rss version="2.0" xmlns:sparkle="x">\n<channel><item>\n<sparkle:version>12</sparkle:version>\n<enclosure url="https://a.test/a.zip" length="5"/>\n</item></channel></rss>\n';
  const root = parseXml(text);
  assert.equal(root.name, 'rss');
  const item = childOf(childOf(root, 'channel'), 'item');
  const v = childOf(item, 'sparkle:version');
  assert.equal(v.text, '12');
  assert.equal(v.textOffset, text.indexOf('12<'));
  const url = attrOf(childOf(item, 'enclosure'), 'url');
  assert.equal(url.value, 'https://a.test/a.zip');
  assert.equal(url.offset, text.indexOf('https'));
  assert.equal(childrenOf(item, 'enclosure').length, 1);
});

test('xml: comments, processing instructions, CDATA, the five entities and character references', () => {
  const root = parseXml('<a><!-- a <b> comment --><?pi x?><d><![CDATA[<p>x & y</p>]]></d><e t="&lt;&amp;&#65;&#x42;&quot;&apos;&gt;">&amp;</e></a>');
  assert.equal(childOf(root, 'd').text, '<p>x & y</p>');
  assert.equal(attrOf(childOf(root, 'e'), 't').value, '<&AB"\'>');
  assert.equal(childOf(root, 'e').text, '&');
  assert.equal(decodeReferences('no reference', 0), 'no reference');
});

test('xml: a DOCTYPE, an entity of its own and other declarations are refused, so nothing can be expanded or fetched', () => {
  refused('<!DOCTYPE rss [<!ENTITY a "aaaa">]><rss>&a;</rss>', /DOCTYPE/);
  refused('<!doctype rss SYSTEM "file:///etc/passwd"><rss/>', /DOCTYPE/);
  refused('<rss><!ENTITY a "b"></rss>', /declaration/);
  refused('<rss>&xxe;</rss>', /entity &xxe;/);
  refused('<rss a="&ent;"/>', /entity &ent;/);
  refused('<rss>&#0;</rss>', /character reference/);
  refused('<rss>&#xD800;</rss>', /character reference/);
  refused('<rss>a & b</rss>', /does not start a reference/);
});

test('xml: a file that is not well formed is refused with its place', () => {
  const bad = '<rss><channel></rss>';
  assert.throws(() => parseXml(bad), (e) => /does not match/.test(e.reason) && e.offset === bad.indexOf('</rss>'));
  refused('<rss>', /not closed/);
  refused('<rss/><rss/>', /second root/);
  refused('text<rss/>', /outside the root/);
  refused('<rss a="1" a="2"/>', /appears twice/);
  refused('<rss a=1/>', /not in quotes/);
  refused('<rss a/>', /has no value/);
  refused('<rss a="x<y"/>', /< inside the value/);
  refused('<rss>< b</rss>', /does not start a tag/);
  refused('</rss>', /no open element/);
  refused('<rss><!-- open', /comment that is not closed/);
  refused('<rss><![CDATA[x', /CDATA section that is not closed/);
  refused('', /no element/);
  refused('<rss', /not closed/);
});

test('xml: the limits of depth, elements and attributes hold', () => {
  refused(`${'<a>'.repeat(70)}${'</a>'.repeat(70)}`, /nested more than 64 deep/);
  assert.throws(() => parseXml(`<r>${'<a/>'.repeat(10)}</r>`, { maxElements: 5 }), /more than 5 elements/);
  assert.throws(() => parseXml(`<r ${Array.from({ length: 10 }, (_, i) => `a${i}="1"`).join(' ')}/>`, { maxAttributes: 5 }), /more than 5 attributes/);
});

test('xml: names such as __proto__ stay names of elements and attributes', () => {
  const root = parseXml('<r __proto__="1"><constructor>x</constructor></r>');
  assert.equal(attrOf(root, '__proto__').value, '1');
  assert.equal(childOf(root, 'constructor').text, 'x');
  assert.equal({}.polluted, undefined);
});
