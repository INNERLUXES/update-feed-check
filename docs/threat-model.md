# Threat model

## What the tool touches

- It reads the feed files and the folders named on the command line (their top only), the dist folder named with
  `--dist`, the previous feeds named with `--previous`, and the configuration named with `--config`. Nothing else is
  opened.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no address it reads, follows no symbolic link, expands no entity, evaluates
  nothing it reads, starts no program and reads no clock.

## What the input may hold

The feeds and the built files come from a build, and in a pipeline that checks every pull request they may be written
by whoever opened the pull request. Through them, a person can try to:

- make the tool read outside the folders or fetch something: a symbolic link or a junction in a folder, a link named on
  the command line, a file swapped for a link between the listing and the read, an external entity or a DTD in an
  appcast, an address in a feed, a path written as a web address;
- exhaust the memory, the stack or the time: feeds of megabytes, folders with thousands of entries, entities that
  expand into each other, YAML, JSON and XML nested very deep, lines of hundreds of thousands of quotes, colons, hashes
  or open tags, very large files in the dist folder;
- move the result: a rule set to off, a required platform taken out of the configuration, `failOn` raised, a feed that
  only looks well formed, a version written so that two readers compare it differently;
- slip in something that is not text: a binary file named latest.yml, bytes that are not valid UTF-8;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators in
  a file name, a version or an address;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the GitHub
  format writes into a command;
- hide a formula in the CSV report: a file name, a version or an address that starts with `=`, `+`, `-` or `@`, which a
  spreadsheet may run when the report is opened;
- change how objects behave: a platform, a key or an attribute named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read outside the folder or walk a loop | Only the top of a folder is listed, every link met is counted and none is followed, and a link named on the command line is refused; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle. Tests put links to a file, to a folder and to the folder itself |
| An appcast expands entities or fetches a file or an address | The XML reader refuses every DOCTYPE and every `<!` declaration, and decodes only the five entities of XML and numeric references; nothing is ever expanded. Tests use an entity expansion and an external entity |
| The tool fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, an address in a feed is only read with the URL class, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Feeds have a size limit checked on the open handle before they are read; dist files are hashed in blocks; folders have a limit of entries and the input a limit of feeds; the readers of YAML, XML and JSON keep lists of their own with no recursion and have limits of depth and values; every pattern works on short values or grows with the line; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input or the configuration; a test looks for `new RegExp` in src |
| The result is moved through the input or the configuration | A feed that cannot be read and input past the limits are error findings that cannot be set off; a rule set to off is named in a note; the readers refuse what they do not read rather than guess. Review a change to the configuration like a change to code (docs/secure-defaults.md) |
| A binary file or bytes in another encoding are read as text | A null byte or bytes that are not valid UTF-8 make the feed an error finding |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts escapes, direction controls and line separators in a version, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%0A::error file=` and a line break with `::warning::` into a version |
| A formula runs when the CSV report is opened | A field that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote in front. The OWASP page on CSV injection says no one escape is safe in every program, so treat a report built from files you do not trust as untrusted data, and open it with formulas off |
| `__proto__` changes how objects behave | YAML keys are kept in lists, the JSON reader defines own properties, names are looked up with `Object.hasOwn` or in lists, maps and sets. A test uses `__proto__`, `constructor` and `toString` as platforms and keys |
| A device or a pipe hangs the tool | A path that is not a regular file or folder is refused before it is read, the listing passes over every entry that is not a file or a folder, and a dist file is opened and checked for its type before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folders as they were |

## Out of scope

Whether a signature was made by the right key, what is online, the settings inside the app (docs/limits.md), who may
change the configuration in your repository, and where your pipeline keeps the output.

A clean result is not a signature verification and not a certification.
