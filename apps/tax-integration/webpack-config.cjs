"use strict";

// Webpack >= 5.109.0 enables TypeScript support by default: it tries to
// resolve types via the tsconfig.json of every module it bundles, including
// node_modules packages. Some of those ship a tsconfig.json extending an
// uninstalled devDependency, which fails the build.
module.exports = {
  experiments: {
    typescript: false,
  },
};
