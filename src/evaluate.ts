import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { Container } from 'postcss'
import { SourceMap } from './script'
import type { GlobalScope, GlobalEnv, CompileResult } from './compile'
import { getErrorPos } from './runtime'
import { getStackTrace, getCurrentStackTrace } from './stack-trace'
import { compactStackTrace, type Find } from './stack-trace'
import { getProp, setProp } from './utils'

const scopeURL = (scope: GlobalScope): URL =>
  scope == null ? new URL('file:///') : pathToFileURL(scope)

const globalRequire = (scope: GlobalScope, env: GlobalEnv): NodeRequire => {
  const url = scopeURL(scope)
  const requireOrig = createRequire(url)
  const requireExt = (name: string): unknown => {
    try {
      const binds = env.get(fileURLToPath(new URL(name, url)))
      if (binds != null) return getProp(getProp(binds, 'module'), 'exports')
    } catch {
      // ignore errors
    }
    return requireOrig(name)
  }
  for (const [k, v] of Object.entries(requireOrig)) setProp(requireExt, k, v)
  return requireExt as NodeRequire
}

export const defaultGlobals =
  (additions: Record<string, unknown>) =>
  (scope: GlobalScope, env: GlobalEnv): Record<string, unknown> => {
    const exports = Object.create(Object.create(null) as object) as object
    return {
      exports,
      module: { exports },
      require: globalRequire(scope, env),
      ...additions
    }
  }

export const evaluate = async (
  { run, code, evalOrigin }: CompileResult,
  root: Container
): Promise<void> => {
  try {
    await run()
  } catch (error) {
    const errorPos = getErrorPos(error)
    const sourceMap = new SourceMap(code)
    const find: Find<number> = frame => {
      const origin = frame.isEval() ? frame.getEvalOrigin() : null
      if (origin?.startsWith(evalOrigin) !== true) return undefined
      const pos = frame.getPosition()
      const src = sourceMap.find(pos)
      return src ?? pos
    }
    const trace = getStackTrace(error, find)
    if (typeof trace.source !== 'object' && errorPos != null) {
      trace.source = sourceMap.find(errorPos) ?? trace.source
    }
    const currentTrace = getCurrentStackTrace(find)
    let message = 'uncaught exception'
    const stackTrace = compactStackTrace(trace.stackTrace, currentTrace)
    if (stackTrace !== '') message += `\n${stackTrace}`
    const e =
      typeof trace.source === 'object'
        ? trace.source.input.error(message, trace.source.start?.offset ?? 0)
        : root.error(
            typeof trace.source === 'number'
              ? `${message}
(error occurred in the middle of generated code probably due to bug)
${code.highlight(trace.source)}`
              : `${message}
(failed to determine where the error happened)`
          )
    e.cause = error
    throw e
  }
}
