# Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 {"error":"Unauthorized"}` | The bearer token does not match the consumer's secret. | Set the same `REVALIDATION_SECRET` in both applications and redeploy. |
| `405 {"error":"Method not allowed"}` | A GET request, for example from a browser. | Expected. The route accepts POST only. |
| `400 Invalid JSON` | The body is not valid JSON. | Send `Content-Type: application/json` with a JSON body. |
| `400 Missing source` | The envelope has no `source`. | Send `{"source": "...", "data": [...]}`. |
| `400 Request body too large` | The body exceeds `maxBodyBytes` (256 KiB). | Send fewer items per request. The producer splits its own events. |
| `400 Too many events (max 100)` | More than `maxEvents` items. | Send fewer items per request. |
| `400 Unknown source: <name>` | Full DSL, and the source is not declared. | Declare it in `sources`, or fix the producer's `source` name. |
| `500 Layer execution failed: <layer>` | An `execute` handler, or the `next` layer, threw. Also returned when a layer has no `execute` handler and is not `next`. | Check the layer's handler, or add an `execute` entry for the layer. |
| `defineRevalidation must be called before the revalidation consumer POST route` | The route's module graph never ran `defineRevalidation`. | Import the declarations module from the route file. |
| Dependent pages are not refreshed after a media change | The page uses a structure that is not discovered (see the compatibility table), or the page is unpublished. | Check the [compatibility table](producers/payload-media-dependencies.md#compatibility). |
| Pages stay stale after an edit, with no error | The event was lost after retries, the consumer was unreachable, or the page does not call `cacheTag` for the affected tag. | Check the producer logs for dispatch failures, and confirm the cached function tags the same string the rule invalidates. |
| Log `cache.revalidate.item.skipped` with `missing_param` | The event lacks a parameter the rule's template needs. | Make the producer send the field, or change the template. |
| Dispatch error `target URL must use https` | An `http://` target that is neither loopback nor inside `development` or `test`. | Use HTTPS, or a loopback host for local receivers. |
