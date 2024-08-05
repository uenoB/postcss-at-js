import * as fs from 'node:fs'
import esbuild from 'rollup-plugin-esbuild'
import terser from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'

const terserConfig = {
  ecma: 2022,
  compress: {
    join_vars: false,
    sequences: false,
    lhs_constants: false,
    reduce_funcs: false,
    keep_fnames: /Middleware$/
  },
  mangle: false,
  output: {
    comments: false,
    beautify: true,
    indent_level: 2,
    semicolons: false,
    preserve_annotations: true
  }
}

const cleanup = dir => ({
  name: 'cleanup',
  buildStart: () => fs.rmSync(dir, { recursive: true, force: true })
})

const externalNames = json => [
  ...Object.keys(json.dependencies ?? {}),
  ...Object.keys(json.peerDependencies ?? {})
]

const jsonURL = new URL('package.json', import.meta.url)
const json = JSON.parse(fs.readFileSync(jsonURL, { encoding: 'utf8' }))
const external = [...new Set(externalNames(json)), /^node:/]

export default [
  {
    external,
    plugins: [
      cleanup('dist'),
      esbuild({ target: 'es2022' }),
      terser(terserConfig)
    ],
    input: './src/index.ts',
    output: [
      {
        format: 'es',
        sourcemap: true,
        sourcemapExcludeSources: true,
        dir: 'dist'
      },
      {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        exports: 'named',
        esModule: true,
        sourcemap: true,
        sourcemapExcludeSources: true,
        dir: 'dist'
      }
    ]
  },
  {
    external,
    plugins: [dts()],
    input: './src/index.ts',
    output: [
      { dir: 'dist', entryFileNames: '[name].d.ts' },
      { dir: 'dist', entryFileNames: '[name].d.cts' }
    ]
  }
]
