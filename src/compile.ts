import type { Node, Root, AtRule, Rule, Declaration, ChildNode } from 'postcss'
import { cssSyntaxError, userCode, evalCode, type UserCode } from './syntax'
import {
  CODE,
  Code,
  Variable,
  Offset,
  generate,
  type NestedCode
} from './script'
import {
  BeginJs,
  EndJs,
  newContainer,
  handleError,
  stripRaws,
  setup
} from './runtime'
import { isNonNullProp } from './utils'

type Prim = string | number | boolean | null | undefined
type Func = ((...x: never[]) => unknown) | (new (...x: never[]) => unknown)
type ScriptItem = Prim | Func | Node | Variable | Offset | unknown[]
type ScriptCode = NestedCode<ScriptItem>
type Script = ScriptItem | ScriptCode

const declBetween = (decl: Declaration): string => decl.raws.between ?? ': '

const ruleBetween = (rule: Rule): string => rule.raws.between ?? ' '

const atRuleAfterName = (atRule: AtRule): string =>
  atRule.raws.afterName ?? (atRule.params === '' ? '' : ' ')

const atRuleBetween = (atRule: AtRule): string =>
  atRule.raws.between ?? (atRule.nodes == null ? '' : ' ')

const valueOffset = (decl: Declaration): number =>
  `${decl.prop}${declBetween(decl)}`.length

const ruleBodyOffset = (rule: Rule): number =>
  `${rule.selector}${ruleBetween(rule)}`.length

const paramsOffset = (atRule: AtRule): number =>
  `@${atRule.name}${atRuleAfterName(atRule)}`.length

const atRuleBodyOffset = (atRule: AtRule): number =>
  paramsOffset(atRule) + `${atRule.params}${atRuleBetween(atRule)}`.length

const containerOffset = (node: AtRule | Rule | Root): number =>
  node.type === 'atrule'
    ? atRuleBodyOffset(node)
    : node.type === 'rule'
      ? ruleBodyOffset(node)
      : 0

export type GlobalScope = string | undefined
export type GlobalBinds = Record<string, unknown>
export type GlobalEnv = Map<GlobalScope, GlobalBinds>
export type GlobalMaker = (
  scope: GlobalScope,
  env: GlobalEnv
) => GlobalBinds | Promise<GlobalBinds>

interface GlobalContext {
  globalScope?: GlobalScope
  globalEnv: GlobalEnv
  globals: GlobalMaker
}

const loadGlobals = async (g: GlobalContext): Promise<ScriptCode> => {
  let binds = g.globalEnv.get(g.globalScope)
  if (binds == null) {
    binds = await g.globals(g.globalScope, g.globalEnv)
    g.globalEnv.set(g.globalScope, binds)
  }
  return CODE()`const {${Object.keys(binds).join(', ')}} = ${() => binds}();`
}

interface CompileContext extends GlobalContext {
  cursor?: Variable
  inAtJs: boolean
  runtime: ReturnType<typeof setup>
}

const checkInvalidAtJs = (
  src: string,
  node: Pick<ChildNode, 'error' | 'source'>,
  offset = 0
): void => {
  const mask = (s: string): string => '*'.repeat(s.length)
  const i = src
    .replace(/(?<!\\)(?:'(?:[^\\']+|\\.)*'|"(?:[^\\"]+|\\.)*")/g, mask)
    .indexOf('@js')
  if (i >= 0) throw cssSyntaxError('invalid use of @js', node, offset + i)
}

const coerceToExpr = (
  { expr, code }: UserCode,
  context: CompileContext
): {
  decl: ScriptCode
  expr: ScriptCode
} => {
  const v = new Variable()
  const decls: Script[] = []
  decls.push(CODE()`${context.cursor} = ${new Offset()};`)
  decls.push(CODE()`const ${v} = await (async () => `)
  if (expr) {
    decls.push(CODE()`(${'\n'}${code}${'\n'})`)
  } else {
    decls.push(CODE()`{${'\n'}${code}${'\n'};}`)
  }
  decls.push(CODE()`)();`)
  return { decl: new Code(decls, code), expr: CODE(code)`${v}` }
}

