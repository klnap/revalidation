/** Why a value is unsafe as a single URL path segment, or `undefined` when it is safe. */
export const urlSegmentProblem = (value: string): string | undefined => {
  if (value.includes('?') || value.includes('#')) return 'a query or fragment delimiter'
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return 'malformed percent encoding'
  }
  if (decoded === '.' || decoded === '..') return 'a dot segment'
  if (/[/\\\p{Cc}]/u.test(decoded)) return 'a path separator or control character'
  return undefined
}
