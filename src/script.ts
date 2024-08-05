import type { Source } from 'postcss'

// source location
export type Loc =
  | {
      source: Loc
      offset?: number | null // null: every char in code has the same position
    }
  | Source
  | 'relative'
  | undefined

export interface ComputedLoc {
  source: Source | undefined
  offset: number
  inc: 0 | 1
}

const computeLoc = (loc?: Loc, from?: Loc): ComputedLoc => {
  let offset = 0
  let inc: 0 | 1 = 1
  for (;;) {
    if (loc == null || loc === 'relative' || !('source' in loc)) break
    if (loc.offset === null) {
      inc = 0
    } else {
      offset += loc.offset ?? 0
    }
    loc = loc.source
  }
  if (loc === 'relative') {
    const base = computeLoc(from)
    return { source: base.source, offset: base.offset + offset, inc: 0 }
  } else {
    return { source: loc, offset, inc }
  }
}

// something with source location
export class Code<X = string> {
  readonly content: X
  readonly source: Loc

  constructor(content: X, loc?: Loc) {
    this.content = content
    this.source = loc
  }

  toString(): string {
    return Array.isArray(this.content)
      ? this.content.join('')
      : String(this.content)
  }

  highlight(position: number | undefined): string {
    const s = this.toString()
    if (position == null) return s
    const pre = s.slice(0, position)
    const post = s
      .slice(position)
      .replace(
        /^#?[\p{ID_Start}\p{ID_Continue}$_\u200c\u200d]+|^./u,
        '\x1b[1m\x1b[31m\x1b[7m$&\x1b[m\x1b[1m\x1b[31m'
      )
    return '\x1b[32m' + pre + post + '\x1b[m'
  }

  location(): ComputedLoc {
    return computeLoc(this.source)
  }
}

// template literal tag for writing Code.
// all linebreaks in tagged literal are removed.  you can't use any
// linebreak as a whitespace.  To add a linebreak, write ${'\n'}.
export const CODE =
  (loc: Loc = 'relative') =>
  <X extends readonly unknown[]>(
    strings: TemplateStringsArray,
    ...values: X
  ): Code<Array<string | X[number]>> => {
    const dst: Array<string | X[number]> = []
    strings.raw.forEach((s, i) => {
      s = s.replace(/\s+^\s*/gm, '')
      if (s !== '') dst.push(s)
      if (i in values) dst.push(values[i])
    })
    return new Code(dst, loc)
  }

// NestedCode<X> is a recursive Code whose content is X, where X is not Code.
// Exceptionally, making an empty NestedCode<X> is allowed for any X.
type NestedCodeItem<X> = NestedCode<X> | (Code<never> extends X ? never : X)
export type NestedCode<X = string> = Code<Array<NestedCodeItem<X>>>

const translate = <X, Y, Z = never>(
  source: NestedCode<X>,
  methods:
    | {
        translate: (item: X, context: Z) => NestedCodeItem<Y>
        begin?: (item: NestedCode<X>, context: Z) => Z
        end?: (item: NestedCode<X>, context: Z) => void
        init: Z
      }
    | {
        translate: (item: X, context: Z) => NestedCodeItem<Y>
        begin?: (item: NestedCode<X>) => Z
        end?: (item: NestedCode<X>, context: Z) => void
        init?: Z
      }
): NestedCode<Y> => {
  type Task = [Z, NestedCode<X>, Array<NestedCodeItem<Y>>, number]
  const stack: Task[] = []
  const begin = methods.begin ?? ((_, z) => z)
  const context = begin(source, methods.init as Z)
  let task: Task = [context, source, [], 0]
  for (;;) {
    const [context, src, dst, index] = task
    if (index < src.content.length) {
      if (index in src.content) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const elem = src.content[index]!
        if (elem instanceof Code) {
          stack.push([context, src, dst, index])
          task = [begin(elem, context), elem, [], 0]
          continue
        }
        dst[index] = methods.translate(elem, context)
      }
      task[3]++
    } else {
      const ret = new Code(dst, src)
      methods.end?.(src, context)
      const t = stack.pop()
      if (t == null) return ret
      task = t
      task[2][task[3]++] = ret
    }
  }
}

// This is our own source map mechanism, not the standard one
export class SourceMap {
  private deferred: NestedCode | undefined
  private sourceMap: Source[] = []
  private offsetMap: number[] = []

  constructor(code: NestedCode) {
    this.deferred = code
  }

  private force(): void {
    const source = this.deferred
    if (source == null) return
    this.deferred = undefined
    let cursor = 0
    let position = 0
    translate(source, {
      init: { loc: computeLoc(), start: 0 },
      begin: (code: NestedCode, { loc, start }) => ({
        loc: computeLoc(code, { source: loc, offset: cursor - start }),
        start: cursor
      }),
      translate: (item, { loc, start }): void => {
        if (loc.source != null) {
          const offset = loc.offset + (cursor - start) * loc.inc
          for (let i = 0; i < item.length; i++) {
            this.sourceMap[position + i] = loc.source
            this.offsetMap[position + i] = offset + i * loc.inc
          }
          cursor += item.length * loc.inc
        }
        position += item.length
      }
    })
  }

  find(position: number): Source | undefined {
    this.force()
    let offset = this.offsetMap[position]
    const source = this.sourceMap[position]
    if (offset == null || source == null) return
    offset += source.start?.offset ?? 0
    const r = source.input.fromOffset(offset)
    if (r == null) return source
    const start = { offset, line: r.line, column: r.col }
    return { ...source, start }
  }
}

// placeholder for local variables in Script
export class Variable {
  readonly __VariableBrand!: never
}

// placeholder for the offset of generated code
export class Offset {
  readonly __OffsetBrand!: never
}

export const generate = <X>(
  source: NestedCode<X>
): {
  id: string
  code: NestedCode
  args: unknown[]
} => {
  let vars = 0
  const argMap = new Map<unknown, number>()
  const args: unknown[] = []
  const contents: string[] = []
  const translated = translate<X, string | number | Offset>(source, {
    translate: (item: X) => {
      let result: string | number | Offset
      if (typeof item === 'string' || item instanceof Offset) {
        result = item
      } else if (typeof item === 'number' || typeof item === 'boolean') {
        result = JSON.stringify(item)
      } else if (item === null) {
        result = 'null'
      } else if (item === undefined) {
        result = 'void 0'
      } else {
        let index = argMap.get(item)
        if (index == null) {
          if (item instanceof Variable) {
            index = -++vars
          } else {
            index = args.length
            args.push(item)
          }
          argMap.set(item, index)
        }
        result = index
      }
      if (typeof result === 'string') contents.push(result)
      return result
    }
  })
  const tmp = contents.join('')
  let tmpId
  do {
    tmpId = `$${Math.floor(Math.random() * 4294967296).toString(16)}`
  } while (tmp.includes(tmpId))
  const id = tmpId
  const func = CODE()`(function $compiled(${id}) {
    "use strict";
    ${translated};
  })`
  let cursor = 0
  const code = translate(func, {
    translate: (item: string | number | Offset) => {
      let ret
      if (typeof item === 'number') {
        item = item < 0 ? `${id}$${-item}` : `${id}[${item}]`
        ret = new Code([item], 'relative')
      } else if (item instanceof Offset) {
        item = String(cursor)
        ret = new Code([item], 'relative')
      } else {
        ret = item
      }
      cursor += item.length
      return ret
    }
  })
  return { id, code, args }
}
