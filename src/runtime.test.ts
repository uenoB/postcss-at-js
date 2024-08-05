import { test, expect } from 'vitest'
import postcss from 'postcss'
import * as r from './runtime'

class TestIterable<X> implements Iterable<X> {
  private readonly items: Iterable<X>

  constructor(items: Iterable<X>) {
    this.items = items
  }

  [Symbol.iterator](): Iterator<X, void, void> {
    const i: Iterator<X, unknown, unknown> = this.items[Symbol.iterator]()
    return {
      next: (): { done: true; value: undefined } | { value: X } => {
        const { done, value } = i.next()
        return (done ?? false) ? { done: true, value: undefined } : { value }
      }
    }
  }
}

test('iterator with undefined done', async () => {
  const src = function* (): Generator {
    yield { color: 'blue' }
    yield { '@media print': new TestIterable([{ color: 'black' }]) }
    yield { main: new TestIterable(new TestIterable([{ color: 'red' }])) }
  }
  await expect(
    r.newContainer(postcss.root(), r.setup(postcss).interpretMain(src))
  ).resolves.toMatchObject({
    nodes: [
      { type: 'decl', prop: 'color', value: 'blue' },
      {
        type: 'atrule',
        params: 'print',
        nodes: [{ type: 'decl', prop: 'color', value: 'black' }]
      },
      {
        type: 'rule',
        selector: 'main',
        nodes: [{ type: 'decl', prop: 'color', value: 'red' }]
      }
    ]
  })
})

test('BeginJs.source with fromOffset returning null', () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const node = postcss.parse('@js {}', { from: '1.css' }).first!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const source = node.source!
  source.input.fromOffset = () => null
  expect(new r.BeginJs(node, 0, 0).source()).toBe(source)
})

test('BeginJs.source with node without source', () => {
  expect(new r.BeginJs(postcss.atRule(), 0, 0).source()).toBeUndefined()
})

test('BeginJs.source with node without source.start', () => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const node = postcss.parse('@js {}', { from: '1.css' }).first!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const source = node.source!
  delete source.start
  expect(new r.BeginJs(node, 0, 0).source()).toStrictEqual({
    ...source,
    start: { offset: 0, line: 1, column: 1 }
  })
})
