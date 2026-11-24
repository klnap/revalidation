import { cachedValue } from '../../../lib/cache.js'

export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key')
  return Response.json({ value: await cachedValue(key, process.env.DATA_FILE) })
}
