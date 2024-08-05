import { test, expect } from 'vitest'
import { style, expectCss } from './run'
import * as __mock__ from '__mock__'

const escape = (s: string): string => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')

const errorMatch = (
  filename: string,
  line: number,
  column: number,
  reason?: RegExp
): Record<string, unknown> => {
  const obj: Record<string, unknown> = {}
  obj['name'] = 'CssSyntaxError'
  obj['plugin'] = 'postcss-at-js'
  obj['line'] = line
  obj['column'] = column
  obj['file'] = expect.stringMatching(RegExp(`\\b${escape(filename)}$`))
  const e = '\\berror occurred in the middle of generated code\\b'
  if (reason == null) {
    obj['reason'] = expect.not.stringMatching(RegExp(e))
  } else {
    const s = `${reason.source}(?![\\S\\s]*${e})(?<!${e}[\\S\\s]*)`
    obj['reason'] = expect.stringMatching(RegExp(s, reason.flags))
  }
  return obj
}

const unterminatedTemplate = /Unterminated template/
const isNotDefined = (name: string): RegExp =>
  RegExp(`${escape(name)} is not defined`)
const cannotReadNull = (name: string): RegExp =>
  RegExp(`Cannot read properties of null \\(reading '${escape(name)}'\\)`)
const unexpectedKeyword = /Unexpected strict mode reserved word/
const unexpectedValue = (obj: string): RegExp =>
  RegExp(`attempt to inject an invalid value: ${escape(obj)}`)
const invalidAtJs = /invalid use of @js/
const failedToDeterminePos = /\(failed to determine where the error happened\)/

