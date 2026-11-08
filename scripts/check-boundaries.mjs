import { readdirSync,readFileSync } from 'node:fs';
import { resolve,join,dirname } from 'node:path';
import { root } from './build-config.mjs';
const violations=[];
function visit(folder,owner){for(const entry of readdirSync(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory()){visit(path,owner);continue;}if(!/\.tsx?$/.test(path))continue;const text=readFileSync(path,'utf8');for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
  const specifier=match[1],target=specifier.startsWith('.')?resolve(dirname(path),specifier):specifier;
  if(owner==='web'&&(target.includes('@cheongyak-moa/domain')||target.includes('@cheongyak-moa/api')||target.includes(join('apps','api'))))violations.push(path+' imports API/domain: '+specifier);
  if(['domain','contracts'].includes(owner)&&(target.includes(join('apps'))||specifier.startsWith('node:')))violations.push(path+' breaks shared-package boundary: '+specifier);
}}}
for(const[owner,path]of [['web','apps/web/src'],['api','apps/api/src'],['domain','packages/domain/src'],['contracts','packages/contracts/src']])visit(join(root,path),owner);
if(violations.length){console.error(violations.join('\n'));process.exitCode=1;}else console.log('Workspace import boundaries passed.');
