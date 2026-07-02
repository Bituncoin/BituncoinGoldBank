/**
 * NativeComponentStub.js
 *
 * Universal stub for ALL React Native 0.85.x Flow-typed native component spec
 * files that crash hermes-parser 0.25.1 on iOS/Android builds.
 *
 * These files use Flow syntax (ReadonlyArray, match expressions, covariant
 * properties) that the bundler's Babel parser cannot handle on native targets.
 * The browser/web build is unaffected because it takes a different resolution
 * path.
 *
 * By returning empty exports, the native build proceeds without errors while
 * the actual native component rendering is handled by the React Native runtime
 * directly — not through these JS spec files.
 */
module.exports = {};
