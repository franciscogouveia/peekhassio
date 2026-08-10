import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'Program > VariableDeclaration > VariableDeclarator > NewExpression',
                    message: 'Construct runtime objects inside lifecycle-owned methods, not module initialization.',
                },
                {
                    selector: 'Program > VariableDeclaration > VariableDeclarator > CallExpression[callee.type="MemberExpression"][callee.property.name="new"]',
                    message: 'Construct GI objects inside lifecycle-owned methods, not module initialization.',
                },
            ],
        },
    },
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: true,
        jsx: false,
    }),
);
