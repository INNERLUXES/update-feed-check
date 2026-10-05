// A small reader of the XML of a Sparkle appcast. It reads the text once, left to right, with a list of open elements
// of its own and no recursion, and builds a tree of elements with their attributes, their text and the place of each.
// It refuses a DOCTYPE declaration and any other <! declaration, as the OWASP page on XML external entities advises,
// so no entity can be declared, nothing outside the file is ever named, and no entity expansion can grow the text.
// Only the five predefined entities and numeric character references are decoded; any other entity is refused. Names
// keep their prefix as written (sparkle:version), and namespace declarations are read as plain attributes. A file that
// is not well formed (a tag not closed, a close tag that does not match, two root elements, an attribute named twice,
// text outside the root) is refused with its place, because an updater would refuse it too.

export const XML_LIMITS = { maxElements: 100000, maxDepth: 64, maxAttributes: 256 };

export class XmlError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13;
const isNameStart = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 58 || c >= 0x80;
const isNameChar = (c) => isNameStart(c) || (c >= 48 && c <= 57) || c === 45 || c === 46;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function fail(reason, offset) {
  throw new XmlError(reason, offset);
}

// Text or an attribute value with its references decoded; offset is the place of raw[0] in the file.
export function decodeReferences(raw, offset) {
  if (!raw.includes('&')) return raw;
  let out = '';
  let i = 0;
  for (;;) {
    const amp = raw.indexOf('&', i);
    if (amp < 0) return out + raw.slice(i);
    out += raw.slice(i, amp);
    const semi = raw.indexOf(';', amp);
    if (semi < 0 || semi - amp > 12) fail('an & that does not start a reference; write it as &amp;', offset + amp);
    const name = raw.slice(amp + 1, semi);
    if (name[0] === '#') {
      const hex = name[1] === 'x';
      const digits = name.slice(hex ? 2 : 1);
      const ok = digits.length > 0 && [...digits].every((d) => (hex ? '0123456789abcdefABCDEF' : '0123456789').includes(d));
      const code = ok ? parseInt(digits, hex ? 16 : 10) : -1;
      if (code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail(`the character reference &${name.slice(0, 10)}; names no character XML allows`, offset + amp);
      out += String.fromCodePoint(code);
    } else if (Object.hasOwn(ENTITIES, name)) out += ENTITIES[name];
    else fail(`the entity &${name.slice(0, 10)}; is not one of the five of XML; the tool reads no declared entity`, offset + amp);
    i = semi + 1;
  }
}

function readName(text, i) {
  let j = i;
  while (j < text.length && isNameChar(text.charCodeAt(j))) j += 1;
  return j;
}

// Reads an XML text. Returns the root element: { name, attrs: [{ name, value, offset }], children, text, textOffset,
// offset }, where offset is the place of the "<" (of the value, for an attribute) and text is the text and CDATA
// directly inside the element. Throws XmlError with the offset of the problem.
export function parseXml(text, limits = XML_LIMITS) {
  const lim = { ...XML_LIMITS, ...limits };
  const n = text.length;
  const stack = [];
  let root = null;
  let elements = 0;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const addText = (value, at) => {
    const top = stack.at(-1);
    if (!top) {
      if (value.trim() !== '') fail('text outside the root element', at);
      return;
    }
    if (top.textOffset < 0 && value.trim() !== '') top.textOffset = at + (value.length - value.trimStart().length);
    top.text += value;
  };
  while (i < n) {
    if (text.charCodeAt(i) !== 60) {
      const next = text.indexOf('<', i);
      const end = next < 0 ? n : next;
      addText(decodeReferences(text.slice(i, end), i), i);
      i = end;
      continue;
    }
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) fail('a comment that is not closed', i);
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      if (!stack.length) fail('a CDATA section outside the root element', i);
      const end = text.indexOf(']]>', i + 9);
      if (end < 0) fail('a CDATA section that is not closed', i);
      addText(text.slice(i + 9, end), i + 9);
      i = end + 3;
      continue;
    }
    if (text.startsWith('<!', i)) {
      const word = text.slice(i + 2, i + 9).toUpperCase();
      if (word.startsWith('DOCTYPE')) fail('a DOCTYPE declaration; the tool refuses DTDs, so no entity can be declared or fetched', i);
      fail('a declaration; the tool refuses <! declarations other than comments and CDATA', i);
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) fail('a processing instruction that is not closed', i);
      i = end + 2;
      continue;
    }
    if (text.charCodeAt(i + 1) === 47) {
      const nameEnd = readName(text, i + 2);
      const name = text.slice(i + 2, nameEnd);
      let j = nameEnd;
      while (j < n && isSpace(text.charCodeAt(j))) j += 1;
      if (text.charCodeAt(j) !== 62) fail(`a close tag </${name.slice(0, 40)}> that is not ended by >`, i);
      const top = stack.at(-1);
      if (!top) fail(`a close tag </${name.slice(0, 40)}> with no open element`, i);
      if (top.name !== name) fail(`the close tag </${name.slice(0, 40)}> does not match the open element <${top.name.slice(0, 40)}>`, i);
      stack.pop();
      i = j + 1;
      continue;
    }
    if (!isNameStart(text.charCodeAt(i + 1))) fail('a < that does not start a tag; write it as &lt;', i);
    const nameEnd = readName(text, i + 1);
    const element = { name: text.slice(i + 1, nameEnd), attrs: [], children: [], text: '', textOffset: -1, offset: i };
    elements += 1;
    if (elements > lim.maxElements) fail(`more than ${lim.maxElements} elements`, i);
    let j = nameEnd;
    let selfClosing = false;
    for (;;) {
      const sp = j;
      while (j < n && isSpace(text.charCodeAt(j))) j += 1;
      if (j >= n) fail(`the tag <${element.name.slice(0, 40)}> is not closed`, i);
      const d = text.charCodeAt(j);
      if (d === 62) {
        j += 1;
        break;
      }
      if (d === 47 && text.charCodeAt(j + 1) === 62) {
        j += 2;
        selfClosing = true;
        break;
      }
      if (j === sp || !isNameStart(d)) fail(`an attribute of <${element.name.slice(0, 40)}> that is not name="value"`, j);
      const attrEnd = readName(text, j);
      const attrName = text.slice(j, attrEnd);
      let k = attrEnd;
      while (k < n && isSpace(text.charCodeAt(k))) k += 1;
      if (text.charCodeAt(k) !== 61) fail(`the attribute ${attrName.slice(0, 40)} has no value`, j);
      k += 1;
      while (k < n && isSpace(text.charCodeAt(k))) k += 1;
      const quote = text.charCodeAt(k);
      if (quote !== 34 && quote !== 39) fail(`the value of ${attrName.slice(0, 40)} is not in quotes`, k);
      const close = text.indexOf(String.fromCharCode(quote), k + 1);
      if (close < 0) fail(`the value of ${attrName.slice(0, 40)} is not closed`, k);
      const raw = text.slice(k + 1, close);
      if (raw.includes('<')) fail(`a < inside the value of ${attrName.slice(0, 40)}`, k + 1 + raw.indexOf('<'));
      if (element.attrs.some((a) => a.name === attrName)) fail(`the attribute ${attrName.slice(0, 40)} appears twice in one tag`, j);
      if (element.attrs.length >= lim.maxAttributes) fail(`more than ${lim.maxAttributes} attributes in one tag`, j);
      element.attrs.push({ name: attrName, value: decodeReferences(raw, k + 1), offset: k + 1 });
      j = close + 1;
    }
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else if (root) fail('a second root element', i);
    else root = element;
    if (!selfClosing) {
      if (stack.length >= lim.maxDepth) fail(`elements nested more than ${lim.maxDepth} deep`, i);
      stack.push(element);
    }
    i = j;
  }
  if (stack.length) fail(`the element <${stack.at(-1).name.slice(0, 40)}> is not closed`, stack.at(-1).offset);
  if (!root) fail('the file holds no element', 0);
  return root;
}

// The value of an attribute by its name as written, or undefined.
export const attrOf = (element, name) => element.attrs.find((a) => a.name === name);

// The children of an element with a name as written.
export const childrenOf = (element, name) => element.children.filter((c) => c.name === name);

// The first child of an element with a name as written, or undefined.
export const childOf = (element, name) => element.children.find((c) => c.name === name);
