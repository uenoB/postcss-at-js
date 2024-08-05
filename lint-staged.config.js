export default {
  '*.js': ['prettier -c', 'eslint'],
  '*.{ts,tsx}': ['prettier -c', () => 'tsc', 'eslint', () => 'vitest run'],
  '*.json': ['prettier -c']
}
