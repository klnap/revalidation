import type { RevalidationEvent } from './host-types.js'

const WIRE_FIELD_KEYS = [
  'key',
  'locale',
  'slug',
  'documentId',
  'collection',
  'global',
  'operation',
] as const

type WireFieldKey = (typeof WIRE_FIELD_KEYS)[number]

const readWireField = (item: Record<string, unknown>, key: WireFieldKey): string | undefined => {
  const value = item[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export const flattenRevalidationEvent = <TItem extends Record<string, unknown>>(
  base: Omit<RevalidationEvent<TItem>, WireFieldKey>,
  item: TItem,
): RevalidationEvent<TItem> => {
  const record = item as Record<string, unknown>
  const flat: Partial<Record<WireFieldKey, string>> = {}
  for (const key of WIRE_FIELD_KEYS) {
    const value = readWireField(record, key)
    if (value !== undefined) {
      flat[key] = value
    }
  }
  return { ...base, ...flat, item }
}
