# Security Policy

## Supported versions

Only the latest release on `main` receives security fixes.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Use GitHub's private security advisory ("Report a vulnerability" under the repository's
Security tab) to report vulnerabilities confidentially.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce or a proof of concept
- Any relevant logs or screenshots

You can expect an initial response within 7 days. Please allow reasonable time for a fix
before any public disclosure.

## Scope notes

This project stores MeroShare credentials only in memory / encrypted session cookies and
proxies all traffic through its own server functions. Vulnerabilities that would expose
session tokens, credentials, or allow session hijacking are treated as critical.
