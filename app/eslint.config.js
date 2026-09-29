const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const noComments = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden:
        'Move explanations to documentation; app code has no comments.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments())
          context.report({ loc: comment.loc, messageId: 'forbidden' });
      },
    };
  },
};
module.exports = defineConfig([
  expo,
  { ignores: ['dist/**', '.expo/**', 'expo-env.d.ts', 'nativewind-env.d.ts'] },
  {
    plugins: { project: { rules: { 'no-comments': noComments } } },
    rules: { 'project/no-comments': 'error' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\S/]',
          message: 'Use i18n for interface strings.',
        },
      ],
    },
  },
]);
