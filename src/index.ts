import type { PluginCreator } from 'postcss'
import { compile } from './compile'
import { evaluate, defaultGlobals } from './evaluate'

const plugin: PluginCreator<void> = () => {
  return {
    postcssPlugin: 'postcss-at-js',
    prepare() {
      return {
        Once: async (root, helpers) => {
          const globals = defaultGlobals({ postcss: helpers })
          const code = await compile(root, helpers, globals)
          await evaluate(code, root)
        }
      }
    }
  }
}
plugin.postcss = true
export default plugin
