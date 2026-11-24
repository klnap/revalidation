# Security

## Authentication

The producer and the consumer share one secret. The dispatcher sends it as `Authorization: Bearer <secret>` on every request, and the consumer compares it in constant time (both values are hashed before comparison). Requests without the correct token get `401` and do nothing.

- Serve the consumer and send events over HTTPS. The HTTP dispatcher refuses plain `http://` URLs unless `NODE_ENV` is `development` or `test`.
- Keep the secret in server-side environment variables. Do not put it in client bundles.
- The consumer accepts one secret per process. To rotate, update both applications and deploy them together.
- Error messages from the dispatcher do not include the secret.

## Limits

The consumer rejects large requests before processing them:

| Limit | Default | Response |
| --- | --- | --- |
| Body size (`maxBodyBytes`) | 256 KiB | `400` |
| Items per event (`maxEvents`) | 100 | `400` |
| Event parameter length | 256 characters | `400` for the whole request |
| Path length | 1024 characters | `400` |

Streamed bodies are counted as read. Once the configured byte limit is crossed, the handler requests cancellation without awaiting the stream source; cancellation cannot delay or replace the `400` response. The hosting runtime owns transport cleanup.

Path parameters are checked: path separators, control characters and dot segments (`..`) are rejected with `400`.

## Not protected

- **No request signatures, timestamps or nonces.** A captured request can be replayed until the secret changes. Replayed events only expire tags again, but they are not rejected.
- **No rate limiting.** Protect the route at the platform or network level if needed.
- **One shared secret.** Anyone with the secret can expire any tag or path that a rule maps. Rules are the only restriction: an event whose key matches no rule does nothing.
- **Event content is trusted to be well formed, not to be true.** The consumer uses it for cache keys and parameters only.
- **Parameters in tag names are not escaped.** Do not use untrusted text as a tag parameter without validation.

Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
