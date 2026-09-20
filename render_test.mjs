import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const result = await esbuild.build({
  entryPoints: ['./harness.tsx'],
  bundle: true,
  format: 'esm',
  write: false,
  jsx: 'automatic',
  platform: 'browser',
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
});
const fs = await import('fs');
fs.writeFileSync('/tmp/bundle.mjs', result.outputFiles[0].text);
await import('/tmp/bundle.mjs');
