declare module 'next/cache.js' {
  export function revalidateTag(tag: string, profile: string | { expire?: number }): void
  export function revalidatePath(path: string, type?: 'page' | 'layout'): void
}
