import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dir, '../..')

const markdownFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') return []
    if (statSync(path).isDirectory()) return markdownFiles(path)
    return entry.endsWith('.md') ? [path] : []
  })

/** GitHub's heading anchor rule: lowercase, drop punctuation, spaces become hyphens. */
const anchorOf = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')

const anchorsIn = (file: string): Set<string> => {
  const anchors = new Set<string>()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line)
    if (match?.[1]) anchors.add(anchorOf(match[1]))
  }
  return anchors
}

const linksIn = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? '')

const files = [
  join(root, 'README.md'),
  join(root, 'CHANGELOG.md'),
  join(root, 'CONTRIBUTING.md'),
  join(root, 'SECURITY.md'),
  ...markdownFiles(join(root, 'docs')),
]

describe('documentation links', () => {
  for (const file of files) {
    it(`${relative(root, file)} links resolve`, () => {
      const broken: string[] = []
      for (const link of linksIn(file)) {
        if (/^(https?:|mailto:)/.test(link)) continue
        const [pathPart = '', anchor] = link.split('#')
        const target = pathPart ? resolve(dirname(file), pathPart) : file
        if (!existsSync(target)) {
          broken.push(`${link} (missing file)`)
          continue
        }
        if (anchor && target.endsWith('.md') && !anchorsIn(target).has(anchor)) {
          broken.push(`${link} (missing anchor)`)
        }
      }
      expect(broken).toEqual([])
    })
  }
})
