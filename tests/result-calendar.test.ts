import test from 'node:test';
import assert from 'node:assert/strict';
import { markResultTasks } from '../src/result-calendar.ts';
import type { Data } from '../src/store.ts';
import type { Task } from '../src/types.ts';

const task = (id:string,captureId='capture'):Task => ({id,captureId,title:id,dueDate:'2026-11-18',dueTime:'12:00',evidence:id,needsReview:false,reviewReason:'',createdAt:'2026-11-17T00:00:00Z',completedAt:null,engine:'cloud'});
const example = ():Data => ({version:1,captures:[],tasks:[task('one'),{...task('two'),calendarDate:'2026-12-01',calendarTime:'09:00'},task('other','another')]});

test('marks selected saved tasks only and leaves deadlines and unselected marks unchanged',()=>{
  const data=example();
  markResultTasks(data,'capture',[{taskId:'one',date:'2026-11-18',time:'12:00'}]);
  assert.equal(data.tasks[0].calendarDate,'2026-11-18');
  assert.equal(data.tasks[0].calendarTime,'12:00');
  assert.equal(data.tasks[0].dueTime,'12:00');
  assert.equal(data.tasks[1].calendarDate,'2026-12-01');
  assert.equal(data.tasks[1].calendarTime,'09:00');
  assert.equal(data.tasks[2].calendarDate,undefined);
});

test('allows an explicit all-day mark without inventing a time',()=>{
  const data=example();
  markResultTasks(data,'capture',[{taskId:'two',date:'2026-12-02',time:''}]);
  assert.equal(data.tasks[1].calendarDate,'2026-12-02');
  assert.equal(data.tasks[1].calendarTime,undefined);
});

test('rejects missing or invalid dates before changing any selected task',()=>{
  for(const date of ['', '2026-02-30']){
    const data=example(); const before=structuredClone(data);
    assert.throws(()=>markResultTasks(data,'capture',[{taskId:'one',date:'2026-11-18',time:''},{taskId:'two',date,time:''}]),/valid date/);
    assert.deepEqual(data,before);
  }
});

test('refuses empty selections, duplicates, invalid times, and tasks from another capture',()=>{
  for(const marks of [[],[{taskId:'one',date:'2026-11-18',time:'25:00'}],[{taskId:'other',date:'2026-11-18',time:''}],[{taskId:'one',date:'2026-11-18',time:''},{taskId:'one',date:'2026-11-19',time:''}]]) {
    const data=example();const before=structuredClone(data);
    assert.throws(()=>markResultTasks(data,'capture',marks));assert.deepEqual(data,before);
  }
});
