import { test, expect } from 'vitest'
import postcss from 'postcss'
import * as s from './script'

test('Code.highlight', () => {
  expect(new s.Code('testcode end').highlight(4)).toEqual(
    '\x1b[32mtest\x1b[1m\x1b[31m\x1b[7mcode\x1b[m\x1b[1m\x1b[31m end\x1b[m'
  )
})

test('Code with sparse array', () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const source = postcss.parse('h1 {}', { from: '1.css' }).source!
  const a: string[] = []
  a[0] = 'test'
  a[2] = 'code'
  const code = new s.Code(a, source)
  const smap = new s.SourceMap(code)
  expect(code.toString()).toBe('testcode')
  expect(smap.find(4)).toEqual({
    input: source.input,
    start: { offset: 4, line: 1, column: 5 },
    end: source.end
  })
})

test('SourceMap.find with fromOffset returned null', () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const source = postcss.parse('h1\n{}', { from: '1.css' }).source!
  source.input.fromOffset = () => null
  const code = new s.Code(['testcode'], source)
  const smap = new s.SourceMap(code)
  expect(code.toString()).toBe('testcode')
  expect(smap.find(7)).toEqual({
    input: source.input,
    start: { offset: 0, line: 1, column: 1 },
    end: source.end
  })
})

test('generate with basic values', () => {
  type T = string | boolean | number | null | undefined
  const src = s.CODE()`testfn(${1.2},${true},${false},${null},${undefined});`
  const { code, args } = s.generate<T>(src)
  expect(code.toString()).toMatch('testfn(1.2,true,false,null,void 0);')
  expect(args).toStrictEqual([])
})
