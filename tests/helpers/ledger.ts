import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function ledger(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../../drizzle/${name}`,import.meta.url),'utf8'));
 let failAt=-1;
 class Statement{values:(string|number|null)[]=[];constructor(public sql:string){}bind(...values:(string|number|null)[]){this.values=values;return this;}async first(){return sqlite.prepare(this.sql).get(...this.values)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.values),success:true};}async run(){return {meta:sqlite.prepare(this.sql).run(...this.values),success:true};}}
 const db={prepare:(sql:string)=>new Statement(sql),async batch(rows:Statement[]){sqlite.exec('BEGIN');try{const out=rows.map((r,i)=>{if(rows.length>2&&i===failAt)throw new Error('Injected failure');return r.sql.startsWith('SELECT')?{results:sqlite.prepare(r.sql).all(...r.values),success:true}:{results:[],meta:sqlite.prepare(r.sql).run(...r.values),success:true};});sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 return {sqlite,db,fail:(i:number)=>{failAt=i;}};
}
