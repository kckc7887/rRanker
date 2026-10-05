const { beforeEach, jest } = require('@jest/globals');
const { View } = require('react-native');

beforeEach(() => {
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(callback => callback(16, 120, 200, 36));
});
