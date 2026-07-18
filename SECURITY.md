# Security policy

## Supported versions

Until QuotaDeck reaches 1.0, security fixes are provided for the newest release
only. Users should upgrade promptly.

## Reporting a vulnerability

Do not open a public issue for credential exposure, command injection, unsafe
profile isolation, or another exploitable weakness. Use the repository's GitHub
**Security → Report a vulnerability** flow. If private vulnerability reporting
has not yet been enabled, open a minimal issue asking a maintainer to enable a
private channel without including sensitive details.

Include the affected version and operating system, a minimal reproduction, the
expected impact, and any suggested mitigation. Maintainers will acknowledge a
complete report within seven days and coordinate disclosure after a fix exists.

QuotaDeck never needs provider tokens in a bug report. Redact user names, home
paths, session IDs, transcripts, and account identifiers.

Custom CLI selection is a local trust decision. Choose only an official Claude
Code or Codex executable from a location you control. QuotaDeck validates that
the selected file is callable and returns a recognized compatible version, but it
cannot prove the publisher of an arbitrary executable. Raw standard output,
standard error, and the saved absolute path stay in the main process; only a
normalized semantic version or non-sensitive repair message reaches the renderer.
Paths should still be redacted from reports.

QuotaDeck persists only masked account identity plus an HMAC verifier derived
with a random device-local key. The key, verifier, raw provider identity, and
credential material remain in the main process. If the key is lost or a provider
identity changes, managed-profile launch fails closed and asks for confirmation
again.

Quota alerts are desktop-local and opt-in. They evaluate only fresh,
provider-reported subscription windows, contain no account email or filesystem
path, and are deduplicated per provider reset window. The renderer can request
only one of the fixed alert thresholds. Provider help navigation is a main-process
allowlist of official HTTPS URLs; the renderer cannot supply an arbitrary URL.

Conduct reports use the same private GitHub reporting channel with a title that
starts with `[CONDUCT]`; they are handled under [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
not as product vulnerabilities.
