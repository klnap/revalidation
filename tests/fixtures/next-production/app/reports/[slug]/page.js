import { Suspense } from 'react'
import { readFile } from 'node:fs/promises'

async function cachedReport(slug, file) {
  'use cache'
  return JSON.parse(await readFile(file, 'utf8'))[slug]
}

async function ReportContent() {
  return <p>{await cachedReport('other', process.env.DATA_FILE)}</p>
}

export async function generateStaticParams() {
  return [{ slug: 'report' }]
}

export default function ReportPage() {
  return (
    <Suspense fallback={<p>Loading report</p>}>
      <ReportContent />
    </Suspense>
  )
}
