// The listing of a folder: a folder of feeds, or the dist folder. Only the top of a folder is listed, never the folders
// inside it, because electron-builder, Sparkle, Tauri and Squirrel.Windows put a release side by side in one folder;
// a folder inside is counted and passed over. A symbolic link (a junction on Windows too) is counted and never
// followed, so the listing cannot leave the folder. The listing stops at its limit and says so, so a run never passes
// because a part of the folder was not read.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileKind } from './kinds.js';
import { asciiLower, byCode } from './words.js';

export const WALK_LIMITS = { maxEntries: 10000 };

// The feeds of a folder: { feeds: [{ name, full, kind }], others, folders, links, limit }, in the order of the names.
// With kind, every file whose name is of that kind is read as it, and the files of other kinds are passed over.
export async function listFolder(full, { kind = null, limits = WALK_LIMITS } = {}) {
  const lim = { ...WALK_LIMITS, ...limits };
  const list = await readdir(full, { withFileTypes: true });
  list.sort((a, b) => byCode(a.name, b.name));
  const feeds = [];
  let others = 0;
  let folders = 0;
  let links = 0;
  let limit = null;
  for (const [i, entry] of list.entries()) {
    if (i >= lim.maxEntries) {
      limit = `more than ${lim.maxEntries.toLocaleString('en-US')} files and folders`;
      break;
    }
    if (entry.isSymbolicLink()) links += 1;
    else if (entry.isDirectory()) folders += 1;
    else if (!entry.isFile()) others += 1;
    else {
      const k = fileKind(entry.name);
      if (k === null || (kind !== null && k !== kind)) others += 1;
      else feeds.push({ name: entry.name, full: join(full, entry.name), kind: k });
    }
  }
  return { feeds, others, folders, links, limit };
}

// The files of the dist folder: { files: Map of name to full path, lower: Map of lowered name to name, links: Set,
// folders: Set, count, limit }.
export async function listDist(full, { limits = WALK_LIMITS } = {}) {
  const lim = { ...WALK_LIMITS, ...limits };
  const list = await readdir(full, { withFileTypes: true });
  list.sort((a, b) => byCode(a.name, b.name));
  const files = new Map();
  const lower = new Map();
  const links = new Set();
  const folders = new Set();
  let limit = null;
  for (const [i, entry] of list.entries()) {
    if (i >= lim.maxEntries) {
      limit = `more than ${lim.maxEntries.toLocaleString('en-US')} files and folders`;
      break;
    }
    if (entry.isSymbolicLink()) links.add(entry.name);
    else if (entry.isDirectory()) folders.add(entry.name);
    else if (entry.isFile()) {
      files.set(entry.name, join(full, entry.name));
      if (!lower.has(asciiLower(entry.name))) lower.set(asciiLower(entry.name), entry.name);
    }
  }
  return { files, lower, links, folders, count: files.size, limit };
}
