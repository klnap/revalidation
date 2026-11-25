# Cache tags and paths

`defineRevalidation` turns tag and path templates into typed helpers. Cached functions and event rules can use the same helpers, so they produce the same string from the same parameters.

## Declare targets once

```ts
import 'server-only';
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';

export const { tags, paths, POST } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: {
    project: '[locale]:project:[slug]',
    settings: 'settings',
  },
  paths: {
    project: '/[locale]/work/[slug]',
    sitemap: '/sitemap.xml',
  },
  resolve: (event) => event.key ?? invalidKey(),
  rules: ({ tags, paths }) => ({
    projects: { tags: [tags.project], paths: [paths.project, paths.sitemap] },
    settings: [tags.settings],
  }),
});
```

Each bracketed name is a template parameter. Static templates such as `'settings'` and `'/sitemap.xml'` produce no-argument helpers.

## Use the helpers

```ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

export async function getProject(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.project({ locale, slug }));
  // Load the project.
}

export async function getSettings() {
  'use cache';
  cacheTag(tags.settings());
}
```

For a rule matching `projects`, `tags.project({ locale: 'en', slug: 'studio' })` builds `en:project:studio`, which is the tag invalidated for the same event parameters.

## TypeScript guarantees

TypeScript checks:

- The helper name exists in this configuration.
- Every required template parameter is present.
- Parameter values are strings.
- Static helpers take no arguments.
- Rule targets reference helpers declared by this configuration.

TypeScript does not validate incoming event data, compare templates from separate configurations, reject extra keys passed through variables, or prevent parameter combinations from colliding. JavaScript callers and values forced through type assertions can also violate the declared types.

At runtime, helper calls with missing or empty parameters throw. For events, a missing rule parameter skips only that tag or path; a configured logger records the skip. Values are not escaped, so choose delimiters that cannot collide with parameter values.

## Helpers without a handler

Code that only needs cache helpers can avoid importing the secret-bearing Route Handler configuration:

```ts
import { defineRevalidationTags } from '@klnap/revalidation/consumers/next/tags';

export const { tags, paths } = defineRevalidationTags({
  tags: { project: '[locale]:project:[slug]' },
  paths: { project: '/[locale]/work/[slug]' },
});
```

This helper builds tags and paths only. It does not require a secret, initialize a handler, or import Next.js cache APIs. Keep the templates in a shared object if both this module and `defineRevalidation` need them.

Use these helpers in cached application code. Inside `defineRevalidation`, build rule targets from the `tags` and `paths` passed to its callback; those references belong to that handler configuration.

These types ensure that the cache and rule sides share helper declarations. They do not guarantee event delivery, successful cache-layer execution, cache freshness, or protection from every possible tag collision. See [reliability](../reliability.md).
