# Larkspan: a release in good order

A made-up company ships four desktop apps: Larkspan Board with electron-updater, Larkspan Meter with Sparkle, Larkspan
Tray with Tauri and Larkspan Ledger with Squirrel.Windows. `release/` holds their feeds, `dist/` the built files of the
new versions, and `previous/` the feeds that are online now. Every download has its checksum or signature and is
served over https from one host, every built file is in `dist/` with the size and checksum the feed gives, the appcast
lists the newest item first with a phased rollout and its pubDate, the Tauri feed covers the four platforms, every
version is higher than the one in `previous/`, and every update has release notes. The run passes with no finding.

```
node bin/update-feed-check.js examples/clean/release --dist examples/clean/dist --previous examples/clean/previous
```

The files in `dist/` are short text files that stand in for the built files; they are not programs.
