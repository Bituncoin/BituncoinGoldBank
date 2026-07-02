// Stub for AndroidSwipeRefreshLayoutNativeComponent (react-native 0.85.x).
// The real file uses Flow's ReadonlyArray property type in State that
// @react-native/babel-plugin-codegen cannot process with the current parser.
// Metro intercepts it here and returns a no-op component instead.
const React = require('react');
const { View } = require('react-native');

function AndroidSwipeRefreshLayout(props) {
  return React.createElement(View, props);
}

module.exports = AndroidSwipeRefreshLayout;
module.exports.default = AndroidSwipeRefreshLayout;
