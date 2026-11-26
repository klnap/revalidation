import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { payloadSchema, payloadSource } from '@klnap/revalidation/sources/payload'

const secret = `whsec_${Buffer.from('smoke-secret').toString('base64')}`
const { POST } = defineRevalidation({
  secret,
  sources: { [payloadSource]: payloadSchema },
  maxBodyBytes: 1024,
  tags: { item: 'test:[slug]' },
  paths: { report: '/reports/[slug]' },
  rules: ({ tags, paths, on }) => [
    on({ source: payloadSource }, ({ affected }) => ({
      tags: affected.flatMap(({ resource }) => {
        if (!['target', 'other', 'stale', 'partial'].includes(resource.slug)) return []
        return [
          {
            value: tags.item({ slug: resource.slug === 'partial' ? 'partial' : resource.slug }),
            ...(resource.slug === 'stale' ? { mode: 'stale' } : {}),
          },
        ]
      }),
      operations: affected.some(({ resource }) => resource.slug === 'partial')
        ? [{ layer: 'index', value: 'partial' }]
        : [],
      paths: affected.flatMap(({ resource }) =>
        resource.slug === 'report'
          ? [{ value: paths.report({ slug: '[slug]' }), type: 'page' }]
          : [],
      ),
    })),
    on({ source: payloadSource }, ({ affected }) => ({
      tags: affected.flatMap(({ resource }) =>
        resource.slug === 'partial' ? [tags.item({ slug: 'target' })] : [],
      ),
    })),
  ],
  execute: {
    index: async () => {
      throw new Error('private index failure')
    },
  },
})

export { POST }
