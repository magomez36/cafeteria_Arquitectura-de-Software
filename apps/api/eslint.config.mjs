import base from '../../eslint.config.mjs';
import tseslint from 'typescript-eslint';
import { moduleBoundaryPlugin } from '../../packages/eslint-config/module-boundaries.js';

export default tseslint.config(...base, {
  files: ['src/modules/**/*.ts'],
  plugins: { cafeteria: moduleBoundaryPlugin },
  rules: {
    'cafeteria/no-cross-module-import': 'error',
  },
});
