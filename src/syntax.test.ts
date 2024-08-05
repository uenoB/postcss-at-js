import { vi, test, expect, describe, beforeEach, afterEach } from 'vitest'
import postcss from 'postcss'
import { Code } from './script'
import * as s from './syntax'

test('cssSyntaxError without source', () => {
  const node = postcss.decl()
  const error = s.cssSyntaxError('foobar', node, 0)
  expect(error.name).toBe('CssSyntaxError')
  expect(error.message).toBe('<css input>: foobar')
  expect(error.file).toBe(undefined)
  expect(error.line).toBe(undefined)
  expect(error.column).toBe(undefined)
})

test('userCode with acorn', async () => {
  await expect(
    s.userCode(postcss.parse('h1 {}', { from: '1.css' }), 0, 'test"fail')
  ).rejects.toMatchObject({
    name: 'CssSyntaxError',
    reason: 'SyntaxError: Unterminated string constant (2:4)',
    file: expect.stringMatching(/\b1\.css$/) as unknown,
    line: 1,
    column: 'test"'.length
  })
})

describe('without acorn', () => {
  beforeEach(() => {
    vi.doMock('acorn', () => ({}))
  })

  afterEach(() => {
    vi.doUnmock('acorn')
  })

  test('userCode without acorn', async () => {
    await expect(
      s.userCode(postcss.parse('h1 {}', { from: '1.css' }), 0, 'test"fail')
    ).rejects.toMatchObject({
      name: 'CssSyntaxError',
      reason: 'SyntaxError: Invalid or unexpected token',
      file: expect.stringMatching(/\b1\.css$/) as unknown,
      line: 1,
      column: 1
    })
  })

  test('import without acorn', async () => {
    const at = postcss.parse('h1 {}', { from: '1.css' })
    await expect(
      s.userCode(at, 0, 'await import("./foo.js")')
    ).resolves.toMatchObject({
      expr: true,
      code: {
        content: ['await import("./foo.js")']
      }
    })
  })
})

describe('with mocked acorn', () => {
  beforeEach(() => {
    vi.doMock('acorn', () => ({
      parse: () => {
        throw Error('acorn.parse is hooked by mock')
      }
    }))
  })

  afterEach(() => {
    vi.doUnmock('acorn')
  })

  test('userCode with unexpected acorn', async () => {
    await expect(
      s.userCode(postcss.parse('h1 {}', { from: '1.css' }), 0, 'test"fail')
    ).rejects.toMatchObject({
      name: 'CssSyntaxError',
      reason: 'Error: acorn.parse is hooked by mock',
      file: expect.stringMatching(/\b1\.css$/) as unknown,
      line: 1,
      column: 1
    })
  })
})

test('evalCode without location', async () => {
  const code = new Code(['null.fail'])
  await expect(s.evalCode('testId', code)).rejects.toMatchObject({
    message: expect.stringContaining(
      'error occurred in the middle of generated code probably due to bug'
    ) as unknown
  })
})

test('evalCode with source', async () => {
  const root = postcss.parse('h1{}h2{}', { from: '1.css' })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const source = root.nodes[1]!.source!
  const code = new Code(['test"fail'], source)
  await expect(s.evalCode('testId', code)).rejects.toMatchObject({
    name: 'CssSyntaxError',
    reason: 'Invalid or unexpected token',
    file: expect.stringMatching(/\b1\.css$/) as unknown,
    line: 1,
    column: 'h1{}'.length + 'test"'.length
  })
})

test('evalCode without source.start', async () => {
  const root = postcss.parse('h1{}h2{}', { from: '1.css' })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const source = { input: root.nodes[1]!.source!.input }
  const code = new Code(['test"fail'], source)
  await expect(s.evalCode('testId', code)).rejects.toMatchObject({
    name: 'CssSyntaxError',
    reason: 'Invalid or unexpected token',
    file: expect.stringMatching(/\b1\.css$/) as unknown,
    line: 1,
    column: 'test"'.length
  })
})

test('evalCode with throwing non-Error value', async () => {
  const code = new Code(['throw 123'])
  await expect(s.evalCode('testId', code)).rejects.toMatchObject({
    message: expect.stringMatching(/^123\n/) as unknown
  })
})
