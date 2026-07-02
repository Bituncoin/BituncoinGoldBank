const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs   = require('fs');

const config = getDefaultConfig(__dirname);

// ─────────────────────────────────────────────────────────────────────────────
// BABEL-PLUGIN-SYNTAX-HERMES-PARSER PNPM FIX
//
// In some pnpm setups, babel-plugin-syntax-hermes-parser's package.json has
// an invalid "main" field pointing to a non-existent index.js.
// We resolve it to the real entry point at build time.
// ─────────────────────────────────────────────────────────────────────────────
function resolveHermesParserPlugin() {
  // Common pnpm paths to probe
  const candidates = [
    path.resolve(__dirname, 'node_modules/babel-plugin-syntax-hermes-parser/index.js'),
    path.resolve(__dirname, 'node_modules/.pnpm/babel-plugin-syntax-hermes-parser@0.25.1/node_modules/babel-plugin-syntax-hermes-parser/index.js'),
  ];
  // Walk pnpm virtual store for any matching package
  const storeDir = path.resolve(__dirname, 'node_modules/.pnpm');
  if (fs.existsSync(storeDir)) {
    try {
      for (const entry of fs.readdirSync(storeDir)) {
        if (entry.startsWith('babel-plugin-syntax-hermes-parser')) {
          candidates.push(path.resolve(storeDir, entry, 'node_modules/babel-plugin-syntax-hermes-parser/index.js'));
        }
      }
    } catch { /* ignore read errors */ }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const hermesParserPluginPath = resolveHermesParserPlugin();

// Alias expo-web-browser to our safe shim, and patch hermes-parser if needed
const HERMES_PARSER_SHIM = path.resolve(__dirname, 'shims/babel-plugin-syntax-hermes-parser.js');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-web-browser': path.resolve(__dirname, 'shims/expo-web-browser.ts'),
  // Patch babel-plugin-syntax-hermes-parser: use real path if found, otherwise use our shim
  'babel-plugin-syntax-hermes-parser': hermesParserPluginPath ?? HERMES_PARSER_SHIM,
};

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL NATIVE COMPONENT STUB
//
// React Native 0.85.x ships Flow-typed native component spec files that
// hermes-parser 0.25.1 cannot parse on iOS/Android native builds.
// This interceptor redirects ALL of them to a safe empty stub so the
// bundler never tries to parse the invalid Flow syntax.
//
// Rules:
//   1. ANY file whose path contains '/specs/components/' or '/specs_DEPRECATED/components/'
//   2. ANY file whose basename matches a known problematic pattern
//   3. Explicitly allow NativeComponentRegistry (needed at runtime)
// ─────────────────────────────────────────────────────────────────────────────
const NATIVE_COMPONENT_STUB = path.resolve(__dirname, 'shims/NativeComponentStub.js');

// Basenames that must NEVER be stubbed (runtime-critical)
const ALLOW_LIST = new Set([
  'NativeComponentRegistry',
  'NativeComponentRegistry.js',
  'ReactNativePrivateInterface',
]);

// Patterns in the full module path that indicate a Flow-typed spec file
const STUB_PATH_PATTERNS = [
  '/specs/components/',
  '/specs_DEPRECATED/components/',
  '/private/specs/',
  '/private/specs_DEPRECATED/',
];

// Basename substrings that always get stubbed
const STUB_NAME_PATTERNS = [
  'NativeComponent',      // catches RCTModal…, AndroidSwipe…, etc.
  'ViewConfigIgnore',
  'VirtualView',
];

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Extract just the basename for matching
  const basename = moduleName.split('/').pop() || '';

  // Always allow registry through
  if (ALLOW_LIST.has(basename)) {
    if (originalResolveRequest) return originalResolveRequest(context, moduleName, platform);
    return context.resolveRequest(context, moduleName, platform);
  }

  // Check path-based patterns first (most reliable)
  for (const pattern of STUB_PATH_PATTERNS) {
    if (moduleName.includes(pattern)) {
      return { filePath: NATIVE_COMPONENT_STUB, type: 'sourceFile' };
    }
  }

  // Check basename patterns
  for (const pattern of STUB_NAME_PATTERNS) {
    if (basename.includes(pattern)) {
      return { filePath: NATIVE_COMPONENT_STUB, type: 'sourceFile' };
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
