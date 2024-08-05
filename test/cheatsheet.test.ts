import { test } from 'vitest'
import { expectCss, style } from './run'

test('Define a variable', async () => {
  await expectCss({
    '1.css': style`
      @js const textSize = (\`\${14 + 2}pt\`);
      @js const widthLimit = 640;
      @js const codeClass = '.code';
      @js const location = 'background';
    `
  }).resolves.toBe(style`
  `)
})

test('Substitute a variable in a property value', async () => {
  await expectCss({
    '1.css': style`
      @js const textSize = (\`\${14 + 2}pt\`);

      h1 {
        font-size: @js (\`calc(\${textSize} * 2)\`);
      }
    `
  }).resolves.toBe(style`
      h1 {
        font-size: calc(16pt * 2);
      }
  `)
})

test('Substitute a variable in a property name', async () => {
  await expectCss({
    '1.css': style`
      @js const location = 'background';

      h1 {
        @js ({ [\`\${location}-color\`]: 'yellow' });
      }
    `
  }).resolves.toBe(style`
      h1 {
          background-color: yellow;
      }
  `)
})

test('Substitute a variable in a selector', async () => {
  await expectCss({
    '1.css': style`
      @js const codeClass = '.code';

      :@js(\`pre\${codeClass}\`) {
        font-family: monospace;
      }
    `
  }).resolves.toBe(style`
      pre.code {
        font-family: monospace;
      }
  `)
})

test('Substitute a variable in an at-rule', async () => {
  await expectCss({
    '1.css': style`
      @js const widthLimit = 640;

      @js const atRule = (name, params) => rules =>
        ({ [\`@\${name} \${params}\`]: rules });
      @js atRule('media', \`screen and (max-width: \${widthLimit}px)\`) {
        display: none;
      }
    `
  }).resolves.toBe(style`
      @media screen and (max-width: 640px) {
          display: none;
      }
  `)
})

test('Define a mixin', async () => {
  await expectCss({
    '1.css': style`
      @js const makeBlack = {
        color: black;
      }
    `
  }).resolves.toBe(style`
  `)
})

test('Include a mixin', async () => {
  await expectCss({
    '1.css': style`
      @js const makeBlack = {
        color: black;
      }

      p {
        @js makeBlack;
      }
    `
  }).resolves.toBe(style`
      p {
          color: black;
      }
  `)
})

test('Define a mixin with parameters', async () => {
  await expectCss({
    '1.css': style`
      @js const colorize = (fg, bg) => {
        color: @js fg;
        background-color: @js bg;
      }
    `
  }).resolves.toBe(style`
  `)
})

test('Include a mixin with arguments', async () => {
  await expectCss({
    '1.css': style`
      @js const colorize = (fg, bg) => {
        color: @js fg;
        background-color: @js bg;
      }

      strong {
        @js colorize('red', 'yellow');
      }
    `
  }).resolves.toBe(style`
      strong {
          color: red;
          background-color: yellow;
      }
  `)
})

test('Define a mixin with a hole', async () => {
  await expectCss({
    '1.css': style`
      @js const mediaDark = content => {
        @media screen and (prefers-color-scheme: dark) {
          @js content;
        }
      }
    `
  }).resolves.toBe(style`
  `)
})

test('Include a mixin with a hole', async () => {
  await expectCss({
    '1.css': style`
      @js const mediaDark = content => {
        @media screen and (prefers-color-scheme: dark) {
          @js content;
        }
      }

      main {
        color: black;
        @js mediaDark {
          color: silver;
        }
      }
    `
  }).resolves.toBe(style`
      main {
        color: black;
        @media screen and (prefers-color-scheme: dark) {
          color: silver;
        }
      }
  `)
})

test('Define a higher-order mixin with parameters', async () => {
  await expectCss({
    '1.css': style`
      @js const mediaDark = content => {
        @media screen and (prefers-color-scheme: dark) {
          @js content;
        }
      }

      @js const selectColor = (c1, c2, c3, c4) => content => {
        @js content(c1, c3);
        @js mediaDark {
          @js content(c2, c4);
        }
      }
    `
  }).resolves.toBe(style`
  `)
})

test('Include a higher-order mixin', async () => {
  await expectCss({
    '1.css': style`
      @js const mediaDark = content => {
        @media screen and (prefers-color-scheme: dark) {
          @js content;
        }
      }

      @js const selectColor = (c1, c2, c3, c4) => content => {
        @js content(c1, c3);
        @js mediaDark {
          @js content(c2, c4);
        }
      }

      nav {
        @js yield selectColor('blue', 'green', 'white', 'black'), (c1, c2) => {
          color: @js c1;
          background-color: @js c2;
        }
      }
    `
  }).resolves.toBe(style`
      nav {
          color: blue;
          background-color: white;
          @media screen and (prefers-color-scheme: dark) {
              color: green;
              background-color: black;
          }
      }
  `)
})

test('Conditionals', async () => {
  await expectCss({
    '1.css': style`
      @js const widthLimit = 640;

      .box {
        @js if (widthLimit > 600) yield {
          max-height: 800px;
        }
        @js if (widthLimit <= 600) yield {
          height: 500px;
        }
      }
    `
  }).resolves.toBe(style`
      .box {
          max-height: 800px;
      }
  `)
})

test('Iteration', async () => {
  await expectCss({
    '1.css': style`
      @js for (const i of [1, 2, 3]) yield {
        :@js(\`p:nth-child(\${i})\`) {
          font-size: @js (\`calc(10px * \${i})\`);
        }
      }
    `
  }).resolves.toBe(style`
      p:nth-child(1) {
          font-size: calc(10px * 1);
      }
      p:nth-child(2) {
          font-size: calc(10px * 2);
      }
      p:nth-child(3) {
          font-size: calc(10px * 3);
      }
  `)
})

test('Export variables for other CSS files', async () => {
  await expectCss({
    '1.css': style`
      @js const textSize = (\`\${14 + 2}pt\`);
      @js const widthLimit = 640;

      @js var _ = exports.textSize = textSize;
      @js var _ = exports.widthLimit = widthLimit;
    `
  }).resolves.toBe(style`
  `)
})

test('Import variables from other CSS files', async () => {
  await expectCss({
    '1.css': style`
      @js const textSize = (\`\${14 + 2}pt\`);
      @js const widthLimit = 640;

      @js var _ = exports.textSize = textSize;
      @js var _ = exports.widthLimit = widthLimit;
    `,
    '2.css': style`
      @js const [{ textSize, widthLimit }] = [require('./1.css')];

      h1 {
        font-size: @js textSize;
        max-width: @js (\`\${widthLimit}px\`);
      }
    `
  }).resolves.toBe(style`
      h1 {
        font-size: 16pt;
        max-width: 640px;
      }
  `)
})
