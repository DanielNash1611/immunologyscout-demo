// Test-only guard: suites must supply synthetic mocks for all integration requests.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'server-only') return {}; // Run server modules in the test process, not in a browser bundle.
  return originalLoad.call(this, name, ...args);
};
globalThis.fetch = async () => { throw new Error('Offline test: unexpected request; provide a synthetic mock'); };
for (const name of ['node:http', 'node:https']) {
  const transport = require(name);
  transport.request = transport.get = () => { throw new Error('Offline test: unexpected HTTP request'); };
}
