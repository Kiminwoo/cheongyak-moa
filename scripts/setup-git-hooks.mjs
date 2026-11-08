import { execFileSync } from 'node:child_process';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try{
  const gitRoot=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if(resolve(gitRoot).toLowerCase()===root.toLowerCase()){
    execFileSync('git',['config','--local','core.hooksPath','.githooks'],{cwd:root});
    console.log('Local Conventional Commits hook enabled.');
  }
}catch{console.log('Git hooks skipped: this folder is not an available Git checkout.');}
