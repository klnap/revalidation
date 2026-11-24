import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, type CollectionConfig, getPayload, type Payload, type Plugin } from 'payload'

export type TestPayloadHandle = {
  payload: Payload
  destroy: () => Promise<void>
}

/** Boots Payload on a throwaway SQLite file so no external database is needed. */
export const createTestPayload = async (
  collections: CollectionConfig[],
  plugins: Plugin[] = [],
): Promise<TestPayloadHandle> => {
  const dir = mkdtempSync(join(tmpdir(), 'revalidation-int-'))
  const config = await buildConfig({
    secret: 'revalidation-test-secret-32chars!!',
    logger: { options: { level: 'silent' } },
    db: sqliteAdapter({ client: { url: `file:${join(dir, 'db.sqlite')}` }, push: true }),
    typescript: { autoGenerate: false },
    collections,
    plugins,
  })
  const payload = await getPayload({ config, key: dir })

  return {
    payload,
    destroy: async () => {
      try {
        await payload.destroy()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  }
}
