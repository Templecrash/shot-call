import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {DEFAULT_BUY_AMOUNT,MAX_BUY_AMOUNT,ProfileSettingsError,saveBuyPreset} from '../lib/profile-settings';

function fixture() {
  const sql=new DatabaseSync(':memory:');
  const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort();
  for(const file of migrations.slice(0,-1))sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  sql.prepare('INSERT INTO accounts(user_id,balance,revision) VALUES(?,?,?)').run('a',76543,7);
  sql.prepare('INSERT INTO accounts(user_id,balance,revision) VALUES(?,?,?)').run('b',98765,9);
  sql.exec(readFileSync(new URL('../drizzle/'+migrations.at(-1),import.meta.url),'utf8'));
  class Statement {
    values:(string|number|null)[]=[];
    constructor(public text:string){}
    bind(...values:(string|number|null)[]){this.values=values;return this;}
    async run(){return {meta:sql.prepare(this.text).run(...this.values),success:true};}
  }
  return {sql,db:{prepare:(query:string)=>new Statement(query)} as unknown as D1Database};
}

test('existing accounts receive the $100 preset without changing balances or revisions',()=>{
  const {sql}=fixture();
  assert.deepEqual(sql.prepare('SELECT user_id,balance,revision,default_buy_amount FROM accounts ORDER BY user_id').all().map(row=>({...row})),[
    {user_id:'a',balance:76543,revision:7,default_buy_amount:DEFAULT_BUY_AMOUNT},
    {user_id:'b',balance:98765,revision:9,default_buy_amount:DEFAULT_BUY_AMOUNT},
  ]);
  sql.close();
});

test('saved presets persist in cents and affect only the selected account preference',async()=>{
  const {sql,db}=fixture();
  await saveBuyPreset(db,'a',12550);
  assert.equal(sql.prepare('SELECT default_buy_amount FROM accounts WHERE user_id=?').get('a')!.default_buy_amount,12550);
  await saveBuyPreset(db,'a',25000);
  assert.deepEqual({...sql.prepare('SELECT balance,revision,default_buy_amount FROM accounts WHERE user_id=?').get('a')},
    {balance:76543,revision:7,default_buy_amount:25000});
  assert.equal(sql.prepare('SELECT default_buy_amount FROM accounts WHERE user_id=?').get('b')!.default_buy_amount,DEFAULT_BUY_AMOUNT);
  sql.close();
});

test('invalid values cannot alter a saved preset or create an account',async()=>{
  const {sql,db}=fixture();
  await saveBuyPreset(db,'a',12345);
  for(const value of [0,-1,MAX_BUY_AMOUNT+1,125.5,'100',null,undefined,Infinity,NaN]){
    await assert.rejects(saveBuyPreset(db,'a',value),ProfileSettingsError);
    await assert.rejects(saveBuyPreset(db,'new-user',value),ProfileSettingsError);
  }
  assert.equal(sql.prepare('SELECT default_buy_amount FROM accounts WHERE user_id=?').get('a')!.default_buy_amount,12345);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM accounts').get()!.count,2);
  sql.close();
});
