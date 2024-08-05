import { type Assertion, vi, expect } from 'vitest'
import postcss from 'postcss'
import type { FilePosition } from 'postcss'
import atJs from '../src/index'

export const style = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): string => {
  const raws = strings.raw.slice(0)
  const indent = /^(?:\s(?!^))+(?=\S)/m.exec(raws[0] ?? '')?.[0] ?? ''
  const re = new RegExp(String.raw`^${indent}|(?:\s(?!^))+$`, 'mg')
  if (raws[0] != null) raws[0] = raws[0].replace(/(?:\s(?!^))*\s^/my, '')
  const last = raws[raws.length - 1]
  if (last != null) raws[raws.length - 1] = last.trimRight()
  const ret = raws.flatMap((s, i) => [
    s.replace(re, '').replace(/\\(`|\$)/g, '$1'),
    i < values.length ? String(values[i]) : ''
  ])
  return ret.join('')
}

const insert = <X>(array: X[], index: number, item: X): X[] =>
  array.slice(0, index).concat([item]).concat(array.slice(index))

const formatFilePosition = (pos: FilePosition | undefined): string => {
  const lines: Array<readonly [string | number, string]> | undefined =
    pos?.source?.split(/^/m).map((x, i) => [i + 1, x] as const)
  const width = String(lines?.length ?? 0).length
  const line = pos?.line ?? 0
  const column = pos?.column ?? 1
  return insert(lines ?? [], line, ['', ' '.repeat(column - 1) + '^\n'])
    .map(([i, x]) => `${String(i).padStart(width)} | ${x}`.trimRight())
    .join('\n')
}

export const run = async (files: Record<string, string>): Promise<string> => {
  const roots = Object.entries(files)
    .filter(([k]) => k.endsWith('.css'))
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => postcss.parse(v, { from: k }))
  const root = roots[0]?.clone() ?? postcss.root()
  root.removeAll()
  root.append(roots.flatMap(i => i.nodes))
  try {
    const result = await postcss([atJs]).process(root, { from: 'testrun' })
    return result.css
  } catch (error) {
    if (error instanceof postcss.CssSyntaxError) {
      error.message += '\n' + formatFilePosition(error.input) + '\n'
    }
    throw error
  }
}

export const expectCss = (files: Record<string, string>): Assertion<string> =>
  expect(run(files))

// for module feature test
vi.mock('__mock__', () => ({ fn: vi.fn() }))
