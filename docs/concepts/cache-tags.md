# Cache tags

Cache tags connect cached data to the events that invalidate it. `@klnap/revalidation` generates them from declarations, so the string used for caching and the string used for invalidation come from the same template.

## Declaring tags

```ts
// src/revalidation.ts
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next';

export const { tags, paths } = defineRevalidation({
  secret: process.env.REVALIDATION_SECRET!,
  tags: {
    page: '[locale]:page:[slug]', // parameterized
    siteSettings: '[locale]:site-settings', // parameterized by locale only
    navigation: 'navigation', // static: no parameters
  },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (cacheTags) => ({
    pages: [cacheTags.page],
    'site-settings': [cacheTags.siteSettings],
    navigation: [cacheTags.navigation],
  }),
});
```

A template is a string. Each `[name]` is a parameter. Names must start with a letter and contain letters, digits or underscores. Literal text is copied unchanged.

`defineRevalidation` returns `tags` and `paths`. Export them and import them wherever you cache data or change tags.

## Using tags

```ts
import { cacheTag } from 'next/cache';
import { tags } from '@/revalidation';

export async function getPage(locale: string, slug: string) {
  'use cache';
  cacheTag(tags.page({ locale, slug }));
}

export async function getNavigation() {
  'use cache';
  cacheTag(tags.navigation());
}
```

For an event with `key: "pages"`, `locale: "en"` and `slug: "about"`, the rule renders `[locale]:page:[slug]` as `en:page:about`. `getPage('en', 'about')` tags its entry with the same string, so the event expires that entry and no other.

## What TypeScript checks

Checked at compile time:

- The tag name must be declared: `tags.nope(...)` does not compile.
- A tag helper must be called with an argument: `tags.page()` does not compile.
- Parameter values must be `string` or `undefined`: `tags.page({ locale: 'en', slug: 1 })` does not compile.

Not checked at compile time:

- Which parameters a template needs. The template is a plain `string`, so `tags.page({ locale: 'en' })` compiles and throws at runtime (see below).
- Extra or misspelled keys. `tags.page({ locale: 'en', slug: 'a', lang: 'x' })` compiles and ignores `lang`.
- `null` values from JavaScript callers, or values cast with `as`.
- Tags declared by a different `defineRevalidation` call. Their names are not compared at compile time.

Covered by tests: `tests/types/cache-tags.test-d.ts` checks the compile-time rules above, positive and negative, and runs in `bun run typecheck`.

## What happens at runtime

- A missing or empty parameter (`undefined`, `''`, `null`) throws `Tag "page" missing param(s): slug` when a helper is called directly.
- When an event lacks a parameter that a rule needs, that tag or path is skipped and the event still succeeds. With a configured `logger`, the skip is logged as `cache.revalidate.item.skipped` with reason `missing_param`.
- Parameter values are not escaped. A value that contains `:` can produce the same string as another combination. Choose separators and values that cannot collide, for example slugs without `:`.
- Event parameters longer than 256 characters are rejected for the whole request (`400`). Direct helper calls accept them. Keep slugs shorter than 256 characters.

## What this guarantees, and what it does not

It guarantees that the cached-data side and the invalidation side generate identical strings from one declaration. It does not guarantee cache freshness:

- Caching data with the tag is your responsibility; a function that does not call `cacheTag` is not invalidated.
- Invalidation happens only when the event is delivered and accepted. See [reliability](../reliability.md).
- Next.js decides when a stale entry is regenerated. See [the consumer guide](../consumers/next.md#modes).
