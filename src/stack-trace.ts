import type { Source } from 'postcss'
import { getProp, type Split } from './utils'

type NotSource = string | number | boolean

const nonEmpty = (x: unknown): string | null =>
  typeof x === 'string' && x !== '' ? x : null

const addSuffix = (x: string | null | undefined, y: string): string =>
  x == null || x === '' ? '' : x + y

const serializeSource = (
  s: Pick<Required<Source>, 'input' | 'start'>
): string =>
  `${nonEmpty(s.input.file) ?? '<anonymous>'}:${s.start.line}:${s.start.column}`

const serialize = (
  frame: NodeJS.CallSite,
  source?: Split<Source, 'start'> | undefined
): string => {
  if (source?.start == null) return frame.toString()
  // see SerializeJSStackFrame in v8/src/objdcts/call-site-info.cc
  const func = nonEmpty(frame.getFunctionName())
  const ty = nonEmpty(frame.getTypeName())
  const index = frame.getPromiseIndex()
  const out: string[] = []
  if (frame.isAsync()) out.push('async ')
  if (frame.isAsync() && index != null) {
    out.push(`Promise.${func ?? '<anonymous>'} (index ${index})`)
  } else if (frame.isConstructor()) {
    out.push(`new ${func ?? '<anonymous>'} (${serializeSource(source)})`)
  } else if (!frame.isToplevel()) {
    const method = nonEmpty(frame.getMethodName())
    if (func != null) {
      out.push(`${addSuffix(ty, '.')}${func}`)
      if (method != null && !func.endsWith(method)) out.push(` [as ${method}]`)
    } else {
      out.push(`${addSuffix(ty, '.')}${method ?? '<anonymous>'}`)
    }
    out.push(` (${serializeSource(source)})`)
  } else if (func != null) {
    out.push(`${func} (${serializeSource(source)})`)
  } else {
    out.push(serializeSource(source))
  }
  return out.join('')
}

const hookPrepareStackTrace = <X>(
  f: (error: Error, frames: NodeJS.CallSite[]) => string,
  g: () => X
): X => {
  if ('prepareStackTrace' in Error) {
    const orig = Error.prepareStackTrace
    Error.prepareStackTrace = f
    try {
      return g()
    } finally {
      Error.prepareStackTrace = orig
    }
  } else {
    Error.prepareStackTrace = f
    try {
      return g()
    } finally {
      delete Error.prepareStackTrace
    }
  }
}

export type Find<X> = (f: NodeJS.CallSite) => Source | X | undefined

export const getStackTrace = <X extends NotSource = never>(
  exn: unknown,
  find: Find<X>
): {
  stackTrace?: unknown
  source?: Source | X | undefined
} => {
  let ret: Source | X | undefined
  const stackTrace = hookPrepareStackTrace(
    (err, frames) => {
      const lines = [`${nonEmpty(err.name) ?? 'Error'}: ${err.message}`]
      frames.forEach(frame => {
        const src = find(frame)
        const source = typeof src === 'object' ? src : undefined
        lines.push(`    at ${serialize(frame, source)}`)
        if (ret == null && typeof src !== 'object') ret = src
        if (typeof ret !== 'object' && source?.start != null) ret = source
      })
      return lines.join('\n')
    },
    // exn.stack calls prepareStackTrace if it has not yet been generated.
    () => getProp(exn, 'stack')
  )
  return { stackTrace, source: ret }
}

export const getCurrentStackTrace = (find: Find<NotSource>): unknown => {
  try {
    throw new Error(String(Math.random()))
  } catch (e) {
    return getStackTrace(e, find).stackTrace
  }
}

// look for the longest suffix of s2 occurred in (possibly middle of) s1
// and return the elements of s1 followed by the suffix. for example:
//     removeCommonTrace('abcdef', 'ghicde') === 'ab'
const removeCommonTrace = <Y>(s1: Y[], s2: Y[]): Y[] => {
  for (let i = 0; i < s1.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const j = s2.indexOf(s1[i]!)
    if (j < 0) continue
    for (let k = 1; ; k++) {
      if (s1[i + k] == null || s2[j + k] == null) return s1.slice(0, i)
      if (s1[i + k] !== s2[j + k]) break
    }
  }
  return s1
}

export const compactStackTrace = (
  stackTrace: unknown,
  baseTrace: unknown
): string => {
  const stack = nonEmpty(stackTrace)
  if (stack == null) return ''
  const base = nonEmpty(baseTrace)
  if (base == null) return stack
  const out = removeCommonTrace(stack.split('\n'), base.split('\n')).join('\n')
  return out
}
