// Reading a file: a feed, the configuration, or a file of the dist folder. Each file is opened once with O_NOFOLLOW where
// the system has it, and its type and size are taken from the open handle, so a file swapped for a link, a pipe or a
// device after it was found is refused, and a file over its limit is refused before it is read. A feed and the
// configuration are read whole as UTF-8, with or without a byte order mark; a file that holds a null byte or bytes that
// are not valid UTF-8 is not read. A file of the dist folder is never read whole: it is read in blocks of one
// megabyte into a hash of node:crypto, so a large installer needs no more memory than a small one. The tool writes
// nothing to disk. The listing of a folder is in src/walk.js.

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const FILE_LIMITS = { maxConfigBytes: 1024 * 1024, maxFeedBytes: 4 * 1024 * 1024, maxDistBytes: 4 * 1024 * 1024 * 1024 };

const BLOCK = 1024 * 1024;

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function megabytes(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} byte`;
}

// The flags a file is opened with: read only, and not through a symbolic link where the system can refuse one.
export const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

// Opens a regular file and runs fn(handle, size); an error when it is missing, a link, not a regular file or over the
// limit.
async function withFile(path, maxBytes, fn) {
  let handle;
  try {
    handle = await open(resolve(path), OPEN_FLAGS);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(path, 'no such file');
    if (error.code === 'ELOOP' || error.code === 'EMLINK') throw fileError(path, 'is a symbolic link, which is not followed');
    if (error.code === 'EISDIR') throw fileError(path, 'is a folder');
    throw fileError(path, `cannot be read (${error.code ?? error.message})`);
  }
  try {
    const opened = await handle.stat();
    if (opened.isDirectory()) throw fileError(path, 'is a folder');
    if (!opened.isFile()) throw fileError(path, 'not a regular file');
    if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
    return await fn(handle, opened.size);
  } finally {
    await handle.close();
  }
}

// The whole file, or an error when it is not a regular file or is over the limit.
export async function readBounded(path, maxBytes) {
  return withFile(path, maxBytes, async (handle, size) => {
    const buffer = Buffer.alloc(size);
    let read = 0;
    while (read < size) {
      const { bytesRead } = await handle.read(buffer, read, size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  });
}

// The size of a file and, when algo is given, its digest: { size, digest } with the digest in base64 for sha512 and in
// lowercase hexadecimal for sha1, read in blocks.
export async function digestFile(path, algo, maxBytes) {
  return withFile(path, maxBytes, async (handle, size) => {
    if (!algo) return { size, digest: null };
    const hash = createHash(algo);
    const buffer = Buffer.alloc(Math.min(BLOCK, Math.max(size, 1)));
    let read = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, read);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      read += bytesRead;
    }
    return { size: read, digest: hash.digest(algo === 'sha512' ? 'base64' : 'hex') };
  });
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown absolute,
// also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// The text of a buffer read as UTF-8, without a byte order mark, or an error whose .reason says why it is not text.
export function textOf(buffer, shown) {
  if (buffer.includes(0)) throw fileError(shown, 'holds binary data (a null byte)');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw fileError(shown, 'is not valid UTF-8; save the file again as UTF-8');
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// The text of a file, or an error whose .reason says why it is not read. shown is the path the error names.
export async function readText(full, shown, maxBytes) {
  const buffer = await readBounded(full, maxBytes).catch((error) => {
    throw fileError(shown, error.reason ?? error.message);
  });
  return { size: buffer.length, text: textOf(buffer, shown) };
}

// What a path named on the command line is: { full, shown, folder }, or an error when it is missing, a symbolic link or
// neither a file nor a folder. The path is looked at without following a link.
export async function inspectPath(path, base) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  let info;
  try {
    info = await lstat(full);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(shown, 'no such file or folder');
    throw fileError(shown, `cannot be read (${error.code ?? error.message})`);
  }
  if (info.isSymbolicLink()) throw fileError(shown, 'is a symbolic link, which is not followed; name the folder or file itself');
  if (!info.isFile() && !info.isDirectory()) throw fileError(shown, 'is not a regular file or folder');
  return { full, shown, folder: info.isDirectory() };
}

// The configuration named on the command line, read as text: { file, full, size, text }.
export async function readTextFile(path, base, maxBytes) {
  const { full, shown, folder } = await inspectPath(path, base);
  if (folder) throw fileError(shown, 'is a folder; give the file itself');
  const read = await readText(full, shown, maxBytes);
  return { file: shown, full, ...read };
}
