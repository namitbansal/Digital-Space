import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import toIco from 'to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icons/icon.svg'));
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 64 } });
const png = resvg.render().asPng();
const ico = await toIco([png]);
writeFileSync(join(root, 'public/favicon.ico'), ico);
writeFileSync(join(root, 'public/favicon.png'), png);
console.log('Wrote favicon.ico and favicon.png');
