/**
 * tsdown preset for ecom-details-image-plugin: ESM node half + browser half
 * (lib/client.js) wrapped for the harness client-plugin loader. Mirrors the
 * verified weather-plugin preset: schemastery stays unbundled, browser half is
 * a single classic script with the platform module table external.
 */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = '@demo/ecom-details-image-plugin'

/** Module specifiers the dsh web shell shares into its frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

/** Externals resolved from the loader module table. */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client']

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: {
      // schemastery stays unbundled (the Loader validates the plugin's `Config`
      // schema and must see its own instances); undici is bundled so the node
      // half can provide an optional HTTP CONNECT proxy agent for restricted
      // networks (e.g. apimart.ai behind a local proxy).
      neverBundle: ['@deepseek-ai/schemastery', '@deepseek-ai/cordis'],
      bundle: ['undici'],
    },
  },
  {
    // Browser bundle: lib/client.js, served by the harness at /plugins/<id>/client.js.
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      inlineDynamicImports: true,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