const compileSelector = async (
  rule: Rule,
  context: CompileContext
): Promise<{
  decl: ScriptCode
  expr: ScriptCode
} | null> => {
  if (!rule.selector.includes('@js')) return null
  const decls: Script[] = []
  const strings: string[] = []
  const fragments = new Variable()
  decls.push(CODE()`const ${fragments} = ${strings}.slice(0);`)
  let cut = 0
  let cursor = 0
  let index = 0
  for (const selector of rule.selectors) {
    const start = rule.selector.indexOf(selector, cursor)
    cursor = start + selector.length
    if (selector.startsWith(':@js(') && selector.endsWith(')')) {
      const exp = selector.slice(5, selector.length - 1)
      const offset = start + 5
      const value = coerceToExpr(await userCode(rule, offset, exp), context)
      const loc = { source: value.expr, offset: null }
      decls.push(value.decl)
      decls.push(CODE(loc)`
        ${fragments}[${index + 1}] =
          await ${context.runtime.stringify}(${value.expr});`)
      strings[index] = rule.selector.slice(cut, start)
      cut = cursor
      index += 2
    } else {
      checkInvalidAtJs(selector, rule, start)
    }
  }
  strings[index] = rule.selector.slice(cut)
  return { decl: new Code(decls), expr: CODE()`${fragments}.join('')` }
}

const compileAtJs = async (
  atRule: AtRule,
  context: CompileContext
): Promise<ScriptCode> => {
  const offset = paramsOffset(atRule)
  const prog = atRule.params + atRuleBetween(atRule)
  const stub = atRule.nodes != null ? '({\n})' : ''
  const { expr, code } = await userCode(atRule, offset, prog, stub)
  const script: Script[] = ['\n', code]
  if (expr) script.unshift('yield (')
  if (isNonNullProp(atRule, 'nodes')) {
    const newContext = { ...context, inAtJs: true }
    const childCode = await compileContainer(atRule, newContext)
    const loc = { source: atRule.source, offset: atRuleBodyOffset(atRule) }
    script.push(CODE({ source: loc, offset: null })`(${childCode})`)
  }
  script.push('\n')
  if (expr) script.push(')')
  script.push(';')
  return new Code([
    CODE({ source: code, offset: null })`${context.cursor} = ${new Offset()};`,
    CODE()`yield new ${BeginJs}(${atRule}, ${offset}, ${context.cursor});`,
    new Code(script, { source: code, offset: null }),
    CODE()`yield new ${EndJs}();`
  ])
}

interface BlockContext {
  prologue: Script
  body: Array<ScriptCode | ChildNode>
}

const newBlockContext = (prologue?: Script): BlockContext => {
  return {
    prologue: prologue ?? CODE()``,
    body: []
  }
}

