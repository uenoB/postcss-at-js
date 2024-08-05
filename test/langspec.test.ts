import { resolve } from 'node:path'
import { vi, test, expect, describe, beforeEach, afterEach } from 'vitest'
import { expectCss, style } from './run'
import * as __mock__ from '__mock__'

test('no @js', async () => {
  await expectCss({
    '1.css': style`
      @namespace "http://www.w3.org/2000/svg";
      h1 {
        color: blue;
      }
      @media print {
        h1 {
          color: black;
        }
      }
    `
  }).resolves.toBe(style`
      @namespace "http://www.w3.org/2000/svg";
      h1 {
        color: blue;
      }
      @media print {
        h1 {
          color: black;
        }
      }
  `)
})

test('statements', async () => {
  await expectCss({
    '1.css': style`
      @js let sum;
      @js for (let i = 0; i < 10; i++) sum += i;
      /* end */
    `
  }).resolves.toBe(style`
      /* end */
  `)
})

test('property value', async () => {
  await expectCss({
    '1.css': style`
      @js const color = 'black';

      h1 {
        color: @js color;
      }
    `
  }).resolves.toBe(style`
      h1 {
        color: black;
      }
  `)
})

test('return in property value', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        color: @js return 'black';
      }
    `
  }).resolves.toBe(style`
      h1 {
        color: black;
      }
  `)
})

test('single pseudo selector', async () => {
  await expectCss({
    '1.css': style`
      :@js('block' + 'quote') {
        color: black;
      }
    `
  }).resolves.toBe(style`
      blockquote {
        color: black;
      }
  `)
})

test('multiple pseudo selector', async () => {
  await expectCss({
    '1.css': style`
      :@js('block' + 'quote'), :@js('a' + ':hover') {
        color: black;
      }
    `
  }).resolves.toBe(style`
      blockquote, a:hover {
        color: black;
      }
  `)
})

test('pseudo selector with others', async () => {
  await expectCss({
    '1.css': style`
      h1, :@js(['h2', 'h3'].join(',')), h4 {
        color: black;
      }
    `
  }).resolves.toBe(style`
      h1, h2,h3, h4 {
        color: black;
      }
  `)
})

test('return in pseudo selector', async () => {
  await expectCss({
    '1.css': style`
      h1, :@js(return 'h2'), h3 {
        color: black;
      }
    `
  }).resolves.toBe(style`
      h1, h2, h3 {
        color: black;
      }
  `)
})

test('inject decl', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ color: 'black' });
      }
    `
  }).resolves.toBe(style`
      h1 {
          color: black;
      }
  `)
})

test('inject rule', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ em: { color: 'black' }});
      }
    `
  }).resolves.toBe(style`
      h1 {
          em {
              color: black;
          }
      }
  `)
})

test('inject atrule with params and block', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ '@media screen': { color: 'black' } });
      }
    `
  }).resolves.toBe(style`
      h1 {
          @media screen {
              color: black;
          }
      }
  `)
})

test('inejct atrule without params but with block', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ '@media': { color: 'black' } });
      }
    `
  }).resolves.toBe(style`
      h1 {
          @media {
              color: black;
          }
      }
  `)
})

test('inejct atrule with params and empty array', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ '@media screen': [] });
      }
    `
  }).resolves.toBe(style`
      h1 {
          @media screen {}
      }
  `)
})

test('inejct atrule with params as single value', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ '@media screen': undefined });
      }
    `
  }).resolves.toBe(style`
      h1 {
          @media screen;
      }
  `)
})

test('inejct atrule without params and block', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ '@media': undefined });
      }
    `
  }).resolves.toBe(style`
      h1 {
          @media;
      }
  `)
})

test('inject block', async () => {
  await expectCss({
    '1.css': style`
      @js const mixin = {
        color: black;
        &:hover {
          color: red;
        }
      }

      h1 {
        @js mixin;
      }
    `
  }).resolves.toBe(style`
      h1 {
          color: black;
          &:hover {
              color: red;
          }
      }
  `)
})

test('inject block twice', async () => {
  await expectCss({
    '1.css': style`
      @js const mixin = {
        color: black;
        &:hover {
          color: red;
        }
      }

      h1 {
        @js mixin;
      }
      h2 {
        @js mixin;
      }
    `
  }).resolves.toBe(style`
      h1 {
          color: black;
          &:hover {
              color: red;
          }
      }
      h2 {
          color: black;
          &:hover {
              color: red;
          }
      }
  `)
})

test('inject array', async () => {
  await expectCss({
    '1.css': style`
      @js const marginsInPixel = n => ({
        margin: \`\${n}px\`,
        padding: \`calc(\${n}px * 2)\`
      });
      @js const colors = (light, dark) => [
        { color: light },
        { '@media (prefers-color-scheme: dark)': { color: dark } }
      ];

      pre {
        @js marginsInPixel(4);
        @js colors('black', 'silver');
      }
    `
  }).resolves.toBe(style`
      pre {
          margin: 4px;
          padding: calc(4px * 2);
          color: black;
          @media (prefers-color-scheme: dark) {
              color: silver;
          }
      }
  `)
})

test('inject nested array', async () => {
  await expectCss({
    '1.css': style`
      @js const f = color => ({
        'main': [[{ h1: [{ color }, [{ width: '100%' }]] }]]
      });
      @js f('black');
    `
  }).resolves.toBe(style`
      main {
          h1 {
              color: black;
              width: 100%;
          }
      }
  `)
})

