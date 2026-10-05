# 2. Read each feed with a small reader of its own

## Status

Accepted

## Context

The four kinds of feed are written in three formats: YAML for electron-updater, XML for Sparkle, JSON for Tauri, and
lines of text for Squirrel.Windows. Full readers of YAML and XML are large: YAML has anchors, aliases, tags, flow
collections and several documents in one file, and XML has DTDs that declare entities, which can name files or
addresses and can expand into each other until memory runs out. A dependency for each would bring code the project does
not review, versions to track, and behaviour that differs from the reader each updater uses.

The feeds the build tools write use a small part of each format: electron-builder writes mappings, lists and plain or
quoted values; an appcast is RSS with a few elements and attributes; a Tauri feed is plain JSON.

## Decision

1. Each format has a small reader in src/ with no dependency: src/yaml.js, src/xml.js, src/json.js, and the line reader
   of src/squirrel.js. Each reads the text once, left to right, with a list of its own and no recursion, with limits of
   size, depth and values.
2. A reader refuses what it does not read, with its place: YAML anchors, aliases, tags, flow collections and a second
   document; XML with a DOCTYPE, an entity of its own or a tag that is not closed; JSON with comments, a trailing comma
   or a name given twice. A refused feed is an `unreadable-feed` finding, an error that cannot be set off.
3. The XML reader never declares, expands or fetches an entity, as the OWASP page on XML external entities advises.
4. The readers keep the offset of every value, so each finding points at the line and column of the file.

## Consequences

- The tool needs no package and no network, and the same files give the same report on Linux, Windows and macOS.
- A feed written by hand with a YAML feature outside the subset is reported, though the app might read it; the finding
  says which feature, and docs/limits.md says so.
- A new field of a feed is a change to its reader, with a test of the form that is read and the form next to it that is
  refused.
