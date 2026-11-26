# Cache tags and paths

`defineRevalidation()` creates typed tag and path helpers from templates. Use those helpers in
cached functions and in rule callbacks so both sides build the same cache key.

```ts
import { defineRevalidation } from '@klnap/revalidation/consumers/next'

export const { tags, paths, POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  sources: { [payloadSource]: payloadSchema },
  tags: { project: '[locale]:project:[slug]', settings: 'settings' },
  paths: { project: '/[locale]/work/[slug]', sitemap: '/sitemap.xml' },
  rules: ({ tags, paths, on }) => [
    on({ source: payloadSource }, ({ affected }) => ({
      tags: affected.flatMap(({ resource }) =>
        resource.locale && resource.slug
          ? [tags.project({ locale: resource.locale, slug: resource.slug })]
          : [],
      ),
      paths: affected.flatMap(({ resource }) =>
        resource.locale && resource.slug
          ? [paths.project({ locale: resource.locale, slug: resource.slug })]
          : [],
      ),
    })),
  ],
})
```

Each bracketed name becomes a required string argument. Static templates such as `settings` and
`/sitemap.xml` produce no-argument helpers.

TypeScript checks declared helper names and required parameters. It cannot prove that events contain
the values needed by a template or prevent collisions between different parameter combinations.
Missing or empty parameters throw when helpers are called. Rule callbacks should omit affected
resources that lack required values.

Tag results default to the configured mode (`expire` by default); rule- and result-level modes can
override it. Paths call Next.js `revalidatePath` without a tag profile. See the
[Next.js consumer guide](../consumers/next.md).
