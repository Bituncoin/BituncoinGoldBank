// Stub for react-native's ViewConfigIgnore (0.85.x).
// The real file uses Flow's covariant read-only mapped type syntax
// ({+[name: string]: true}) that hermes-parser 0.25.1 cannot parse,
// so Metro intercepts it here and returns no-op helpers instead.

function ignore() { return {}; }
function ignoreProps(props) { return props || {}; }

module.exports = {
  ignore,
  ignoreProps,
  DiffObjectProperties: {},
};
module.exports.default = module.exports;
