# Cache templates and rule semantics

`defineRevalidation()` creates typed tag and path builders. The same builders work as callables in
cached application code and as references in declarative resource mappings:

```ts
const { tags, paths, POST } = defineRevalidation({
  secret,
  tags: {
    pages: '[locale]:pages',
    page: '[locale]:page:[slug]',
  },
  paths: {
    page: '/[locale]/[slug]',
  },
  rules: ({ tags, paths }) => ({
    'payload.collection.pages': {
      tags: [tags.pages, tags.page],
      paths: [paths.page],
    },
  }),
})
```

Calling `tags.page({ locale: 'pl', slug: 'about' })` renders `pl:page:about`; calling
`paths.page({ locale: 'pl', slug: 'about' })` renders `/pl/about`. Every bracketed parameter is
required by the TypeScript helper. Static templates need no arguments.

For each matching affected resource, the consumer resolves placeholders from `locale`, `slug`,
`id`, and configured `identifiers`. Payload emits previous and current resources when a route
identifier changes. The consumer expands both through the same mapping and deduplicates identical
operations. Missing parameters are reported as incomplete invalidation; no malformed template
result is executed.

Tag parameters are limited to 256 characters. Path parameters are also checked for URL-segment
safety: path separators, control characters, malformed percent escapes, dot segments, and
query/fragment delimiters are rejected. These checks apply to untrusted event data as well as
application calls.

Use grouped mappings when multiple resources share one policy. Use `on()` with structured
selectors and resolver callbacks only when conditions or application-specific logic require them.
Both forms compile to the same internal rule and execution pipeline.

Tag profiles use Next.js-native values. They inherit from the individual tag tuple, the rule, then
the consumer configuration; tags default to `{ expire: 0 }`. Conflicting profiles for one tag reject
the request before side effects. Path tuples can select a `page` or `layout` scope for literal
dynamic route patterns. See the [Next.js consumer guide](../consumers/next.md).
