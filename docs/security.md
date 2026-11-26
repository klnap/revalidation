# Security

## Authentication and transport

The HTTP dispatcher signs the exact request body with Standard Webhooks. The Next.js consumer
verifies the signature and timestamp before parsing CloudEvents or calling cache APIs.

- Use HTTPS between producer and consumer.
- Store secrets in server-side environment variables. Never put them in client bundles.
- Use Standard Webhooks secrets in `whsec_` base64 form.
- Keep target URLs trusted. HTTPS validation does not restrict destinations to an application
  allowlist.
- Plain HTTP is accepted only for loopback or when `allowInsecure: true` is explicitly set.
- A captured signed request can be replayed during the Standard Webhooks timestamp tolerance window.
  Cache invalidation is repeatable, but the consumer does not persist delivery IDs for deduplication.

## Input validation and limits

The handler checks the media type, reads a bounded request body, verifies its signature, validates
the CloudEvents envelope, then validates every event's `data` with its registered Standard Schema
V1 validator. It runs no cache operations unless the full request passes validation.

The body limit defaults to 256 KiB; the event limit defaults to 100. Both limits have hard ceilings.
The handler bounds generated tags to 256 characters and generated paths to 1024 characters, and
requires paths to start with `/`. See [consumer configuration](consumers/next.md#validation-and-limits).

## Logging and secrets

Do not log webhook secrets, signatures, raw request bodies, or event data that may contain
confidential content. The built-in handler logs request identifiers, operation outcomes, and error
names rather than raw errors.

## Scope

The package does not provide rate limiting, a persistent delivery queue, destination allowlisting,
or durable replay protection. Apply platform controls when your deployment requires them.
