---
'@klnap/revalidation': minor
---

Replace `invalidate` with declarative `rules` and context-based callbacks. Bind each `POST` handler to
its configuration, remove process-wide target registries and obsolete exports, improve tag and path
inference, and refresh the Next.js and Payload examples. This intentionally breaks the pre-1.0
consumer and HTTP dispatcher APIs.
