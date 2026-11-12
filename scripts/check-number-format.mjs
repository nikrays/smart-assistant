import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {build}=await import(pathToFileURL(join(root,'frontend/node_modules/esbuild/lib/main.js')));
const folder=await mkdtemp(join(tmpdir(),'smart-number-format-'));
try{
 await build({stdin:{contents:"export {numberText,money} from './src/api';",resolveDir:join(root,'frontend')},bundle:true,platform:'node',format:'esm',outfile:join(folder,'numbers.mjs')});
 const {numberText,money}=await import(pathToFileURL(join(folder,'numbers.mjs')));
 const plain=value=>value.replace(/[\u00a0\u202f]/g,' ');
 assert.equal(plain(money('99999999999999.99')),'99 999 999 999 999,99 ₽');
 assert.equal(plain(money('1000000000000000000000000.01')),'1 000 000 000 000 000 000 000 000,01 ₽');
 assert.equal(plain(money('-99999999999999.99')),'-99 999 999 999 999,99 ₽');
 assert.equal(plain(numberText(1234567890123456789n)),'1 234 567 890 123 456 789');
 assert.equal(numberText('0.0014','га'),'0,001 га');
 assert.equal(numberText('1e-6'),'0');
 assert.equal(numberText(0),'0');
 assert.equal(numberText(null),'Не указано');
 assert.equal(numberText('не задано'),'не задано');
 console.log('PASS decimal rendering: large positive/negative cents, BigInt, units, rounding, empty and invalid values');
}finally{await rm(folder,{recursive:true,force:true});}
