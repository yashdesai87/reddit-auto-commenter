const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function storage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async setAccessLevel() {},
    async get(keys) {
      if (keys == null) return structuredClone(data);
      return Object.fromEntries(
        [keys]
          .flat()
          .filter((key) => key in data)
          .map((key) => [key, structuredClone(data[key])])
      );
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      for (const key of [keys].flat()) delete data[key];
    }
  };
}

function sandbox(files, overrides = {}) {
  const chrome = {
    tabs: {
      onRemoved: {
        addListener(listener) {
          this.listener = listener;
        }
      }
    },
    storage: { local: storage(), sync: storage(), session: storage() },
    runtime: {
      id: 'test',
      getURL: (file) => 'chrome-extension://test/' + file,
      onMessage: { addListener() {} }
    }
  };
  const context = vm.createContext({
    chrome,
    console,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    ...overrides
  });
  context.importScripts = (...names) =>
    names.forEach((name) =>
      vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context)
    );
  context.importScripts(...files);
  return context;
}

module.exports = { root, sandbox, storage };
