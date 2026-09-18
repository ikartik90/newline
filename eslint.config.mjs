import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    ignores: [
      'out/',
      'dist/',
      'node_modules/',
      'worker/.wrangler/',
      'worker/worker-configuration.d.ts'
    ]
  }
)
