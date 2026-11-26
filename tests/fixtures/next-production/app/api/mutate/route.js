import { readFile, writeFile } from 'node:fs/promises'

export async function POST() {
  const file = process.env.DATA_FILE
  const data = JSON.parse(await readFile(file, 'utf8'))
  data.target = data.target === 'new-target' ? 'partial-target' : 'new-target'
  data.other = 'new-other'
  data.stale = 'new-stale'
  await writeFile(file, JSON.stringify(data))
  return Response.json({ ok: true })
}
