/**
 * babel.config.js
 *
 * Patches Node.js module resolution BEFORE babel-preset-expo is evaluated so
 * that `require('babel-plugin-syntax-hermes-parser')` never throws even when
 * the pnpm virtual store has a broken package.json "main" / "exports" entry
 * pointing to a non-existent index.js.
 *
 * The Metro-level alias in metro.config.js handles the bundler path; this
 * handles the server-side (Node.js / expo-router SSR) path.
 */

const Module = require('module');
const path   = require('path');
const fs     = require('fs');

// ── Node-level module resolution patch ──────────────────────────────────────
// We intercept _resolveFilename so that ANY require() of the broken package
// (no matter which caller / depth) resolves to our shim instead of crashing.

const HERMES_SHIM = path.resolve(__dirname, 'shims/babel-plugin-syntax-hermes-parser.js');

// Try to find the real index.js in the pnpm store first; fall back to shim.
function findRealHermesParserIndex() {
  const candidates = [
    path.resolve(__dirname, 'node_modules/babel-plugin-syntax-hermes-parser/index.js'),
  ];
  const storeDir = path.resolve(__dirname, 'node_modules/.pnpm');
  if (fs.existsSync(storeDir)) {
    try {
      for (const entry of fs.readdirSync(storeDir)) {
        if (entry.startsWith('babel-plugin-syntax-hermes-parser')) {
          candidates.push(
            path.resolve(
              storeDir,
              entry,
              'node_modules/babel-plugin-syntax-hermes-parser/index.js'
            )
          );
        }
      }
    } catch { /* ignore */ }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return HERMES_SHIM;
}

const RESOLVED_HERMES = findRealHermesParserIndex();

const _origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'babel-plugin-syntax-hermes-parser') {
    return RESOLVED_HERMES;
  }
  return _origResolve.call(this, request, parent, isMain, options);
};

// Register the module directly so repeated require() calls also hit the shim.
if (!require.cache[RESOLVED_HERMES]) {
  try {
    require(RESOLVED_HERMES);
  } catch { /* best-effort pre-load */ }
}

// ── Babel config ─────────────────────────────────────────────────────────────
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
