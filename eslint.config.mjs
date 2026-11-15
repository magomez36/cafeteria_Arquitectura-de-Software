import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
export default tseslint.config(
  { ignores: ['**/node_modules/**','**/dist/**','**/build/**','**/.next/**','**/coverage/**','**/next-env.d.ts','**/*.min.js','**/.turbo/**'] },
  ...tseslint.configs.recommended,
  { plugins: { boundaries }, rules: { 'boundaries/element-types': 'off' } },
);
