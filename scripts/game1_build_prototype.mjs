import {stripTypeScriptTypes} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
for(const name of ['traits','ledger','derived','tags','workshop']){
 const source=readFileSync(new URL('../src/contracts/game1-'+name+'.ts',import.meta.url),'utf8');
 mkdirSync(new URL('../prototype/core/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../prototype/core/game1-'+name+'.js',import.meta.url),stripTypeScriptTypes(source).replaceAll(".ts'",".js'").replace(/[ \t]+$/gm,'').trimEnd()+'\n');
}
console.log('game1 browser modules generated from tested TypeScript sources');