test('yield in iteration', async () => {
  await expectCss({
    '1.css': style`
      @js for (const i of [1, 2, 3]) yield {
        :@js(\`p:nth-child(\${i})\`) {
          margin: @js (\`\${i}em\`);
        }
      }
    `
  }).resolves.toBe(style`
      p:nth-child(1) {
          margin: 1em;
      }
      p:nth-child(2) {
          margin: 2em;
      }
      p:nth-child(3) {
          margin: 3em;
      }
  `)
})

test('implicit yield', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js ({ margin: '1em' });
        @js yield ({ padding: '1em' });
      }
    `
  }).resolves.toBe(style`
      h1 {
          margin: 1em;
          padding: 1em;
      }
  `)
})

test('declaration with meaningless prefix', async () => {
  await expectCss({
    '1.css': style`
      @js var _ = exports.fonts = ({ text: ['times', 'serif'] });
      @js if(1) exports.fonts = ({ text: ['times', 'serif'] });
      /* end */
    `
  }).resolves.toBe(style`
      /* end */
  `)
})

test('expression ending with undefined', async () => {
  await expectCss({
    '1.css': style`
      @js exports.fonts = ({ text: ['times', 'serif'] }), void 0;
      /* end */
    `
  }).resolves.toBe(style`
      /* end */
  `)
})

test('inject function', async () => {
  await expectCss({
    '1.css': style`
      @js const divmod = (x, y) => block => {
        @js block(Math.floor(x / y), x % y);
      }

      table {
        @js yield divmod(42, 5), (div, mod) => {
          padding: @js (\`\${div}px \${mod}px\`);
        }
      }
    `
  }).resolves.toBe(style`
      table {
          padding: 8px 2px;
      }
  `)
})

test('inject function with optional parameter', async () => {
  await expectCss({
    '1.css': style`
      @js const atRule = (name, params) => block =>
        ({ [\`@\${name} \${params}\`]: block });

      @js atRule('media', 'print') {
        font-size: 10.5pt;
      }
      @js atRule('namespace', '"http://www.w3.org/2000/svg"');
    `
  }).resolves.toBe(style`
      @media print {
          font-size: 10.5pt;
      }
      @namespace "http://www.w3.org/2000/svg";
  `)
})

test('return', async () => {
  await expectCss({
    '1.css': style`
      samp {
        border: thin solid navy;
        @js ({ color: 'blue' });
        @js return;
        background-color: white;
        @js ({ margin: '4px' });
        padding: @js '12px';
      }
      h1 {
        color: black;
      }
    `
  }).resolves.toBe(style`
      samp {
        border: thin solid navy;
        color: blue;
      }
      h1 {
        color: black;
      }
  `)
})

test('evaluation order', async () => {
  __mock__.fn.mockReset()
  await expectCss({
    '1.css': style`
      @js const __mock__ = await import('__mock__');
      @js __mock__.fn(0);
      h1 {
        @js __mock__.fn(1);
        color: @js __mock__.fn(2), 'black';
        h1, :@js((__mock__.fn(3), 'h2')), h3, :@js((__mock__.fn(4), 'h4')), h5 {
          @js __mock__.fn(5);
        }
        @js __mock__.fn(6);
      }
      @js (() => { __mock__.fn(7) }) {
        @js __mock__.fn('never be called since this is in an AsyncGenerator')
      }
      @js const all = (async x => { for await (let _ of x) {} });
      @js await (async x => { __mock__.fn(8); await all(x); __mock__.fn(10) }) {
        @js __mock__.fn(9);
      }
      @js const f = () => {
        @js __mock__.fn(12);
      }
      @js f(), __mock__.fn(11), await all(f()), __mock__.fn(13);
    `
  }).resolves.toBe(style`
      h1 {
        color: black;
        h1, h2, h3, h4, h5 {
        }
      }
  `)
  expect(__mock__.fn.mock.calls).toEqual(Array.from(Array(14), (_, i) => [i]))
})

test('module', async () => {
  await expectCss({
    '1.css': style`
      @js const _ = exports.ratio = '80%';
    `,
    '2.css': style`
      @js const def = require('./1.css');

      main {
        width: @js def.ratio;
      }
    `
  }).resolves.toBe(style`
      main {
        width: 80%;
      }
  `)
})

describe('with foo.js', () => {
  const fooJs = resolve('foo.js')

  beforeEach(() => {
    vi.doMock(fooJs, () => ({
      default: { color: 'black' }
    }))
  })

  afterEach(() => {
    vi.doUnmock(fooJs)
  })

  test('import', async () => {
    await expectCss({
      '1.css': style`
        @js const p = await import('./foo.js');

        main {
          @js p.default;
        }
      `
    }).resolves.toBe(style`
        main {
            color: black;
        }
    `)
  })
})

test('exception in block', async () => {
  await expectCss({
    '1.css': style`
      @js const f = {
        background-color: yellow;
        @js throw Error('black');
        font-size: 16em;
      }
      h1 {
        @js (async function* () {
          try {
            for await (const i of f) yield i;
          } catch(error) {
            yield { 'color': error.message }
          }
        })();
      }
    `
  }).resolves.toBe(style`
      h1 {
          background-color: yellow;
          color: black;
      }
  `)
})

test('preserve IE hack', async () => {
  await expectCss({
    '1.css': style`
      h1 {
        @js void 0;
        *color: black;
      }
    `
  }).resolves.toBe(style`
      h1 {
        *color: black;
      }
  `)
})
