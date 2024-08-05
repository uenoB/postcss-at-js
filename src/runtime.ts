import type { Postcss, Source, Container, ChildNode } from 'postcss'
import {
  isObject,
  isIterable,
  iterator,
  getProp,
  setProp,
  deleteProp,
  type AnyIterable,
  type AnyIterator
} from './utils'

class Helper {
  readonly p: Postcss
  private readonly prototypes: Record<ChildNode['type'], object>

  constructor(postcss: Postcss) {
    this.p = postcss
    this.prototypes = {
      atrule: Object.getPrototypeOf(postcss.atRule()) as object,
      comment: Object.getPrototypeOf(postcss.comment()) as object,
      decl: Object.getPrototypeOf(postcss.decl()) as object,
      rule: Object.getPrototypeOf(postcss.rule()) as object
    }
  }

  isChildNode(arg: unknown): arg is ChildNode {
    if (!isObject(arg)) return false
    const ty = arg['type']
    if (typeof ty !== 'string' || !(ty in this.prototypes)) return false
    const obj = this.prototypes[ty as keyof typeof this.prototypes]
    return Object.getPrototypeOf(arg) === obj
  }
}

interface ContainerRawsEnd {
  semicolon?: boolean | undefined
}
type ContainerSemi = Omit<Container, 'raws'> & { raws: ContainerRawsEnd }

const coerceToRaws = (obj: unknown): Readonly<ContainerRawsEnd> => {
  const semicolon = getProp(obj, 'semicolon')
  return { semicolon: typeof semicolon === 'boolean' ? semicolon : undefined }
}

const mergeRaws = (
  { semicolon: semi1 }: Readonly<ContainerRawsEnd>,
  { semicolon: semi2 }: Readonly<ContainerRawsEnd>
): Readonly<ContainerRawsEnd> => ({
  semicolon: semi2 == null ? semi1 : semi2 || Boolean(semi1)
})

export const stripRaws = <X extends ChildNode & { raws: { after?: string } }>(
  node: X
): X => {
  if (typeof node.raws.before === 'string' && !/\S/.test(node.raws.before)) {
    deleteProp(node.raws, 'before')
  }
  if (typeof node.raws.after === 'string' && !/\S/.test(node.raws.after)) {
    deleteProp(node.raws, 'after')
  }
  return node
}

const appendNodes = async (
  dest: ContainerSemi,
  iter: AnyIterator<ChildNode, Readonly<ContainerRawsEnd>>
): Promise<void> => {
  const nodes: ChildNode[] = []
  let next
  for (;;) {
    next = await iter.next()
    if (next.done != null && next.done) break
    nodes.push(next.value)
  }
  dest.append(nodes)
  const raws = mergeRaws(next.value, dest.raws)
  if (raws.semicolon != null) dest.raws.semicolon = raws.semicolon
}

export const newContainer = async <X extends ContainerSemi>(
  orig: X,
  iter: AnyIterable<ChildNode, Readonly<ContainerRawsEnd>>
): Promise<X> => {
  type Props = Record<string, unknown> & Pick<X, 'raws'>
  const Con = orig.constructor as new (x: Props) => X
  const src: Props = { raws: { ...orig.raws } }
  for (const [k, v] of Object.entries(orig)) {
    if (typeof v === 'string') src[k] = v
  }
  const node = new Con(src)
  if (orig.source != null) node.source = orig.source
  await appendNodes(node, iterator(iter))
  return node
}

const errorSymbol: unique symbol = Symbol('ErrorPos')

export const handleError = (error: unknown, pos: number): never => {
  setProp(error, errorSymbol, pos, false)
  throw error
}

export const getErrorPos = (error: unknown): number | undefined => {
  const pos = isObject(error) ? deleteProp(error, errorSymbol) : undefined
  return typeof pos === 'number' ? pos : undefined
}

class Unexpected extends Error {
  static async create(
    obj: unknown,
    pos?: number | undefined
  ): Promise<Unexpected> {
    const { inspect } = await import('node:util')
    const dump = inspect(obj, { depth: 3 })
    const error = new Unexpected(`attempt to inject an invalid value: ${dump}`)
    if (pos != null) setProp(error, errorSymbol, pos)
    return error
  }
}

export class BeginJs {
  readonly node: ChildNode
  readonly offset: number
  readonly pos: number
  private cachedSource?: Source | undefined

  constructor(node: ChildNode, offset: number, pos: number) {
    this.node = node
    this.offset = offset
    this.pos = pos
  }

  source(): Source | undefined {
    if (this.cachedSource != null) return this.cachedSource
    if (this.node.source == null) return
    const offset = (this.node.source.start?.offset ?? 0) + this.offset
    const loc = this.node.source.input.fromOffset(offset)
    if (loc != null) {
      const start = { offset, line: loc.line, column: loc.col }
      this.cachedSource = { ...this.node.source, start }
    } else {
      this.cachedSource = this.node.source
    }
    return this.cachedSource
  }
}

export class EndJs {
  readonly __EndJsBrand!: never
  readonly success: boolean

  constructor(success = true) {
    this.success = success
  }
}

class Context {
  private source: BeginJs | undefined
  private raws?: Readonly<ContainerRawsEnd> | undefined
  readonly helper: Helper

  constructor(helper: Helper, orig?: Context) {
    this.helper = helper
    this.source = orig?.source
  }

  next(source: BeginJs): Context {
    const context = new Context(this.helper)
    context.source = source
    context.raws = this.raws
    return context
  }

  nest(): Context {
    return new Context(this.helper, this)
  }

  get rawsEnd(): Readonly<ContainerRawsEnd> {
    return this.raws ?? {}
  }

