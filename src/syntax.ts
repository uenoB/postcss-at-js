import { pathToFileURL } from 'node:url'
import type { Node, CssSyntaxError } from 'postcss'
import { Code, SourceMap, type NestedCode } from './script'
import { getProp, isObject, isNotEmpty } from './utils'

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type Acorn = typeof import('acorn')

const acornParse = async (): Promise<Acorn['parse'] | undefined> => {
  try {
    return (await import('acorn')).parse
  } catch {
    return undefined
  }
}

const acornOptions = {
  ecmaVersion: 'latest',
  allowAwaitOutsideFunction: true
} as const

export const cssSyntaxError = (
  message: string,
  node: Pick<Node, 'error' | 'source'>,
  offset: number
): CssSyntaxError =>
  node.source?.start?.offset != null
    ? node.source.input.error(message, node.source.start.offset + offset)
    : node.error(message)

const findSyntaxError = async (
  test: string,
  cause?: unknown
): Promise<{
  cause: unknown
  pos: number | undefined
}> => {
  let pos
  // Function does not report the position where the syntax error occurs.
  // we use Acorn to find where the error is.
  const parse = await acornParse()
  if (parse == null) {
    console.info('install acorn to make syntax errors more accurate.')
  } else {
    try {
      parse(test, acornOptions)
    } catch (error) {
      cause = error
      const epos = getProp(error, 'pos')
      if (typeof epos === 'number') pos = epos
    }
  }
  return { cause, pos }
}

type Import = (x: string) => Promise<object>

const makeImport = (basePath: string): Import => {
  const base = pathToFileURL(basePath).href
  return async name => {
    if (/^[./]/.test(name)) name = new URL(name, base).href
    return (await import(name)) as object
  }
}

const findImports = (node: unknown): number[] => {
  const starts: number[] = []
  const visit = (node: unknown): void => {
    if (!isObject(node)) return
    if (node['type'] === 'ImportExpression') {
      if (typeof node['start'] === 'number') starts.push(node['start'])
    }
    for (const i of Object.values(node)) visit(i)
  }
  visit(node)
  return starts
}

const replaceImport = async (
  code: Code<string[]>
): Promise<Code<Array<string | Code<string[]> | Import>>> => {
  if (!code.content.some(i => /\bimport\b/.test(i))) return code
  const loc = code.location()
  if (loc.source?.input.file == null) return code
  const parse = await acornParse()
  if (parse == null) {
    console.info('install acorn to make import() work as expected.')
    return code
  }
  const src = code.content.join('')
  const starts = findImports(parse(src, acornOptions))
  if (!isNotEmpty(starts)) return code
  const importFn = makeImport(loc.source.input.file)
  const results: Array<string | Code<string[]> | Import> = []
  results.push(src.slice(0, starts[0]))
  starts.forEach((pos, i) => {
    const beg = pos + 'import'.length
    const end = starts[i + 1]
    const slice = end != null ? src.slice(beg, end) : src.slice(beg)
    results.push(importFn, new Code([slice], { source: loc, offset: beg }))
  })
  return new Code(results, loc)
}

export interface UserCode {
  expr: boolean
  code: Code<Array<string | Code<string[]> | Import>>
}

export const userCode = async (
  at: Pick<Node, 'error' | 'source'>,
  offset: number,
  sourceCode: string,
  stub = ''
): Promise<UserCode> => {
  const attempt = async (
    prefix: string,
    suffix: string,
    errorDetail?: boolean
  ): Promise<Error | undefined> => {
    const test = `${prefix}${sourceCode}${suffix}`
    try {
      // eslint-disable-next-line no-new-func,@typescript-eslint/no-implied-eval
      Function(test)
      return undefined
    } catch (error) {
      if (!(errorDetail ?? false)) return Error()
      const fail = await findSyntaxError(test, error)
      const pos = offset + (fail.pos ?? prefix.length) - prefix.length
      const e = cssSyntaxError(String(fail.cause), at, pos)
      e.cause = fail.cause
      return e
    }
  }
  const code = new Code([sourceCode], { source: at.source, offset })
  // ToDo: reject top-level unparenthesized anonymous `function`
  const e1 = await attempt('async function* f(){ return (\n', `${stub}\n);}`)
  if (e1 == null) return { code: await replaceImport(code), expr: true }
  const e2 = await attempt('async function* f(){\n', `${stub}\n;}`, true)
  if (e2 == null) return { code: await replaceImport(code), expr: false }
  throw e2
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const evalCode = async <Type extends (...a: never[]) => unknown>(
  id: string,
  code: NestedCode // must be a function expression of Type
): Promise<{
  result: Type
  origin: string
}> => {
  const script = code.toString()
  const origin = `eval at ${id}$ (eval at evalCode (`
  // eslint-disable-next-line no-new-func,@typescript-eslint/no-implied-eval
  const func = Function(
    // include id in the EvalOrigin of the given code.
    // use indirect eval rather than Function for accurate getPosition().
    `return function ${id}$(script) { return (0, eval)(script) }`
  ) as () => (script: string) => unknown
  try {
    const result = func()(script) as Type
    return { result, origin }
  } catch (error) {
    const message = String(getProp(error, 'message') ?? error)
    const sourceMap = new SourceMap(code)
    const { cause, pos } = await findSyntaxError(script, error)
    const source = pos != null ? sourceMap.find(pos) : undefined
    if (source != null) {
      const e = source.input.error(message, source.start?.offset ?? 0)
      e.cause = error
      throw e
    }
    const e = Error(`${message}
(error occurred in the middle of generated code probably due to bug)
${code.highlight(pos)}`) // for debug
    e.cause = cause
    throw e
  }
}
