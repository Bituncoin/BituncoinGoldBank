/**
 * shims/babel-plugin-syntax-hermes-parser.js
 *
 * Safety shim for babel-plugin-syntax-hermes-parser when the pnpm virtual
 * store has a broken package.json "main" entry that points to a non-existent
 * index.js. This shim exports the minimal Babel plugin interface so the
 * build does not crash.
 *
 * Metro resolver is configured in metro.config.js to redirect
 * 'babel-plugin-syntax-hermes-parser' here when the real entry is missing.
 */

module.exports = function hermesParserSyntaxPlugin() {
  return {
    name: 'syntax-hermes-parser-shim',
    // No-op: hermes-parser syntax is handled by @babel/core when using
    // the Hermes engine at runtime; we don't need a Babel syntax plugin
    // in the Metro bundler pipeline.
  };
};
