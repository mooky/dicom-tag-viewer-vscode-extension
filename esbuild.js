const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    platform: 'node',
    external: ['vscode'],
    outfile: 'dist/extension.js',
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    platform: 'browser',
    outfile: 'dist/webview.js',
  });

  const cssCtx = await esbuild.context({
    entryPoints: ['src/webview/style.css'],
    bundle: true,
    minify: production,
    outfile: 'dist/webview.css',
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch(), cssCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild(), cssCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose(), cssCtx.dispose()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