  mergeRaws(raws: Readonly<ContainerRawsEnd>): void {
    this.raws = mergeRaws(this.rawsEnd, raws)
  }

  reflect<X extends ChildNode>(node: X): X {
    this.raws = undefined
    if (node.source == null) {
      const source = this.source?.source()
      if (source != null) node.source = source
    }
    return node
  }

  async unexpected(obj: unknown): Promise<Unexpected> {
    return await Unexpected.create(obj, this.source?.pos)
  }
}

const isPlainObject = (arg: unknown): arg is Record<string, unknown> => {
  if (!isObject(arg)) return false
  const proto: unknown = Object.getPrototypeOf(arg)
  return proto == null || proto === Object.prototype
}

const isInterpretable = (helper: Helper, arg: unknown): boolean =>
  isIterable(arg) || isPlainObject(arg) || helper.isChildNode(arg)

const hasOwnToString = (arg: unknown): boolean =>
  !isObject(arg) || arg.toString !== Object.prototype.toString

const isStringifiable = (helper: Helper, arg: unknown): boolean =>
  arg != null &&
  typeof arg !== 'function' &&
  !isInterpretable(helper, arg) &&
  hasOwnToString(arg)

const interpretUnknown = async function* (
  arg: unknown,
  context: Context
): AsyncGenerator<ChildNode, Readonly<ContainerRawsEnd>> {
  const stack: Array<AnyIterator<unknown>> = []
  let iter: AnyIterator<unknown> | undefined
  for (;;) {
    if (isIterable(arg)) {
      if (iter != null) stack.push(iter)
      iter = iterator(arg)
    } else if (isPlainObject(arg)) {
      yield* interpretObject(arg, context)
    } else if (context.helper.isChildNode(arg)) {
      yield context.reflect(arg)
    } else {
      throw await context.unexpected(arg)
    }
    for (;;) {
      if (iter == null) {
        context.mergeRaws({ semicolon: true })
        return context.rawsEnd
      }
      const next = await iter.next()
      if (!(next.done ?? false)) {
        arg = next.value
        break
      }
      iter = stack.pop()
    }
  }
}

const interpretObject = async function* (
  obj: Record<string, unknown>,
  context: Context
): AsyncGenerator<ChildNode> {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('@')) {
      // { "@name params": ... }
      const src = key.slice(1)
      const m = /[\t\n\f\r ]+|(?=["#'()/;[\\\]{}])/.exec(src)
      const name = m != null ? src.slice(0, m.index) : src
      const params = m != null ? src.slice(m.index + m[0].length) : ''
      const node = context.helper.p.atRule({ name, params })
      context.reflect(node)
      if (isInterpretable(context.helper, value)) {
        await appendNodes(node, interpretUnknown(value, context.nest()))
      } else if (value !== undefined) {
        throw await context.unexpected(value)
      }
      yield node
    } else if (isInterpretable(context.helper, value)) {
      // { "selector": ... }
      const node = context.helper.p.rule({ selector: key })
      context.reflect(node)
      await appendNodes(node, interpretUnknown(value, context.nest()))
      yield node
    } else if (isStringifiable(context.helper, value)) {
      // { "prop": value }
      const node = context.helper.p.decl({ prop: key, value: String(value) })
      context.reflect(node)
      yield node
    } else {
      throw await context.unexpected(value)
    }
  }
}

const mainLoop = async function* (
  helper: Helper,
  contents: AnyIterator<unknown>
): AsyncGenerator<ChildNode, Readonly<ContainerRawsEnd>> {
  let func, next
  let context = new Context(helper)
  const stack = []
  let iter: AnyIterator<unknown> | undefined = contents
  for (;;) {
    if (next == null) {
      for (;;) {
        next = await iter.next()
        if (!(next.done ?? false)) break
        context.mergeRaws(coerceToRaws(next.value))
        iter = stack.pop()
        if (iter == null) return context.rawsEnd
      }
    }
    let value
    if (func == null) {
      value = next.value
      next = undefined
    } else if (next.value instanceof EndJs) {
      value = next.value.success ? func() : undefined
      func = undefined
    } else {
      value = func(next.value)
      next = null
      func = undefined
    }
    if (value instanceof BeginJs) {
      context = context.next(value)
    } else if (value instanceof EndJs) {
      // ignore
    } else if (isIterable(value)) {
      stack.push(iter)
      iter = iterator(value)
    } else if (isPlainObject(value)) {
      yield* interpretObject(value, context)
    } else if (context.helper.isChildNode(value)) {
      yield context.reflect(value)
    } else if (typeof value === 'function') {
      func = value as (x?: unknown) => unknown
    } else if (value === undefined) {
      // ignore
    } else {
      throw await context.unexpected(value)
    }
  }
}

const interpretMain =
  (helper: Helper) =>
  (
    contents: () => AnyIterable<unknown>
  ): AnyIterable<ChildNode, Readonly<ContainerRawsEnd>> => ({
    [Symbol.asyncIterator]: (): AsyncGenerator<
      ChildNode,
      Readonly<ContainerRawsEnd>
    > => mainLoop(helper, iterator(contents()))
  })

const stringify =
  (helper: Helper) =>
  async (value: unknown): Promise<string> => {
    if (!isStringifiable(helper, value)) throw await Unexpected.create(value)
    return String(value)
  }

export const setup = (
  postcss: Postcss
): {
  interpretMain: ReturnType<typeof interpretMain>
  stringify: ReturnType<typeof stringify>
} => {
  const helper = new Helper(postcss)
  return { interpretMain: interpretMain(helper), stringify: stringify(helper) }
}
