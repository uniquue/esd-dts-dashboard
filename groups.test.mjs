import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as data from './data.mjs';

const fy25=['HQs','FD','PA&E','FA49 (PA&E)'];
const fy26=['HQs','CD','EMD','PA&E','FA49 (PA&E)'];

test('FY25 has historical groups before loading and with a master',()=>{
 assert.deepEqual(data.groupsForFiscalYear('G-8','FY25'),fy25);
 const master=[...fy25,'CD','EMD'].map(group=>({agency:'G-8',group}));
 assert.deepEqual(data.groupsForFiscalYear('G-8','FY25',master),fy25);
});

test('later years and other agencies retain existing group behavior',()=>{
 for(const year of ['FY26','FY27','FY28','FY29','FY30'])
  assert.deepEqual(data.groupsForFiscalYear('G-8',year),fy26);
 const master=[{agency:'ASA(FM&C)',group:'HQs'},{agency:'ASA(FM&C)',group:'Additional group'}];
 assert.deepEqual(data.groupsForFiscalYear('ASA(FM&C)','FY25',master),[...data.agencies['ASA(FM&C)'],'Additional group']);
});

test('switching years refreshes filters, funding rows, uploads and receipt choices',()=>{
 const elements=new Map();
 const element=()=>({value:'',innerHTML:'',textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},append(){},replaceChildren(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 get('agency').value='G-8';get('receipt-agency').value='G-8';get('fiscal-year').value='FY26';
 const context=vm.createContext({...data,document:{getElementById:get,querySelectorAll:()=>[],createElement:element,body:element(),addEventListener(){}},window:{addEventListener(){}},fetch:()=>new Promise(()=>{})});
 const source=readFileSync(new URL('./app.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
 vm.runInContext(source,context);
 function verify(expected){
  const filters=[...get('filters').innerHTML.matchAll(/type="checkbox" value="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
  assert.deepEqual(filters,expected);
  assert.equal(get('receipt-group').innerHTML,expected.map(g=>'<option>'+g.replaceAll('&','&amp;')+'</option>').join(''));
  for(const group of expected){
   const escaped=group.replaceAll('&','&amp;');
   assert.ok(get('funding').innerHTML.includes('<td>'+escaped+'</td>'));
   assert.ok(get('uploads').innerHTML.includes('data-group="'+escaped+'"'));
  }
 }
 verify(fy26);
 get('fiscal-year').value='FY25';get('fiscal-year').listeners.change();verify(fy25);
 assert.doesNotMatch(get('funding').innerHTML,/<td>(CD|EMD)<\/td>/);
 assert.doesNotMatch(get('uploads').innerHTML,/data-group="(CD|EMD)"/);
 // Synthetic budget amounts continue to total $1,000; missing reports remain missing.
 context.budgetRows=fy25.map((group,i)=>({agency:'G-8',group,budget:[10000,20000,30000,40000][i],received:0}));
 vm.runInContext('master=budgetRows;setup();',context);
 assert.match(get('metrics').innerHTML,/\$1,000\.00/);
 assert.match(get('funding').innerHTML,/Not supplied/);
 get('fiscal-year').value='FY26';get('fiscal-year').listeners.change();verify(fy26);
 assert.doesNotMatch(get('funding').innerHTML,/<td>FD<\/td>/);
});
