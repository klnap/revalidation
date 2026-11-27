import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { resourceChangedEventType } from '@klnap/revalidation'

const secret = `whsec_${Buffer.from('smoke-secret').toString('base64')}`
const { POST } = defineRevalidation({
  secret,
  maxBodyBytes: 1024,
  tags: { item: 'test:[slug]' },
  paths: { report: '/reports/[slug]' },
  rules: ({ tags, paths, on }) => [
    on({ type: resourceChangedEventType }, ({ affected }) => ({
      tags: affected.flatMap(({ resource }) => {
        if (!['target', 'other', 'stale', 'partial'].includes(resource.slug)) return []
        return [
          [
            tags.item({ slug: resource.slug === 'partial' ? 'partial' : resource.slug }),
            ...(resource.slug === 'stale' ? ['max'] : []),
          ],
        ]
      }),
      operations: affected.some(({ resource }) => resource.slug === 'partial')
        ? [{ layer: 'index', value: 'partial' }]
        : [],
      paths: affected.flatMap(({ resource }) =>
        resource.slug === 'report' ? [['/reports/[slug]', 'page']] : [],
      ),
    })),
    on({ type: resourceChangedEventType }, ({ affected }) => ({
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