test('unclosed template literal in @js', async () => {
  const c = '  @js func(`f'.length
  await expectCss({
    '1.css': style`
      h1 {
        @js func(\`fail);
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, unterminatedTemplate))
})

test('undefined variable in @js', async () => {
  const c = '  @js Boolean(f'.length
  await expectCss({
    '1.css': style`
      h1 {
        @js Boolean(fail);
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, isNotDefined('fail')))
})

test('undefined variable in toplevel of @js', async () => {
  // i'm not sure why but here is where the error occurs
  const c = '  @js +'.length
  await expectCss({
    '1.css': style`
      h1 {
        @js ++fail;
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, isNotDefined('fail')))
})

test('undefined property in @js', async () => {
  const c = '  @js null.f'.length
  await expectCss({
    '1.css': style`
      h1 {
        @js null.fail;
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, cannotReadNull('fail')))
})

test('unclosed template literal in property value', async () => {
  const c = '  color: @js func(`f'.length
  await expectCss({
    '1.css': style`
      h1 {
        color: @js func(\`fail);
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, unterminatedTemplate))
})

test('undefined variable in property value', async () => {
  const c = '  color: @js Boolean(f'.length
  await expectCss({
    '1.css': style`
      h1 {
        color: @js Boolean(fail);
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, isNotDefined('fail')))
})

test('undefined variable in toplevel of property value', async () => {
  const c = '  color: @js ++f'.length
  await expectCss({
    '1.css': style`
      h1 {
        color: @js ++fail;
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, isNotDefined('fail')))
})

test('undefined property in property value', async () => {
  const c = '  color: @js null.f'.length
  await expectCss({
    '1.css': style`
      h1 {
        color: @js null.fail;
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, cannotReadNull('fail')))
})

test('unclosed template literal in pseudo selector', async () => {
  const c = ':@js(func(`f'.length
  await expectCss({
    '1.css': style`
      h1,
      :@js(func(\`fail)) {
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, unterminatedTemplate))
})

test('undefined variable in pseudo selector', async () => {
  const c = ':@js(Boolean(f'.length
  await expectCss({
    '1.css': style`
      h1,
      :@js(Boolean(fail)) {
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, isNotDefined('fail')))
})

test('undefined variable in toplevel of pseudo selector', async () => {
  const c = ':@js(++f'.length
  await expectCss({
    '1.css': style`
      h1,
      :@js(++fail) {
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, isNotDefined('fail')))
})

test('undefined property in pseudo selector', async () => {
  const c = ':@js(null.f'.length
  await expectCss({
    '1.css': style`
      h1,
      :@js(null.fail) {
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, cannotReadNull('fail')))
})

test('yield in property value', async () => {
  const c = '  color: @js y'.length
  await expectCss({
    '1.css': style`
      h1 {
        color: @js yield ({ width: '100%' }), 'black';
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, unexpectedKeyword))
})

test('yield in pseudo selector', async () => {
  const c = ':@js(y'.length
  await expectCss({
    '1.css': style`
      h1,
      :@js(yield ({ p: { color: 'black' } }), 'h2') {
        color: red;
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, unexpectedKeyword))
})

test('invalid occurrance of @js in value property', async () => {
  const c = 'h1:@'.length
  await expectCss({
    '1.css': style`
      h1:@js('first-child') {
        color: red;
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 1, c, invalidAtJs))
})

test('invalid occurrance of @js in pseudo selector', async () => {
  const c = '  color: red @'.length
  await expectCss({
    '1.css': style`
      h1 {
        color: red @js(1);
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, invalidAtJs))
})

test('injecting non-stringifiable value to property value', async () => {
  const c = '  color: @js n'.length
  await expectCss({
    '1.css': style`
      h1 {
        color: @js null;
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, unexpectedValue('null')))
})

test('injecting non-stringifiable value to pseudo selector', async () => {
  const c = ':@js(n'.length
  await expectCss({
    '1.css': style`
      h1,
      :@js(null) {
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 2, c, unexpectedValue('null')))
})

test('injecting non-stringifiable value to at-rule', async () => {
  const c = '@js ('.length
  await expectCss({
    '1.css': style`
      @js ({ '@media': null });
    `
  }).rejects.toMatchObject(errorMatch('1.css', 1, c, unexpectedValue('null')))
})

test('injecting non-stringifiable value to declaration', async () => {
  const c = '@js ('.length
  await expectCss({
    '1.css': style`
      @js ({ 'color': null });
    `
  }).rejects.toMatchObject(errorMatch('1.css', 1, c, unexpectedValue('null')))
})

test('injecting non-stringifiable value to rule', async () => {
  const c = '@js ('.length
  await expectCss({
    '1.css': style`
      @js ({ 'h1': [null] });
    `
  }).rejects.toMatchObject(errorMatch('1.css', 1, c, unexpectedValue('null')))
})

test('injecting value without toString', async () => {
  const c = '  color: @js n'.length
  await expectCss({
    '1.css': style`
      @js const F = (function () {});
      h1 {
        color: @js new F();
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 3, c, unexpectedValue('F {}')))
})

test('injecting non-interpretable value to top-level', async () => {
  const c = '@js n'.length
  await expectCss({
    '1.css': style`
      @js null;
    `
  }).rejects.toMatchObject(errorMatch('1.css', 1, c, unexpectedValue('null')))
})

test('abort injected function with optional parameter', async () => {
  __mock__.fn.mockReset()
  const c = '    fail(E'.length
  await expectCss({
    '1.css': style`
      @js const __mock__ = await import('__mock__');
      @js const fail = (x => { throw x; });
      @js yield (x => {
            __mock__.fn(x);
            return () => {
              __mock__.fn('this never be called');
              return { h2: { color: x } };
            }
          }),
          yield 'black',
          fail(Error('testfail')),
          yield 0;
    `
  }).rejects.toMatchObject(errorMatch('1.css', 11, c, /testfail/))
  expect(__mock__.fn.mock.calls).toEqual([['black']])
})

test('uncaught non-object exception', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js throw 'testfail';
      }
    `
  }).rejects.toMatchObject(errorMatch('1.css', 1, 1, failedToDeterminePos))
})
