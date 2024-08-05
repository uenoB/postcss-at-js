# PostCSS @js

PostCSS @js is a [PostCSS] plugin that allows you to embed JavaScript
code in your CSS files for preprocessing.

## Installation

```bash
npm install postcss-at-js
```

To enable accurate syntax errors, install [Acorn] at your option.

```bash
npm install acorn
```

## Usage

Put PostCSS @js into your `use` chain.

```js
const postcss = require('postcss')

function process(css) {
  return postcss()
    .use(require('postcss-import')())
    .use(require('postcss-at-js')())
    .use(require('postcss-calc')())
    .process(css)
    .css
}
```

In combination with [postcss-import], PostCSS @js enables its
module feature.
[PostCSS Calc] supplements arithmetic calculation,
which PostCSS @js lacks intentionally.

Under this configuration, this input

```css
@js const mixin = {
  color: black;
}

h1 {
  @js mixin;
}
```

is transformed into the following output:


```css
h1 {
  color: black
}
```

## Language Details

Put `@js` followed by JavaScript code at anywhere in CSS.
All the embedded codes are evaluated to produce the resulting CSS.
Similar to the function body of JavaScript, you can write any
declaration, statement, and expression in `@js`. For example:

```css
@js const fs = require('node:fs');
@js let sum;
@js for (let i = 0; i < 10; i++) sum += i;
```

### Usage of Braces

These JavaScript codes are embedded in CSS.
This means that each `@js`s are parsed by PostCSS at first and then
read by the JavaScript interpreter.
The most annoying (but interesting) conflict between the syntax of CSS
and JavaScript is in the use of braces (`{` ... `}`).
If braces occurs in `@js` without somehow escaping, they are consumed
as CSS blocks by PostCSS, not a part of JavaScript, and cause CSS
syntax errors in most cases.
To avoid these errors, surround such braces with parentheses (`(` ... `)`)
or brackets (`[` ... `]`).
The following are bad examples, which are interpreted unexpectedly by
PostCSS and cause CSS syntax errors:

```css
@js const obj = { hello: 'World', enjoy: 'it' };     /* ❌ syntax error */
@js const func = n => { return n + 1 };              /* ❌ syntax error */
@js const { createHash } = require('node:crypto');   /* ❌ syntax error */
@js if (x > 5) { console.log(x) } else { x++ };      /* ❌ syntax error */
```

To avoid such errors, put seemingly unnecessary parentheses and
brackets around braces as follows:

```css
@js const obj = ({ hello: 'World', enjoy: 'it' });
@js const func = (n => { return n + 1 });
@js const [{ createHash }] = [require('node:crypto')];
@js (function (){ if (x > 5) { console.log(x) } else { x++ } })();
```

These parentheses and brackets are also parts of JavaScript; so,
you need to choose one in accordance with context without changing
the semantics of your code.
The following is a typical strategy:

1. If braces occurs in the right-hand side of assignment `=`,
   parentheses (`(` ... `)`) are preferable.
   You can freely enclose any sub-expression with parentheses without
   any modification of its semantics.
2. If braces occurs in the left-hand side of assignment `=`,
   put brackets (`[` ... `]`) in both side of `=`.
   Braces in this context is a part of binding patterns, in which
   parentheses are not allowed to appear.
   A pair of brackets occurring here is accepted as an array binding
   pattern.
   To keep the original semantics of your code, you have to put brackets
   in both side of `=`.
3. For braces constituting a block statement, put the entire statement
   in IIFE (immediately invoked function expression).

