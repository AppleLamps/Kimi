module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true,
    },
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'react', 'react-hooks'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'prettier',
    ],
    settings: {
        react: { version: 'detect' },
    },
    ignorePatterns: ['dist', 'dist-electron', 'node_modules', 'release'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
};
