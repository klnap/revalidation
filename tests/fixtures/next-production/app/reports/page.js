import { cachedReport } from '../../lib/cache.js'

export default async function Reports() {
  return <main>{await cachedReport(process.env.DATA_FILE)}</main>
}
