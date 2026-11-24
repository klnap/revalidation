# Security policy

## Supported versions

Only the latest published version receives fixes.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/klnap/revalidation/security/advisories/new). Do not open a public issue. Expect an acknowledgement within a few days.

## Scope

The package runs inside your Payload server and Next.js route handler. Relevant reports include authorization bypass in the consumer route, secret handling in the HTTP dispatcher, request-size or event-count limits that can be bypassed, and release or supply-chain weaknesses. Releases are published from GitHub Actions with npm provenance.
