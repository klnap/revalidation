import type { RevalidateArgs, RevalidationChange } from './types.js'

export const getOperation = (args: RevalidateArgs): RevalidationChange['operation'] => {
  if ('operation' in args) return args.operation
  if ('global' in args) return 'update'
  return 'delete'
}
