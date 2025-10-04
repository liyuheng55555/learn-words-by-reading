const path = require('path');

const pageEntries = {
  fill: path.resolve(__dirname, 'src/pages/fill/index.js'),
  history: path.resolve(__dirname, 'src/pages/history/index.js'),
  progress: path.resolve(__dirname, 'src/pages/progress/index.js')
};

module.exports = {
  build: {
    outDir: 'build',
    emptyOutDir: false,
    rollupOptions: {
      input: pageEntries,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
        format: 'es'
      }
    }
  }
};
