# Quillmere: a release folder before the upload

A made-up software company ships three desktop apps and puts each release of them in one folder before the upload:
`release/` holds the feeds, `dist/` the built files, and `previous/` the feeds that are online now. The release has
gone wrong in the ways that strand users.

`release/` holds:

- `latest.yml`, `latest-mac.yml` and `latest-linux.yml`, the electron-updater feeds of Quillmere Notes. The Windows
  installer was signed again after the feed was written, so its sha512 no longer matches the file in `dist/`, and its
  stagingPercentage is 120. The size of the macOS zip in the feed is not the size of the file. The Linux feed was left
  behind at 3.1.4, the version that is already online, and its AppImage has no sha512 and no release notes.
- `appcast.xml`, the Sparkle appcast of Quillmere Clip, a Mac app. Its first item is 4.1.2, not the newest 4.2.0, and
  is served over http; 4.2.0 sits on another host and has a phased rollout with no pubDate; 4.0.0 has only an old DSA
  signature and no release notes.
- `quillmere-sync.json`, the Tauri feed of Quillmere Sync. The Windows platform has an empty signature, there is no
  platform for Apple silicon, the Linux AppImage is not in `dist/`, and its version 1.4.0 is lower than the 1.5.0 that
  `previous/` holds, because an old file was copied in.

It also holds what must not be reported: files whose size and checksum match, signed enclosures, the namespace of the
appcast, which is not an address, and the dates of the feeds, which are never read. `../config.json` asks for every
Tauri platform and raises missing release notes to warnings.

```
node bin/update-feed-check.js examples/messy/release --dist examples/messy/dist --previous examples/messy/previous --config examples/config.json
```

The files in `dist/` are short text files that stand in for the built files; they are not programs.
