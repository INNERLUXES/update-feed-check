# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

Update feeds are full of dates: releaseDate in electron-updater feeds, pubDate in appcasts, pub_date in Tauri feeds.
It is tempting to check them against the calendar: a feed that is old, a date in the future, a phased rollout that
should be over. Each of these would make the same files give a different result on a different day, so a pipeline that
passed yesterday could fail today with no change to the repository, and two people reading the same commit could see
two reports. The output could never be saved and compared.

The checks do not need a date. Whether a download has its checksum, whether the file in the dist folder matches,
whether the version went up: all of it can be read from the files as they are. Sparkle needs a pubDate for a phased
rollout, and the tool checks that it is there, not what it says.

## Decision

1. The tool reads no clock, no time zone and no locale. It never reads the value of a date field and never prints the
   current time. The same files and configuration give the same output on every machine and on every day.
2. No file of this repository holds a date or a number that reads like a year: not the licence, not the changelog, not
   the documents, not the comments of the code, not the tests. `npm run check` and a test fail on any number that
   reads like a year. Version numbers such as Node 22, RFC 4180 or 1.0.0 are not years and are fine, and web addresses
   that hold a year are left out of the sources.
3. The example feeds are the one exception, and a narrow one. A real feed carries a releaseDate, a pubDate or a
   pub_date, and the examples show real feeds, so the feed files under `examples/messy/` and `examples/clean/` (in
   their `release` and `previous` folders) keep one date each in those three fields. The checks blank the value of
   exactly these three fields, in exactly these files, with `withoutFeedDates()` of tools/example.mjs, and then look for
   a number that reads like a year in the rest of the file. Every other line of these files, and every other file of
   the repository, is checked in full. The tool's output never holds those dates.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it does
  not move with the calendar.
- A feed that is old or that names a date in the future is not reported; docs/limits.md says so.
- The values of the examples are chosen so that no size, version, checksum or count reads like a year.
