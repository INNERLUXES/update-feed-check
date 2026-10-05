# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux,
Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure
development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`,
with `!` for a breaking change.

This tool reads update feeds and built files on disk; a clean result is not a signature verification and not a
certification. A change must keep it that way: a rule reports what a file holds, and the tool never fetches, runs or
evaluates what it reads.

## Changing a rule

1. Describe the change in docs/method.md first: what the rule looks at and what it can and cannot see, and add what it
   cannot see to docs/limits.md. Where the tool makes its own choice, say so in `own` in src/rules.js and say why.
2. Keep the rules to what is written. A finding must point at something a reader can check in a file: a line and a
   column. Never add a rule that needs the network, a key the app keeps, or the clock.
3. A rule says what to change, in `fix` in src/rules.js, and names the points of the public pages it rests on in
   `basis`; a new page goes into src/data.js and research/sources.md.
4. A run must never pass because something could not be read: a feed that cannot be read and input past the limits are
   error findings, and those two rules keep no key in the configuration.
5. Add a test with the feed written inline (`feedOf()`, `rulesOf()`, `goodWith()`, `reportOf()` and `run()` in
   test/helpers.js), small enough to work out by hand, with a near miss on each side: the form that is reported and the
   form next to it that is not.
6. A rule id, once released, keeps its meaning: pipelines and other tools read it from the JSON output, the CSV report
   and the GitHub annotations.

## Changing a reader

1. The readers of YAML (src/yaml.js), XML (src/xml.js), JSON (src/json.js) and RELEASES (src/squirrel.js) and the
   listing of a folder (src/walk.js) keep lists of their own, never recursion, and read each character a fixed number
   of times. A test in test/repo.test.js fails when a function of these files calls itself.
2. A reader refuses what it does not read, with its place, rather than guess. The XML reader refuses every DOCTYPE and
   every entity other than the five of XML; a change that loosens this is refused.
3. No pattern is built from a file or the configuration, and no key of the configuration takes a regular expression. A
   test fails when `new RegExp` appears in src outside src/text.js.
4. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only
   when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold
   the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
5. A feed written with LF, CRLF or CR line ends, with or without a byte order mark, must give the same output. The
   example files are stored as written (`.gitattributes`), and a test reads them with CRLF line ends.

## Changing the configuration file

1. A new key is added to `KEYS` in src/config.js, documented in docs/inputs.md and tested with a good value and a bad
   one. Every key the tool does not know stays an error, and a key named twice stays refused.
2. A change to `DEFAULT_REQUIRED_PLATFORMS` in src/defaults.js names the page that shows the platform, and updates the
   README and docs/inputs.md.

## Changing a source

1. Every point the reports show is in src/data.js, written in this project's own words, with the page it comes from. A
   short phrase of a page may be named; a long quotation may not.
2. research/sources.md lists every page with a note on what it says, and docs/rules-and-sources.md lists every rule
   with its points and what to change. A test checks all three against each other. Fetch and read a page before it is
   listed, and leave out a web address that holds a number that reads like a year.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device, file permissions) is guarded with
`process.platform`, says why in its `t.skip`, and asserts no line of its own: a line is asserted only in a test that
runs on every system, and is worked out there with `lineOf()` of test/helpers.js or from the text itself, never written
by hand. `test/repo.test.js` fails when a guarded test asserts a line. Every other test builds its paths with
`resolve()` from names with forward slashes.

A test never reads the clock, the time zone of the machine or the locale.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network
  connection, runs no program and evaluates nothing it reads.
- Text from the input, file names included, goes through `safeText` before it reaches the output or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No prose file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, RFC 4180,
  1.0.0) are fine. The one exception is the value of releaseDate, pubDate and pub_date in the example feeds, which the
  checks blank before they look (decision 1 in docs/decisions).
- Examples and tests use made-up companies, apps, hosts and people, hosts on the reserved `.test` domain, and checksums
  and signatures that were never real.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
