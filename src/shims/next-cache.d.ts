declare module 'next/cache.js' {
  export function revalidateTag(tag: string, profile?: 'max' | { expire?: number }): void
  export function revalidatePath(path: string): void
}
