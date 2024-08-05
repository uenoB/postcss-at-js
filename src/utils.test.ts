import { test, expect } from 'vitest'
import * as u from './utils'

test('getProp', () => {
  const obj = { foo: 1, bar: 'BAR' }
  expect(u.getProp(obj, 'foo')).toBe(1)
  expect(u.getProp(obj, 'bar')).toBe('BAR')
  expect(u.getProp(obj, 'baz')).toBeUndefined()
})

test('setProp overwrite', () => {
  const obj: Record<string, unknown> = { foo: 1 }
  u.setProp(obj as object, 'foo', 456)
  expect(obj['foo']).toBe(456)
})

test('setProp append', () => {
  const obj: Record<string, unknown> = { foo: 1 }
  u.setProp(obj as object, 'bar', 456)
  expect(obj['bar']).toBe(456)
})

test('setProp overwrite with undefined', () => {
  const obj: Record<string, unknown> = { foo: 1 }
  u.setProp(obj as object, 'foo', undefined)
  expect('foo' in obj).toBe(true)
  expect(obj['foo']).toBeUndefined()
})

test('setProp append with undefined', () => {
  const obj: Record<string, unknown> = { foo: 1 }
  u.setProp(obj as object, 'bar', undefined)
  expect('bar' in obj).toBeFalsy()
})

test('deleteProp', () => {
  const obj = { foo: 123 }
  expect(u.deleteProp(obj, 'foo')).toBe(123)
  expect(obj).toStrictEqual({})
})
