declare module '__mock__' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  export const fn: import('vitest').Mock<(s: string) => void>
}
