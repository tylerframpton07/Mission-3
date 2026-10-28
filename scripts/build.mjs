import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of ['index.html','styles.css','app.js','model.js','report.js','venture_profiles.json','competitor_data.json']) await cp(new URL(`../${name}`, import.meta.url), new URL(`../dist/${name}`, import.meta.url));
await writeFile(new URL('../dist/.nojekyll', import.meta.url), '');
console.log('Built static GitHub Pages app in dist/');
