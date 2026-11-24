import * as v from 'valibot'

/** Low-effort wire items: no CMS shape — host `resolve` maps arbitrary JSON. */
export const passthroughWireItemSchema = v.looseObject({})
