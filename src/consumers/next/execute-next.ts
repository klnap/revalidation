import { revalidatePath, revalidateTag } from 'next/cache.js'

import { CacheSchemaError } from '../../core/errors.js'
import type { CacheEntry, LayerOperations } from '../../core/index.js'
import { MAX_TAG_LENGTH } from './compile-tag-template.js'

const MAX_PATH_LENGTH = 1024

const applyTag = (entry: CacheEntry): void => {
  if (entry.mode === 'stale') {
    revalidateTag(entry.value, 'max')
    return
  }
  revalidateTag(entry.value, { expire: 0 })
}

export const executeNextLayer = async (operations: LayerOperations): Promise<void> => {
  for (const tag of operations.tags) {
    if (tag.value.length > MAX_TAG_LENGTH) {
      throw new CacheSchemaError(`Next.js cache tag exceeds ${MAX_TAG_LENGTH} characters`)
    }
  }
  for (const path of operations.paths) {
    if (path.value.length > MAX_PATH_LENGTH) {
      throw new CacheSchemaError(`Next.js cache path exceeds ${MAX_PATH_LENGTH} characters`)
    }
  }

  for (const tag of operations.tags) {
    applyTag(tag)
  }
  for (const path of operations.paths) {
    revalidatePath(path.value)
  }
}
