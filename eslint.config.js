import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: true,
        jsx: false,
    }),
);
