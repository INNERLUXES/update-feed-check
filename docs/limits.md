# Limits

The tool reads the auto-update feeds of a release from disk: electron-updater feeds, Sparkle appcasts, Tauri updater
JSON and Squirrel.Windows RELEASES files, and the built files beside them when `--dist` names them. It is a check to run
before a release goes out, not a signature verification and not a certification. It fetches nothing, runs nothing,
connects to no system and asks nobody anything. A finding points at a line where a problem was found, and a run without
findings says only that the feeds hold none of the problems of docs/method.md. Every report ends with a sentence that
says so.

## What it cannot see

- **Whether a signature is right.** The tool has no public key of the app. It checks that an EdDSA signature of Sparkle
  has the length of one and that a Tauri signature is not a path; it cannot tell whether the signature was made by the
  key the app trusts, or over the file in the dist folder. Use the signing tool of each updater for that.
- **What is on the server.** Nothing is fetched. A relative address is taken as served from where the feed is, and an
  absolute address is only read for its scheme and host; whether the file is there, whether the server answers and
  which certificate it shows are not checked. `--dist` looks at the folder of built files, which is what is about to be
  uploaded, not at what is online.
- **The settings of the app.** The address of the feed, the public keys (`SUPublicEDKey`, the key of the Tauri
  configuration), `publisherName` of electron-updater, the channel an app follows and a setting that lets Tauri accept
  endpoints that are not HTTPS are in the app, not in the feed, so they are not read.
- **Older items in the dist folder.** Only the downloads of the newest version of each feed are looked for; older
  items of an appcast and older packages of RELEASES stay on the server.
- **Signed manifests and other fields.** The signature of an electron-updater manifest, `blockMapSize`,
  `isAdminRightsRequired`, `releaseName`, `sparkle:criticalUpdate`, `sparkle:os` and the like are passed over. Delta
  enclosures of Sparkle are checked for their address and signature, not looked for in the dist folder.
- **Namespaces.** Appcasts are read with the `sparkle:` prefix as they write it; an appcast that binds the Sparkle
  namespace to another prefix is not understood.
- **Time.** The tool reads no clock and no dates: releaseDate, pubDate and pub_date are never read for their values
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)), so it cannot tell a feed that is
  old.
- **Whether a finding matters to you.** A second host may be a mirror you run, a platform may be left out on purpose,
  and a pre-release may be meant for a channel that has no other feed. Set the level of a rule, or turn it off, in the
  configuration.

## The readers

- The YAML reader takes the part of YAML that electron-updater feeds use and refuses the rest with its place
  ([decision 2](decisions/0002-read-each-feed-with-a-small-reader-of-its-own.md)); a feed written by hand with anchors,
  tags or flow lists is an `unreadable-feed` finding, though another YAML reader might read it.
- The XML reader refuses a DOCTYPE, every entity other than the five of XML, and a file that is not well formed.
- The JSON reader is strict: no comments, no trailing comma, no name given twice.
- Feeds are read as UTF-8 only; a feed saved in another encoding is an `unreadable-feed` finding.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, a feed is an error finding, or the listing stops
with a `scan-limit` finding.

| What | Limit |
| --- | --- |
| a feed | 4 MB; a larger feed is an `unreadable-feed` finding |
| a file of the dist folder | 4 GB, read in blocks of one megabyte |
| the configuration | 1 MB |
| files and folders named | 100 |
| entries of a folder (feeds or dist) | 10,000 |
| feeds in all | 1,000 |
| values of a YAML or JSON feed | 100,000 |
| elements of an appcast | 100,000, nested up to 64 deep, with up to 256 attributes a tag |
| nesting of YAML and JSON | 32 deep |
| a version | 256 characters |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests check a YAML feed of sixty thousand lines, lines of hundreds of thousands of quotes, backslashes, colons and
hashes, appcasts with sixty thousand elements and runs of open tags and references, an entity expansion and an
external entity, nesting thousands deep, two thousand feeds in one folder and a dist file of 24 MB, each with a time
check.
