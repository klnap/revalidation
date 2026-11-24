import { readFile } from 'node:fs/promises'
import { cacheTag } from 'next/cache'

export async function cachedValue(key, file) {
  'use cache'
  cacheTag(`test:${key}`)
  return JSON.parse(await readFile(file, 'utf8'))[key]
}

export async function cachedReport(file) {
  'use cache'
  return JSON.parse(await readFile(file, 'utf8')).other
}
