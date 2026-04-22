/**
 * Babel configuration for Jest only.
 * Transforms ESM import/export to CommonJS so Jest can run browser-side
 * ES module files (public/js/**) without requiring "type": "module" in
 * package.json (which would break all existing CJS tests).
 */
module.exports = {
  // Only apply this transform when running under Jest
  env: {
    test: {
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
  },
};
