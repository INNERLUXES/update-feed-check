# 3. Check the files on disk, and download nothing

## Status

Accepted

## Context

A feed points at downloads, usually by an absolute address. A check could fetch each address to see that the file is
there, that its size and checksum match, and that the server answers over https. That would make the result depend on
the network, on the state of a server and on credentials; it would let a feed in a pull request make the pipeline
reach any address it names; and it would check what is online, which before a release is the old version.

What matters before a release is what is about to be uploaded: the feed and the files the build wrote next to it. A
mismatch between the two (a file signed after its checksum was written, a feed rebuilt from another build, a file
renamed) is the most common reason an update fails for every user at once.

## Decision

1. The tool fetches nothing. An address in a feed is read for its scheme, its host and the name of its file, with the
   URL class of Node, and never opened.
2. With `--dist`, the file of each download of the newest version is looked for at the top of the dist folder by the
   last part of its address, by its exact name, and its size and checksum are compared with the feed: SHA-512 in base64
   for electron-updater, SHA1 in hexadecimal for Squirrel.Windows, worked out with node:crypto in blocks so that a large
   installer needs no more memory than a small one.
3. With `--previous`, the feeds published before are read from disk too; the pipeline keeps them from the last release
   or takes them from the repository of the site.
4. Without `--dist` or `--previous`, those checks do not run, and the report says so on its own line.

## Consequences

- The result depends only on the files given, and a run needs no network access and no secret.
- Whether the server holds the file and answers over https is not checked (docs/limits.md); the address is checked for
  https and for its host, and the file for its presence in the dist folder.
- A dist folder that differs from what is uploaded gives a result about the wrong files; docs/secure-defaults.md asks
  to run the check on the folder that is uploaded, after signing.