Braces in `'` or `"` string literals are safe, however, those in
template literals (`` `...` ``) are not safe.
In the CSS syntax, a back-quote (`` ` ``) is solely regarded as a
separate delimiter.
To avoid confusion, it is recommended to put parentheses around
every template literals in `@js` like the following:

```css
const size = 12;
const fontSize = (`${size}pt`);
```

### CSS Blocks

Bare braces are only allowed at the end of `@js` rule, where is the
only right place for a CSS block attached to an at-rule.
The group attached to a `@js` is interpreted as a parenthesized
JavaScript expression denoting an [AsyncIterable] of PostCSS nodes.
For example:

```css
@js const blackWhite = {
  color: black;
  background-color: white;
  &:hover {
    color: red;
  }
}
```

This binds a constant `blackWhite` to a sequence of three CSS
nodes: `color: black`, `background-color: white`, and `&:hover` rule.
Note that

```css
@js const blackColor = { color: black }
```

is not a JavaScript object literal, but CSS group consisting of one
property declaration `color: black`.
Hence, the value of `blackColor` is not a plain object, but an
AsyncIterable of PostCSS nodes.

After capturing a block in a JavaScript variable, you can inject it
into CSS by writing an `@js` expression evaluating to the content
to be injected.
For example, the above `blackWhite` can be injected in a CSS rule
as follows:

```css
blockquote {
  font-size: 14pt;
  @js blackWhite;
}
```

This results in the following:

```css
blockquote {
  font-size: 14pt;
  color: black;
  background-color: white;
  &:hover {
    color: red;
  }
}
```

To expand the nested rules, use [PostCSS Nesting] after PostCSS @js.

Every CSS block of `@js` is seen as a single parenthesized expression
in JavaScript.
By exploiting this fact, you can pass a block to a function by
putting the name of the function just before the block like this:

```css
@js const mixinWithBlock = content => {
  margin: 1em;
  @js content;
  border: thin solid black;
}

h2 {
  @js mixinWithBlock {
    padding: 1em;
  }
}
```

The `@js mixinWithBlock { padding: 1em; }` line is interpreted by
the JavaScript interpreter as an expression `mixinWithBlock ( ... )`,
which is a function call expression with an argument.
The `mixinWithBlock` function receives a block `{ padding: 1em; }`
as `content`, inject the block in its body, and returns the resulting
body as an AsyncIterable.
At the call site of `mixinWithblock`, the returned block is injected
to the place of this `@js` rule.
Consequently, we have the following result:

```css
h2 {
  margin: 1em;
  padding: 1em;
  border: thin solid block;
}
```

### Injecting Objects into CSS

Several particular forms of JavaScript objects can be injected as CSS
if they look like a set or sequence of CSS constructs.
For example:

```css
@js const marginsInPixel = n => ({
  margin: `${n}px`,
  padding: `calc(${n}px * 2)`
})
@js const colors = (light, dark) => [
  { color: light },
  { '@media': ['(prefers-color-scheme: dark)', { color: dark }] }
];

pre {
  @js marginsInPixel(4);
  @js colors('black', 'silver');
}
```

This results in the following:

```css
pre {
  margin: 4px;
  padding: calc(4px * 2);
  color: black;
  @media (prefers-color-scheme: dark) { color: silver };
}
```

If the value of `@js` expression is neither acceptable nor
`undefined`, PostCSS @js reports an error to correct your mistake.
Injecting `undefined` is simply ignored.

### `@js` property value

If the value of a CSS property declaration begins with `@js`,
subsequent content in the value is interpreted as a JavaScript
expression.
After evaluation, the value is replaced with the evaluation result.
For example:

```css
@js const pixels = 5;

code {
  border-width: @js (`${pixels}px`);
}
```

This is actually a shorthand of object injection.
The following is equivalent to the above:

```css
@js const pixels = 5;

code {
  @js ({ 'border-width': `${pixels}px` });
}

```

An `@js` property value is evaluated as if it is enclosed with
`await (async () => ... )()`.
Therefore, the `yield` keyword in a `@js` property value causes an
syntax error.
If an `@js` property value has statements instead of an expression,
you must return the value to be injected in CSS property value.
The following is equivalent to the above one:

```css
code {
  border-width: @js return pixels + 'px';
}
```

### `:@js` pseudo selector

The `:@js` pseudo selector is available to inject a computed value
into a selector list.
If a selector is of the form `:@js( ... )`, the expression inside the
selector is interpreted as a JavaScript expression and the selector
is entirely replaced with the evaluation result.
For example:

```css
@js const seven = 7;

:@js(`li:nth-child(${seven})`) {
  background-color: yellow;
}
```

Each `:@js` pseudo selector must be used solely in a selector.
Any occurance of `@js` in a selector list in any other form is prohibited.
Any of the following are bad examples:

```css
li:@js(`nth-child($seven)`) { ... }           /* ❌ syntax error */
:@js(`li:nth-child($seven)`):hover { ... }    /* ❌ syntax error */
.@js { ... }                                  /* ❌ syntax error */
```

Similarly to `@js` property values, `:@js` pseudo selector is a
shorthand of object injection.
The following is equivalent to the above:

```css
@js (x => { `li:nth-child(${seven})`: x }) {
  background-color: yellow;
}
```

Also similarly to `@js` property values, `:@js` pseudo selector is
evaluated as if it is enclosed with `await (async () => ... )()`.
If an `:@js` pseudo selector has statements instead of an expression,
you must return the value to be injected in CSS property value.
The following is equivalent to the above one:

```css
:@js(return `li:nth-child(${seven})`) {
  background-color: yellow;
}
```

### `yield`

By using the `yield` construct, you can inject multiple values into
a single `@js`.  The values `yield`ed during execution of a `@js`
are injected into the place of the `@js` in the same order as evaluation.
This allows you iterative injection as seen in the following:

```css
@js for (const i of [1, 2, 3]) yield {
  :@js(`p:nth-child(${i})`) {
    margin: @js (`${i}em`);
  }
}
```

The result is as follows:

```css
p:nth-child(1) {
  margin: 1em;
}
p:nth-child(2) {
  margin: 2em;
}
p:nth-child(3) {
  margin: 3em;
}
```

Without `yield` after `for ( ... )`, nothing appears in the result.
The block is certainly evaluated to a value three times but
simply discarded since no operation is performed for those values
in the loop body.

Actually, each `@js` expression has an implicit outermost `yield`.
This is the reason why the value of `@js` expression is automatically
injected.
Consider the following two `@js`s, which are semantically equivalent:

```css
h1 {
  @js ({ margin: '1em' });
  @js yield ({ margin: '1em' });
}
```

Since both of these `@js`s are expressions, their values are implicitly
`yield`ed.
In the first `@js`, the value of the expression is `yield`ed by the
implicit outermost `yield` and therefore `yield` is performed only
once.
In the second one, `yield` is performed twice: it yields the
`{ margin: '1em' }` object at first and then yields `undefined`, which
is the value of the expression `yield ({ margin: '1em' })`.
Since `undefined` is ignored, the results of the two expressions are
the same.

To avoid the implicit `yield`, transform an expression into a statement
by putting a meaningless prefix, like the following:

```css
@js var _ = exports.fonts = ({ text: ['times', 'serif'] });
@js if(1) exports.fonts = ({ text: ['times', 'serif'] });
```

Since they are statements, no implicit `yield` happens.
Without such prefixes, the value of each expressions is implicitly
`yield`ed and hence causes an error because `{ text: ['times', 'serif'] }`
is not in an acceptable form as CSS.

Another way to avoid the implicit `yield` is to add `, void 0` to
the end of the expression.
Since `void 0` evaluates to `undefined` and `undefined` is ignored
as described above, this modification spoils the implicit outermost
`yield`.
The following is an example:

```css
@js exports.fonts = ({ text: ['times', 'serif'] }), void 0;
```

### Function Injection

If a function is `yield`ed, it will be called with the next `yield`ed
value as an argument and then its return value is injected to CSS.
This is convenient to define a mixin with a callback similarly to
[Sass]'s `@mixin ... using` feature.
For example:

```css
@const divmod = (x, y) => block => {
  @js block(Math.floor(x / y), x % y);
}

table {
  @js yield divmod(42, 5), (div, mod) => {
     padding: @js (`${div}px ${mod}px`);
  }
}
```

The following happens in the above code:

1. `divmod` is defined as a curried function, which takes two numbers
   and returns a function of the form `block => { ... }`.
2. `divmod(42, 5)` evaluates to the function.
3. `yield divmod(42, 5)` yields the function.
   The yielded function is scheduled to be called with the next yielded
   value.
4. By the semantics of comma expression in JavaScript, the entire
   expression evaluates to the function `(div, mod) => { ... }`.
5. By the implicit outermost `yield`, the function is yielded.
6. Since a function call is pending, the second function is given to
   the first function as its first `block` argument.
7. The function returns an AsyncIterable representing the computed body.
8. The returned AsyncIterable is injected into CSS.

The final result is given below:

```css
table {
  padding: 8px 2px;
}
```

If a function has been `yield`ed in a `@js` but no subsequent `yield`
occurs in the same `@js`, the function is called with no argument.
If another function is returned from this call, the returned function
is called again with no argument.
This is repeated until a non-function value is obtained.
Then, the returned value is injected as if it is `yield`ed.

This behavior is useful for functions that takes a block optionally.
For example, the following is the function creating an at-rule:

```css
@js const atRule = (name, params) => block =>
  ({ [`@${name} ${params}`]: block });
```

This function creates an at-rule with or without a block depending on
whether or not the optional `block` argument is given.
By calling this function as follows,

```css
@js atRule('media', 'print') {
  font-size: 10.5pt;
}
@js atRule('namespace', '"http://www.w3.org/2000/svg"');
```

we obtain the following:

```css
@media print {
  font-size: 10.5pt;
}
@namespace "http://www.w3.org/2000/svg";
```

### `return`

If a `return` statement is executed in a `@js`, it aborts the
evaluation of current block and all the subsequent content in the same
block, including ones other than `@js`, are discarded.
For example:

```css
samp {
  border: thin solid navy;
  @js ({ color: 'blue' });
  @js return;
  background-color: white;
  @js ({ margin: '4px' });
  padding: @js '12px';
}
```

This results in the following:

```css
samp {
  border: thin solid navy;
  color: blue;
}
```

### `this`

The value of `this` in a `@js` is a PostCSS node in which the `@js` is
included.
Through `this`, you can compute CSS contents in each `@js` depending
on where the `@js` is.

This is a very advanced feature.
Use it at your own risk.

### `postcss`

A global variable `postcss` holds the Helpers object that PostCSS
passes to this plugin.
See [PostCSS API] for details.

This is also a very advanced feature.
Use it at your own risk.

## Modules

As in nature, the scope of variables are bound within
a file or innermost braces (`{` ... `}`).
PostCSS @js's module feature allows us to
pass values beyond files through `exports` and `require`.
If you are familiar with CommonJS module, you can easily
understand the following example:

In `def.css`:

```css
@js const _ = exports.ratio = '80%';
```

In `use.css`:

```css
@import url('./def.css');
@js const def = require('./def.css');

main {
  width: @js def.ratio;
}
```

To export variables, store them in the `exports` (or `module.exports`)
object, which is globally available by default.
To refer the exported variables, call `require` with
the path to the file exporting them.

The file specified in the argument of the `require` function must be
imported by `@import` through [postcss-import] plugin.
If a `require`ed file is not `@import`ed, a "file not found" error
occurs.

As in Node.js, `require` can be used to import JavaScript libraries.

## Interpretation of Objects as CSS Fragments

Every value injected into CSS by `@js` must be one of the following:

1. an [AsyncIterable] object,
2. an [Iterable] object,
3. a plain object
   (an object whose prototype is either `Object.prototype` or `null`), or
4. a PostCSS `Node` object.

Type checking is done in this order.
In what follows, we refer to these as _interpretable_ objects.

Every value enumerated in an interoperable Iterable or AsyncIterable
must be interpretable recursively.
Nested Iterables are visited recursively and their values are
interpreted one by one.

In a plain object, each of its properties is translated separately to
a CSS construct in accordance with the following rule:

1. If its name starts with `@`, it is translated into an at-rule.
   The name must be the name of the at-rule optionally followed by its
   parameters.
   The value must be either an interpretable object, which constitute
   the block of the at-rule, or `undefined`, which indicates that the
   at-rule have no block.
2. Otherwise, if its value is an interpretable object, it is
   translated into a styling rule.
   The name and value of the property are used as the selector and
   content of the styling rule, respectively.
3. Otherwise, if its value is neither a function, `null`,
   nor `undefined`, it is translated into a style property declaration.
   The name and value of the property are used as the property name
   and value of the declaration, respectively.
   The value is stringified by `String()`.
4. Otherwise, an error is raised.

For each of `@js` property values and `:@js` pseudo selectors,
its value must not be either an interpretable object, function,
`null`, or `undefined`.
The value is strigified by `String()` and injects into CSS.

For each of `@js` expressions and `yield`, its value may additionally
be one of the following:

* `undefined`, which is simply discarded, or
* a function, which will be called later with an argument given by
  the next `yield`.
  Its return value is interpreted as if it is `yield`ed.

Note that, unlike `undefined`, `null` is not discarded and causes
an error.

The rule of object interpretation is designed in a strict manner
in order to protect you from accidental injection.

## Related PostCSS plugins and CSS processors

PostCSS @js is a CSS preprocessor, which allows us to transform CSS
iles before serving them to the clients.
The competitions of this plugin includes [Sass/Scss][Sass], [Less],
and [Stylus].
The unique point of PostCSS @js is that its language is native
JavaScript and therefore it allows the users to exploit the full power
of JavaScript.
Another benefit of PostCSS @js is that it is a PostCSS plugin and
therefore it can be combined with other PostCSS plugins within a
bundler or framework that includes PostCSS.
Conversely, it does not provide seamless interoperation with CSS
values, such as computing values with units (`12em` and `34px`
for example) and lists of fonts, whereas other standalone CSS
preprocessors can do that.
In `@js`, you must represent them in some JavaScript literals,
say strings.

Use [PostCSS Calc] for calculation of CSS values.
PostCSS @js does not provide any calculation of values with units
because JavaScript does not allow us to overload binary operators
and therefore writing such calculations in JavaScript is fairly
cumbersome.

PostCSS @js subsumes the functionality of [PostCSS Simple Variables]
and [PostCSS Mixins] in the sense that, as seen in the above examples,
JavaScript's variables and functions can be regarded as CSS variables
and mixins, respectively.

PostCSS @js does not conflict with [CSS Custom Properties], also
known as CSS variables.
One of their unique features is to represent dynamic context-dependent
styling, which PostCSS @js cannot provide inherently.

PostCSS @js is also different from CSS-in-JS such as [JSS],
[Styled Components], [Emotion], [Linaria], and many others.
PostCSS @js embeds JavaScript in CSS, whereas CSS-in-JS embeds CSS
in JavaScript.
PostCSS @js is provided just for producing a plain CSS and therefore
does not have any capability to collaborate with program main logic
by itself.

## Cheatsheet

Define a variable:

```css
@js const textSize = (`${14 + 2}pt`);
@js const widthLimit = 640;
@js const codeClass = '.code';
@js const location = 'background';
```

Substitute a variable in a property value:

```css
h1 {
  font-size: @js (`calc(${textSize} * 2)`);
}
```

Substitute a variable in a property name:

```css
h1 {
  @js ({ [`${location}-color`]: 'yellow' });
}
```

Substitute a variable in a selector:

```css
:@js(`pre${codeClass}`) {
  font-family: monospace;
}
```

Substitute a variable in an at-rule:

```css
@js const atRule = (name, params) => rules =>
  ({ [`@${name} ${params}`]: rules });
@js atRule('media', `screen and (max-width: ${widthLimit}px)`) {
  display: none;
}
```

Define a mixin:

```css
@js const makeBlack = {
  color: black;
}
```

Include a mixin:

```css
p {
  @js makeBlack;
}
```

Define a mixin with parameters:

```css
@js const colorize = (fg, bg) => {
  color: @js fg;
  background-color: @js bg;
}
```

Include a mixin with arguments:

```css
strong {
  @js colorize('red', 'yellow');
}
```

Define a mixin with a hole:

```css
@js const mediaDark = content => {
  @media screen and (prefers-color-scheme: dark) {
    @js content;
  }
}
```

Include a mixin with a hole:

```css
main {
  color: black;
  @js mediaDark {
    color: silver;
  }
}
```

Define a higher-order mixin with parameters:

```css
@js const selectColor = (c1, c2, c3, c4) => content => {
  @js content(c1, c3);
  @js mediaDark {
    @js content(c2, c4);
  }
}
```

Include a higher-order mixin:

```css
nav {
  @js yield selectColor('blue', 'green', 'white', 'black'), (c1, c2) => {
    color: @js c1;
    background-color: @js c2;
  }
}
```

Conditionals:

```css
.box {
  @js if (widthLimit > 600) yield {
    max-height: 800px;
  }
  @js if (widthLimit <= 600)) yield {
    height: 500px;
  }
}
```

Iteration:

```css
@js for (const i of [1, 2, 3]) yield {
  :@js(`p:nth-child(${i})`) {
    font-size: @js (`calc(10px * ${i})`);
  }
}
```

Export variables for other CSS files:

```css
@js var _ = exports.textSize = textSize;
@js var _ = exports.widthLimit = widthLimit;
```

Import variables from other CSS files:

```css
@import url('./global.css');
@js const [{ textSize, widthLimit }] = [require('./global.css')];
```

## License

MIT

[PostCSS]: https://postcss.org
[postcss-import]: https://github.com/postcss/postcss-import
[PostCSS Calc]: https://github.com/postcss/postcss-calc
[PostCSS Simple Variables]: https://github.com/postcss/postcss-simple-vars
[PostCSS Mixins]: https://github.com/postcss/postcss-mixins
[CSS Custom Properties]: https://developer.mozilla.org/en-US/docs/Web/CSS/--*
[PostCSS Nesting]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-nesting
[Acorn]: https://github.com/acornjs/acorn
[Sass]: https://sass-lang.com
[Less]: https://lesscss.org
[Stylus]: https://stylus-lang.com
[Styled Components]: https://styled-components.com
[JSS]: https://cssinjs.org/
[Emotion]: https://emotion.sh/docs/introduction
[AsyncIterable]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterator
[Iterable]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols
[PostCSS API]: https://postcss.org/api/
[Linaria]: https://github.com/callstack/linaria
