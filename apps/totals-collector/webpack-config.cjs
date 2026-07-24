"use strict";

// Webpack >= 5.109.0 defaults `experiments.typescript` to "auto", which
// auto-enables on Node.js >= 22.6 and turns on tsconfig resolution for every
// module — including node_modules packages whose published tsconfig.json
// extends an uninstalled devDependency (e.g. @ljharb/tsconfig), breaking the
// action build with spurious "Module not found" errors. Actions here are
// plain JS, so opt out of the built-in TypeScript support entirely.
module.exports = {
  experiments: {
    typescript: false,
  },
};
