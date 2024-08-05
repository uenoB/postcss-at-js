// used for checking if some properties are not mentioned in a object type.
// USE WITH CAUTION: bacause of structural subtyping, properties in an
// object type only ensures their existence. there is no way to ensure
// for an object not to have some property in TypeScript's type system.
//   const A = { foo: 1, bar: 2 }
//   const B: { foo: number } = A                    // OK
//   const C: { foo: number } & { bar?: never } = A  // NG
//   const D: { foo: number } & { bar?: never } = B  // OK
type Never<X> = { [K in keyof X]: never }

// transform an object type X into Y | Z where Y must not have K but
// Z must have K. this makes type narrowing more accurate.
//   Split<{ foo: number, bar: string }, 'foo'>
//     = { foo?: never, bar: string } | { foo: number, bar: string }
// this transformation does not change the semantics.
export type Split<X, T extends keyof X> =
  | (Omit<X, T> & Pick<Never<Partial<X>>, T>)
  | (X & Pick<Required<X>, T>)

export const isNonNullProp = <X, K extends keyof X>(
  obj: X,
  prop: K
): obj is X & { [k in K]-?: NonNullable<X[k]> } => obj[prop] != null

export type AnyIterable<X, Return = unknown> =
  | { [Symbol.iterator]: () => Iterator<X, Return> }
  | { [Symbol.asyncIterator]: () => AsyncIterator<X, Return> }
export type AnyIterator<X, Return = unknown> =
  | AsyncIterator<X, Return>
  | Iterator<X, Return>

export const isIterable = (arg: unknown): arg is AnyIterable<unknown> => {
  if (arg == null || typeof arg !== 'object') return false
  const x = arg as Record<number | string | symbol, unknown>
  return (
    typeof x[Symbol.asyncIterator] === 'function' ||
    typeof x[Symbol.iterator] === 'function'
  )
}

export const iterator = <X, Y>(iter: AnyIterable<X, Y>): AnyIterator<X, Y> =>
  Symbol.asyncIterator in iter
    ? iter[Symbol.asyncIterator]()
    : iter[Symbol.iterator]()

export const isObject = (
  arg: unknown
): arg is Record<string | symbol, unknown> =>
  arg != null && typeof arg === 'object'

export const isNotEmpty = <X>(x: X[]): x is [X, ...X[]] => 0 in x

export const getProp = (obj: unknown, key: string | symbol): unknown =>
  isObject(obj) && key in obj ? obj[key] : undefined

export const setProp = <X, K extends string | symbol>(
  obj: X,
  key: K,
  value: K extends keyof X ? X[K] : unknown,
  overwrite = true
): void => {
  if (isObject(obj) && (key in obj ? overwrite : value !== undefined)) {
    try {
      const x = obj as Record<K, unknown>
      x[key] = value
    } catch {
      // ignore errors
    }
  }
}

export const deleteProp = <K extends string | symbol>(
  obj: { [P in K]?: unknown },
  key: K
): unknown => {
  if (!isObject(obj) || !(key in obj)) return
  const value = obj[key]
  try {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete obj[key]
  } catch {
    // ignore errors
  }
  return value
}
