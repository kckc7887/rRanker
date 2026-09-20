const React = require('react');
const { View } = require('react-native');

function QRCode() {
  return React.createElement(View, { testID: 'qrcode' });
}

module.exports = QRCode;
module.exports.default = QRCode;