const compileContainerChildren = async (
  container: { nodes: ChildNode[] },
  context: CompileContext
): Promise<BlockContext[]> => {
  let block = newBlockContext()
  const blocks: BlockContext[] = [block]
  const nodes: ChildNode[] = container.nodes
  let lastAtJsBefore: string | undefined
  for (const node of nodes) {
    if (context.globalScope !== node.source?.input.file) {
      context = { ...context, globalScope: node.source?.input.file }
      block = newBlockContext(await loadGlobals(context))
      blocks.push(block)
    }
    if (node.type === 'atrule' && node.name === 'js') {
      block.body.push(await compileAtJs(node, context))
      if (lastAtJsBefore == null) {
        lastAtJsBefore = node.raws.before
      } else if (node.raws.before != null) {
        lastAtJsBefore += node.raws.before.trim()
      }
      delete node.raws.before
      continue
    }
    if (lastAtJsBefore != null) {
      node.raws.before = lastAtJsBefore + (node.raws.before?.trim() ?? '')
      lastAtJsBefore = undefined
    }
    let dest: Variable | undefined
    switch (node.type) {
      case 'atrule': {
        checkInvalidAtJs(node.params, node, paramsOffset(node))
        if (isNonNullProp(node, 'nodes')) {
          const childCode = await compileContainer(node, context)
          if (childCode.content.length > 0) {
            dest = new Variable()
            block.body.push(CODE()`
              const ${dest} = await ${newContainer}(${node}, ${childCode});`)
          }
        }
        break
      }
      case 'rule': {
        const selectorCode = await compileSelector(node, context)
        const childCode = await compileContainer(node, context)
        const v = new Variable()
        const script: Script[] = []
        if (selectorCode != null) script.push(selectorCode.decl)
        if (childCode.content.length > 0) {
          script.push(CODE()`
            const ${v} = await ${newContainer}(${node}, ${childCode});`)
        } else if (selectorCode != null) {
          script.push(CODE()`const ${v} = ${node}.clone();`)
        }
        if (selectorCode != null) {
          script.push(CODE({ source: selectorCode.expr, offset: null })`
            ${v}.selector = ${selectorCode.expr};`)
        }
        if (script.length > 0) {
          block.body.push(new Code(script))
          dest = v
        }
        break
      }
      case 'decl': {
        checkInvalidAtJs(node.prop, node)
        const m = /^@js(?:\s+|(?=["#'()/;[\\\]{}])|$)/.exec(node.value)
        if (m != null) {
          const exp = node.value.slice(m[0].length)
          const offset = valueOffset(node) + m[0].length
          const value = coerceToExpr(await userCode(node, offset, exp), context)
          dest = new Variable()
          block.body.push(value.decl)
          block.body.push(CODE()`const ${dest} = ${node}.clone();`)
          block.body.push(CODE({ source: value.expr, offset: null })`
            ${dest}.value = await ${context.runtime.stringify}(${value.expr});`)
        } else {
          checkInvalidAtJs(node.value, node, valueOffset(node))
        }
        break
      }
      default:
        break
    }
    if (dest == null) {
      block.body.push(node)
    } else if (context.inAtJs) {
      block.body.push(CODE()`yield ${stripRaws}(${dest});`)
    } else {
      block.body.push(CODE()`yield ${dest};`)
    }
  }
  return blocks
}

const compileContainer = async (
  container: (AtRule | Rule | Root) & { nodes: ChildNode[] },
  context: CompileContext
): Promise<ScriptCode> => {
  const cursor = new Variable()
  const newContext = { ...context, cursor }
  const blocks = await compileContainerChildren(container, newContext)
  const hasCode = blocks.some(b => b.body.some(n => n instanceof Code))
  if (!hasCode && !context.inAtJs) return CODE()``
  const loc = { source: container.source, offset: containerOffset(container) }
  const main: Script[] = []
  blocks.forEach(({ prologue, body }) => {
    if (body.length === 0) return
    const dest: Script[] = []
    dest.push(prologue)
    body.forEach(node => {
      if (node instanceof Code) {
        dest.push(node)
      } else if (context.inAtJs) {
        dest.push(CODE()`yield ${stripRaws}(${node}.clone());`)
      } else {
        dest.push(CODE()`yield ${node}.clone();`)
      }
    })
    // use function rather than simple block statement in order to prevent
    // leaks of function-scoped variables
    const iife = CODE()`yield* (async function*() {
      ${new Code(dest)}
    }.call(${container}));`
    main.push(new Code([iife], loc))
  })
  let body = new Code(main)
  if (hasCode) {
    body = CODE()`
      let ${cursor} = 0;
      try {
        ${new Code(main)}
      } catch (e) {
        yield new ${EndJs}(false);
        ${handleError}(e, ${cursor});
      }`
  }
  return CODE()`${context.runtime.interpretMain}(async function*() {
    ${body}
    return ${container}.raws;
  })`
}

export interface CompileResult {
  run: () => Promise<void>
  code: NestedCode
  evalOrigin: string
}

export const compile = async (
  root: Root,
  postcss: Parameters<typeof setup>[0],
  globals: GlobalMaker
): Promise<CompileResult> => {
  const context = {
    runtime: setup(postcss),
    inAtJs: false,
    globals,
    globalEnv: new Map<GlobalScope, GlobalBinds>(),
    globalScope: '' // ensure to call loadGlobals
  }
  const childCode = await compileContainer(root, context)
  let func
  if (childCode.content.length > 0) {
    func = CODE()`return async function() {
      const nodes = await ${newContainer}(${root}, ${childCode});
      ${root}.removeAll();
      ${root}.append(nodes);
    }`
  } else {
    func = CODE()`return async function() {}`
  }
  const { id, code, args } = generate(func)
  type R = (x: unknown[]) => () => Promise<void>
  const { result, origin } = await evalCode<R>(id, code)
  return { run: result(args), code, evalOrigin: origin }
}
