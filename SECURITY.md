# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "update-feed-check security", or use private vulnerability
reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up feed, built file or configuration that shows the problem, the command you ran, what you
expected and what happened. Use made-up companies, apps, hosts and people, never the feeds of a real app, and never a
real private key, signature, host name or address, even an old one.

## Scope

In scope:

- an input that makes the tool read a file outside the paths and the configuration it was given, follow a symbolic link
  or a junction, or read more than the top of a folder
- an input that makes the tool open a network connection, fetch an address it reads, expand or resolve an XML entity,
  or run or evaluate any part of a file
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as very large
  feeds or built files, folders with very many entries, YAML, JSON or XML nested deep, entities that expand, or long
  runs of quotes, colons or open tags
- binary or invalid input that the tool reads as if it were a feed
- a feed the tool fails to read and passes over without an error finding
- a run that passes at a `failOn` level although the input holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, starts or ends a
  GitHub workflow command, is shown unescaped in the output, or starts a formula in the CSV report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether a signature was made by the right key and
whether the server holds the files (a clean result is not a signature verification and not a certification), who may
change the configuration in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
