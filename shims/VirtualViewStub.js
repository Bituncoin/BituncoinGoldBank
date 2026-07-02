// Stub for react-native's unstable_VirtualView (0.85.x).
// The real file uses a `match` expression that hermes-parser 0.25.1 cannot
// parse, so Metro intercepts it here and returns a no-op component instead.
const React = require('react');
const { View } = require('react-native');

function VirtualView(props) {
  return React.createElement(View, props);
}

module.exports = VirtualView;
module.exports.default = VirtualView;
