// Runs tests/cases.js in node with no dependencies: `node tests/run.js`. Exit code 1 if any case fails.
// app.js is built for a browser, so it runs here against a stub DOM that accepts and ignores every call.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

// a stub that stands in for any DOM object: reads give another stub, calls give a stub, lists are empty
function stub(own = {}) {
  const fn = function () {};
  return new Proxy(fn, {
    get(_, k) {
      if (k in own) return own[k];
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'length') return 0;
      if (k === 'dataset') return {};
      if (k === 'then') return undefined;
      if (['querySelectorAll', 'getElementsByClassName', 'getElementsByTagName'].includes(k)) return () => [];
      if (['forEach', 'map', 'filter'].includes(k)) return () => [];
      return stub();
    },
    set() { return true; },
    apply() { return stub(); },
  });
}

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: k => void store.delete(k),
};
const document = stub({ fonts: undefined }); // app.js skips the font hook when fonts is absent
const sandbox = {
  console, document, localStorage,
  location: { hash: '', href: 'http://localhost/', origin: 'http://localhost' },
  navigator: {}, history: stub(), screen: {},
  setTimeout, clearTimeout, requestAnimationFrame: () => 0, matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {}, removeEventListener() {}, scrollTo() {}, getComputedStyle: () => ({}),
  URLSearchParams, Intl, Blob: function () {}, URL,
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

const files = ['data/rackets.js', 'data/strings.js', 'data/shuttles.js', 'data/shoes.js', 'data/socks.js', 'data/catalog-v1.js', 'app.js', 'tests/feedback.js', 'tests/cases.js'];
for (const f of files) {
  try {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
  } catch (e) {
    console.error(`cannot load ${f}: ${e.stack || e}`);
    process.exit(2);
  }
}

const cases = sandbox.RS_CASES;
if (!Array.isArray(cases) || !cases.length) { console.error('no cases found'); process.exit(2); }

let pass = 0;
const failed = [];
for (const [name, fn] of cases) {
  let ok = false, err = '';
  try { ok = !!fn(); } catch (e) { err = e.message; }
  if (ok) pass++; else failed.push(err ? `${name} (${err})` : name);
}
for (const f of failed) console.log(`FAIL: ${f}`);
console.log(`${pass}/${cases.length} passed`);
process.exit(failed.length ? 1 : 0);
