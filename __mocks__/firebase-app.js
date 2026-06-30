module.exports = {
  getApps: () => [],
  initializeApp: jest.fn(() => ({ __mockApp: true })),
  getApp: jest.fn(() => ({ __mockApp: true })),
};

module.exports = {};


