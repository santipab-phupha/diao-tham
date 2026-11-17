import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-sans-thai/600.css';
import '@fontsource/noto-sans-thai/700.css';
import './style.css';
import './hero.css';
import './brand.css';
import './calendar-view.css';
import './review-result.css';
import { createIcons, Check, ArrowUpRight, ArrowRight, Plus, Settings2, X, Inbox, Sparkles, CalendarDays, Clock3, CheckCheck, ChevronDown, Trash2, Pencil, Laptop, Cloud, ShieldCheck, CornerDownLeft, RotateCcw, FileText, LoaderCircle, ExternalLink } from 'lucide';
import { extractBasic } from './basic';
import { extractFirebase, getSettingsFromEnv, validateSettings } from './firebase';
import { recordExtraction } from './extraction-state';
import { markResultTasks, type ResultCalendarMark } from './result-calendar';
import { loadData, commit, StaleDataError, type Data } from './store';
import { prepareCalendar, authorizeCalendar, isCalendarConnected, addCalendarEvent, setCalendarToken, calendarEventStorageKey, syncMarkedTasks } from './calendar';
import { signInGoogle, signOutGoogle, watchAccount } from './auth';
import { checkLocalCapability } from './local-capability';
import { monthDays, monthTitle, shiftMonth } from './month-calendar';
import type { User } from 'firebase/auth';
import type { Candidate, Capture, Engine, Extraction, Locale, Task } from './types';

const root = document.querySelector<HTMLDivElement>('#app')!;
const icons = {Check,ArrowUpRight,ArrowRight,Plus,Settings2,X,Inbox,Sparkles,CalendarDays,Clock3,CheckCheck,ChevronDown,Trash2,Pencil,Laptop,Cloud,ShieldCheck,CornerDownLeft,RotateCcw,FileText,LoaderCircle,ExternalLink};
const icon = (name:string, cls='') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const esc = (value:unknown) => String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!));
// Product chrome stays in English; message text keeps its original language.
const locale:Locale = 'en';
const t = (_th:string,en:string) => en;
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:zone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=(type:string)=>parts.find(item=>item.type===type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const modeKey = 'diao-tham.entry.v1';
const localProfileKey = 'diao-tham.local-profile.v1';
const choiceKey = 'diao-tham.entry-choice.v1';
type Entry = {mode:'local'|'google'; name:string; timeZone:string; localEngine:'device'|'basic'};
let entry:Entry|null = null;
let previousLocal:Entry|null = null;
let hasMadeChoice=false;
try { hasMadeChoice=localStorage.getItem(choiceKey)==='1'; } catch { /* Read-only or blocked storage. */ }
try {
  const saved = JSON.parse(localStorage.getItem(modeKey) || 'null');
  if (saved && (saved.mode === 'local' || saved.mode === 'google') && typeof saved.name === 'string' && typeof saved.timeZone === 'string' && (saved.localEngine === 'device' || saved.localEngine === 'basic')) {
    new Intl.DateTimeFormat('en', {timeZone:saved.timeZone});
    entry = saved;
  }
} catch { /* Existing malformed preferences remain untouched. */ }
try {
  const saved=JSON.parse(localStorage.getItem(localProfileKey)||'null');
  if(saved?.mode==='local' && typeof saved.name==='string' && typeof saved.timeZone==='string' && (saved.localEngine==='device'||saved.localEngine==='basic')) {
    new Intl.DateTimeFormat('en',{timeZone:saved.timeZone}); previousLocal=saved;
  }
} catch { /* Do not modify a malformed local profile. */ }
const zone = () => entry?.mode === 'local' ? entry.timeZone : defaultZone;
let data:Data = {version:1,captures:[],tasks:[]};
let readError = '';
try { data = loadData(); } catch(error) { readError = String((error as Error).message); }
const settings = getSettingsFromEnv();
const googleSignInEnabled = import.meta.env.VITE_GOOGLE_SIGN_IN_ENABLED === 'true';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
let filter = 'open';
let lastCaptureMs:number|null = null;
let lastExtraction:Extraction|null = null;
let run = 0;
let busy = false;
let extractionController:AbortController|null = null;
let cancelCloudConsent:(()=>void)|null = null;
// The app redraws its overview often; entrance motion belongs to the first view only.
let heroIntroduced = false;
let review: {capture:Capture; extraction:Extraction|null; selectedIds:Set<string>} | null = null;
let captureDraft={text:'',referenceDate:today()};
try { const draft=JSON.parse(localStorage.getItem('diao-tham.capture-draft.v1')||'null'); if(draft&&typeof draft.text==='string'&&typeof draft.referenceDate==='string')captureDraft=draft; } catch { /* Keep the existing draft untouched if it cannot be read. */ }
let dialogOwner='';
type UndoItem = {kind:'task'; item:Task; index:number} | {kind:'capture'; item:Capture; index:number};
let undoItem:UndoItem|null = null;
let toastTimer:ReturnType<typeof setTimeout>;
let selectedCalendarDate = '';
let visibleCalendarMonth = '';
let account:User|null = null;
let accountReady = false;
let accountError = '';
let accountPopupOpen = false;
let localSetupOpen = false;
let accountRefreshPending = false;

function saveEntry(next:Entry):boolean {
  try {
    if(next.mode==='local'){localStorage.setItem(localProfileKey,JSON.stringify(next));previousLocal=next;}
    localStorage.setItem(choiceKey,'1');localStorage.setItem(modeKey,JSON.stringify(next)); entry=next;hasMadeChoice=true;return true;
  }
  catch { return false; }
}
function clearEntry():boolean {
  try { localStorage.setItem(choiceKey,'1');localStorage.removeItem(modeKey);entry=null;hasMadeChoice=true;return true; }
  catch { return false; }
}

function accountName() { return account?.displayName || account?.email || 'Google account'; }
function authErrorMessage(error:unknown):string {
  const code=(error as {code?:string})?.code;
  if(code==='auth/popup-closed-by-user' || code==='auth/cancelled-popup-request') return 'The Google sign-in window was closed. Try again when ready.';
  if(code==='auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups and try again.';
  if(code==='auth/unauthorized-domain') return 'This address is not authorized for Google sign-in in Firebase.';
  if(code==='auth/operation-not-allowed') return 'Google sign-in needs to be enabled in Firebase Authentication.';
  return 'Google sign-in could not be completed. Check the connection and try again.';
}
function showSignIn() {
  const dialog=document.querySelector<HTMLDialogElement>('#auth-modal');
  if(!dialog || entry) return;
  localSetupOpen=false;
  dialog.innerHTML=`<div class="auth-card"><div class="auth-mark"><img src="/brand/diao-tham-mark.svg" alt="" width="48" height="48"></div><span class="eyebrow">A LITTLE LESS ON YOUR MIND</span><h2 id="auth-title">Welcome to Diao Tham</h2><p>Choose how you want to get started.</p><div class="auth-actions"><button class="button google-signin" id="local-setup">Set up on this device</button><button class="button google-signin" id="google-signin-basic" ${!accountReady||!googleSignInEnabled?'disabled':''}><span class="google-letter" aria-hidden="true">G</span>${accountReady?'Continue with Google':'Checking sign-in…'}</button><button class="button google-signin google-signin-basic" id="google-signin-calendar" ${!accountReady||!googleSignInEnabled?'disabled':''}>Sign in and connect Calendar</button><span>Google Calendar access is optional. You can connect later.</span></div><p class="auth-local-note">Tasks stay in this browser and are visible to anyone using it. Signing in does not sync or isolate your tasks.</p><p id="auth-error" class="form-error" role="alert">${esc(accountError)}</p></div>`;
  dialog.setAttribute('aria-labelledby','auth-title');
  dialog.oncancel=event=>event.preventDefault();
  if(!dialog.open)dialog.showModal();
  document.querySelector('#local-setup')!.addEventListener('click',showLocalSetup);
  const buttons=dialog.querySelectorAll<HTMLButtonElement>('#google-signin-calendar, #google-signin-basic');
  buttons.forEach(button=>button.addEventListener('click',async()=>{
    buttons.forEach(item=>item.disabled=true);
    try {
      accountPopupOpen=true;
      if (!account || button.id==='google-signin-calendar') {
        const result=await signInGoogle(button.id==='google-signin-calendar');
        setCalendarToken(result.calendarToken); account=result.user;
      }
      if(!saveEntry({mode:'google',name:'',timeZone:defaultZone,localEngine:'device'})) throw new Error('Could not save your choice on this device.');
      accountError='';
      dialog.close(); render();
    } catch(error) {
      accountError=(error as Error).message==='Could not save your choice on this device.' ? (error as Error).message : authErrorMessage(error);
      const text=document.querySelector('#auth-error');if(text)text.textContent=accountError;
      buttons.forEach(item=>item.disabled=false);
    } finally { accountPopupOpen=false; }
  }));
}
function showLocalSetup() {
  const dialog=document.querySelector<HTMLDialogElement>('#auth-modal'); if(!dialog)return;
  localSetupOpen=true;
  dialog.innerHTML=`<div class="auth-card local-setup-card"><span class="eyebrow">ON THIS DEVICE</span><h2 id="auth-title">Set up your local space</h2><p>Use this browser without a Google account. Nothing is sent to cloud AI unless you choose it and confirm.</p><form id="local-form" class="settings-form"><label>Display name (optional)<input id="local-name" maxlength="80" autocomplete="nickname" placeholder="Your name" value="${esc(previousLocal?.name||'')}"></label><label>Time zone<input id="local-zone" value="${esc(previousLocal?.timeZone||defaultZone)}" required></label><div class="auth-permission" aria-live="polite"><strong>On-device AI readiness</strong><span id="local-readiness">Checking English and Thai support…</span><small>This check does not download a model. On-device AI needs a ready model and support for your message language. You can continue with the basic helper at any time.</small><button type="button" class="text-button" id="check-local">Check again</button></div><label>How to extract tasks<select id="local-engine"><option value="device">On-device AI</option><option value="basic">Basic helper (no AI)</option></select></label><p class="auth-local-note">Tasks are stored in this browser and visible to anyone using it. This profile is not an account.</p><p id="local-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" id="local-back">Back</button><button type="submit" class="button primary" id="local-continue">Continue</button></div></form></div>`;
  document.querySelector('#local-back')!.addEventListener('click',showSignIn);
  const readiness=document.querySelector<HTMLElement>('#local-readiness')!;
  const selector=document.querySelector<HTMLSelectElement>('#local-engine')!;
  selector.value=previousLocal?.localEngine||'basic';
  let userChangedEngine=!!previousLocal;
  let checkSequence=0;
  selector.addEventListener('change',()=>{userChangedEngine=true;});
  const describe=(value:string)=>({available:'available',downloadable:'available to download',downloading:'downloading',unavailable:'unavailable',unsupported:'not supported',error:'could not check'}[value]||'unknown');
  const check=async()=>{
    const current=++checkSequence;
    const checkButton=dialog.querySelector<HTMLButtonElement>('#check-local')!;
    checkButton.disabled=true;
    readiness.textContent='Checking English and Thai support…';
    try {
      const [english,thai]=await Promise.all([checkLocalCapability('Hello'),checkLocalCapability('สวัสดี')]);
      if(!readiness.isConnected||current!==checkSequence)return;
      readiness.textContent=`English: ${describe(english.status)} · Thai: ${describe(thai.status)}.`;
      if(!userChangedEngine)selector.value=english.status==='available'?'device':'basic';
    } catch {
      if(!readiness.isConnected||current!==checkSequence)return;
      readiness.textContent='Could not check local AI. You can use the basic helper.';
      if(!userChangedEngine)selector.value='basic';
    } finally {
      if(checkButton.isConnected && current===checkSequence)checkButton.disabled=false;
    }
  };
  document.querySelector('#check-local')!.addEventListener('click',()=>void check()); void check();
  document.querySelector<HTMLFormElement>('#local-form')!.addEventListener('submit',event=>{
    event.preventDefault();
    const name=document.querySelector<HTMLInputElement>('#local-name')!.value.trim();
    const timeZone=document.querySelector<HTMLInputElement>('#local-zone')!.value.trim();
    const localEngine=selector.value==='device'?'device':'basic';
    try {
      new Intl.DateTimeFormat('en',{timeZone});
      if(!saveEntry({mode:'local',name,timeZone,localEngine}))throw new Error('Could not save your local setup. Check browser storage.');
      setCalendarToken(null);localSetupOpen=false;dialog.close();render();
    } catch(error) { document.querySelector('#local-error')!.textContent=(error as Error).message.startsWith('Could not save')?(error as Error).message:'Please enter a valid time zone, such as Asia/Bangkok.'; }
  });
}
function openAccount() {
  if(!entry){showSignIn();return;}
  const isLocal=entry.mode==='local';
  showDialog(`${modalHeader(isLocal?'Local space':'Google account')}<div class="account-panel"><strong>${esc(isLocal?(entry.name||'This device'):accountName())}</strong>${!isLocal&&account?.email?`<p>${esc(account.email)}</p>`:''}<p>Tasks are stored in this browser and are not separated by account or synced across devices.</p><button id="switch-mode" class="button secondary">Switch setup</button>${!isLocal&&account?'<button id="sign-out" class="button secondary">Sign out</button>':''}<p id="account-error" class="form-error" role="alert"></p></div>`);
  document.querySelector('#switch-mode')?.addEventListener('click',()=>{
    if(!clearEntry()){document.querySelector('#account-error')!.textContent='Could not update your choice. Check browser storage.';return;}
    setCalendarToken(null);document.querySelector<HTMLDialogElement>('#modal')?.close();render();
  });
  document.querySelector('#sign-out')?.addEventListener('click',async()=>{
    try { await signOutGoogle(); setCalendarToken(null); account=null; clearEntry(); document.querySelector<HTMLDialogElement>('#modal')?.close(); render(); }
    catch { document.querySelector('#account-error')!.textContent='Could not sign out. Please try again.'; }
  });
}

function engineLabel(value:Engine) {
  return value === 'basic' ? t('ตัวช่วยพื้นฐาน · ไม่ใช่ AI','Basic helper · not AI') : value === 'device' ? t('AI บนอุปกรณ์','On-device AI') : t('AI บนคลาวด์','Cloud AI');
}
function prettyDate(date:string) {
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00`));
}
function persist(patch:(copy:Data)=>void):boolean {
  if (readError) { notify(readError,true); return false; }
  try { data = commit(data,patch); return true; }
  catch(error) {
    notify(error instanceof StaleDataError
      ? 'Another tab changed your saved items. This change was not saved. Copy any unsaved text, then reload this tab.'
      : 'Storage unavailable. Nothing was saved. Please keep a copy of your text.',true);
    return false;
  }
}
function notify(message:string,error=false,undo=false) {
  clearTimeout(toastTimer);
  const toast = document.querySelector<HTMLDivElement>('#toast')!;
  toast.innerHTML = `<span>${esc(message)}</span>${undo?`<button id="undo-delete">${t('คืนค่า','Undo')}</button>`:''}`;
  toast.className = `toast visible ${error?'error':''}`;
  toast.setAttribute('role',error?'alert':'status');
  if (undo) document.querySelector('#undo-delete')?.addEventListener('click',()=>{
    const pending=undoItem;
    if(!pending)return;
    if(persist(copy=>{
      if(pending.kind==='task') {
        if(!copy.tasks.some(task=>task.id===pending.item.id))copy.tasks.splice(Math.min(pending.index,copy.tasks.length),0,pending.item);
      } else {
        if(!copy.captures.some(capture=>capture.id===pending.item.id))copy.captures.splice(Math.min(pending.index,copy.captures.length),0,pending.item);
      }
    })) { undoItem=null; render(); notify(pending.kind==='task'?'Task restored':'Message restored'); }
  });
  toastTimer = setTimeout(()=>toast.classList.remove('visible'),undo?10000:6000);
}
function refreshIcons() { createIcons({icons,attrs:{'stroke-width':1.8}}); }
function setBusy(value:boolean) {
  busy=value;
  const button=document.querySelector<HTMLButtonElement>('#capture-submit');
  if(button){button.disabled=value;button.innerHTML=`${icon(value?'loader-circle':'arrow-right',value?'spin':'')}${value?t('กำลังแยกงาน…','Working…'):t('เก็บและแยกงาน','Capture & extract')}`;refreshIcons();}
}
function stopExtraction(showNotice=true) {
  if(!busy)return;
  ++run;
  extractionController?.abort();extractionController=null;
  review=null;setBusy(false);
  if(showNotice)notify('Extraction stopped. Your original is in Saved messages.');
}
function saveCaptureDraft() {
  try { localStorage.setItem('diao-tham.capture-draft.v1',JSON.stringify(captureDraft)); } catch { /* The capture action reports any durable write failure. */ }
}
function renderMonthCalendar():string {
  if (!selectedCalendarDate) selectedCalendarDate=today();
  if (!visibleCalendarMonth) visibleCalendarMonth=selectedCalendarDate.slice(0,7);
  const dayCounts=new Map<string,number>();
  for(const task of data.tasks) if(task.calendarDate) dayCounts.set(task.calendarDate,(dayCounts.get(task.calendarDate)||0)+1);
  const selectedTasks=data.tasks.filter(task=>task.calendarDate===selectedCalendarDate);
  const days=monthDays(visibleCalendarMonth).map(date=>{
    if(!date)return '<span class="calendar-blank" aria-hidden="true"></span>';
    const count=dayCounts.get(date)||0;
    return `<button type="button" class="calendar-day ${date===selectedCalendarDate?'is-selected':''} ${date===today()?'is-today':''}" data-calendar-date="${date}" aria-label="${esc(prettyDate(date))}${count?`, ${count} marked task${count===1?'':'s'}`:''}" aria-pressed="${date===selectedCalendarDate}"><span>${Number(date.slice(8))}</span>${count?'<span class="calendar-dot" aria-hidden="true"></span>':''}</button>`;
  }).join('');
  return `<section class="card calendar-card" aria-labelledby="calendar-heading"><div class="calendar-header"><div><span class="calendar-kicker">YOUR SCHEDULE</span><h2 id="calendar-heading">Calendar</h2></div><div class="calendar-nav"><button type="button" id="calendar-prev" aria-label="Previous month">‹</button><strong>${esc(monthTitle(visibleCalendarMonth))}</strong><button type="button" id="calendar-next" aria-label="Next month">›</button></div></div><div class="calendar-weekdays" aria-hidden="true">${['S','M','T','W','T','F','S'].map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-grid" aria-label="${esc(monthTitle(visibleCalendarMonth))}">${days}</div><div class="calendar-agenda"><div class="calendar-agenda-title">${esc(prettyDate(selectedCalendarDate))} <span>${selectedTasks.length} marked</span></div>${selectedTasks.length?`<ul>${selectedTasks.map(task=>`<li><span class="calendar-agenda-dot"></span><span>${esc(task.title)}${task.completedAt?' <small>· Done</small>':''}</span>${task.calendarTime?`<time>${esc(task.calendarTime)}</time>`:''}</li>`).join('')}</ul>`:'<p>No tasks marked for this day.</p>'}</div><button type="button" class="calendar-sync" id="sync-google-calendar">${icon('calendar-days')} Sync with Google Calendar ${icon('arrow-up-right')}</button><p class="calendar-sync-note">Marked tasks stay in this browser until you choose to sync.</p></section>`;
}
function render() {
  accountRefreshPending=false;
  // DOM replacement must settle consent and release any abandoned extraction.
  cancelCloudConsent?.();
  stopExtraction(false);
  const open = data.tasks.filter(task=>!task.completedAt);
  const due = open.filter(task=>task.dueDate && task.dueDate <= today());
  const pending = data.captures.filter(c=>c.status === 'pending');
  const aiConfigured = !!settings && !validateSettings(settings).length;
  const activeEngine:Engine = entry?.mode === 'local' ? entry.localEngine : 'cloud';
  document.documentElement.lang = locale;
  root.innerHTML = `
    <header class="topbar"><a class="brand" href="#" aria-label="Diao Tham home"><span class="brand-mark" aria-hidden="true"><img src="/brand/diao-tham-mark.svg" alt="" width="44" height="44"></span><span class="brand-wordmark">Diao <span class="brand-wordmark-accent">Tham</span><small>catch it. do it.</small></span></a>
      <div class="top-actions"><button class="account-button" id="account" aria-label="Account and setup">${esc(entry?.mode==='local' ? (entry.name||'Local space') : account ? accountName() : 'Choose setup')}</button></div></header>
    <main class="page">
      <section class="hero ${heroIntroduced?'':'hero-intro'}" aria-labelledby="headline">
        <div class="hero-copy"><span class="eyebrow hero-eyebrow"><span class="hero-eyebrow-line" aria-hidden="true"></span>A LITTLE LESS ON YOUR MIND</span>
          <h1 id="headline" aria-label="Catch it Make it happen"><span class="hero-title-line">Catch it</span> <span class="hero-title-line hero-title-accent">Make it <span class="hero-word">happen<svg class="hero-underline" viewBox="0 0 240 13" fill="none" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="hero-brand-spectrum" x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#4285f4"/><stop offset=".32" stop-color="#ea4335"/><stop offset=".65" stop-color="#fbbc05"/><stop offset="1" stop-color="#34a853"/></linearGradient></defs><path d="M3 9C56 2 152 1 237 7" stroke="url(#hero-brand-spectrum)" stroke-width="5" stroke-linecap="round"/></svg></span></span></h1>
          <p class="hero-description"><span class="hero-description-float">Turn a message into your next steps<br>Capture now. Plan when you’re ready</span></p>
          <span class="hero-note"><img src="/brand/google-calendar.png" width="18" height="18" alt="" aria-hidden="true"><span>Can connect to <strong>Google Calendar</strong></span></span>
        </div>
        <div class="hero-image"><img src="/images/desk-v1.webp" alt="A quiet desk with a blank notebook and blue pen. AI-generated image." fetchpriority="high" width="720" height="480"><div class="hero-image-note" aria-hidden="true"><span class="hero-note-check">${icon('check')}</span><span>Off your mind.<strong>Into your day.</strong></span><span class="hero-note-sparkle">${icon('sparkles')}</span></div></div>
      </section>
      <div class="workspace">
        <section class="capture-panel card" aria-labelledby="capture-heading"><div class="section-heading"><span class="section-icon blue">${icon('plus')}</span><div><h2 id="capture-heading">${t('มีอะไรต้องทำ?','What’s on your mind?')}</h2><p>${t('วางข้อความจากแชต หรือพิมพ์สิ่งที่นึกได้','Paste a message, or type a thought.')}</p></div><span class="shortcut">Ctrl ↵</span></div>
          <form id="capture-form"><label class="sr-only" for="capture-text">${t('ข้อความที่ต้องการเก็บ','Text to capture')}</label><textarea id="capture-text" rows="5" maxlength="12000" placeholder="${t('เช่น พรุ่งนี้ส่งสไลด์ก่อนเที่ยง แล้วทักร้านเรื่องใบเสร็จด้วย','e.g. Send the slides before noon tomorrow and ask the shop for a receipt.')}" required>${esc(captureDraft.text)}</textarea>
          <div class="capture-meta"><span id="char-count">${captureDraft.text.length.toLocaleString()} / 12,000</span><details class="date-details"><summary>${icon('clock-3')}${t('ข้อความของวันนี้','Message from today')}${icon('chevron-down')}</summary><label>${t('วันที่ของข้อความต้นฉบับ','Original message date')}<input id="reference-date" type="date" value="${esc(captureDraft.referenceDate)}" required></label><small>${esc(zone())}</small></details></div>
          <div class="capture-footer"><span class="cloud-mode-label">${icon(activeEngine==='cloud'?'cloud':'laptop')} ${esc(engineLabel(activeEngine))}</span><button class="button primary" id="capture-submit" type="submit" ${busy?'disabled':''}>${icon(busy?'loader-circle':'arrow-right',busy?'spin':'')}${busy?t('กำลังแยกงาน…','Working…'):t('เก็บและแยกงาน','Capture & extract')}</button></div>
          <p class="engine-caption">${activeEngine==='cloud'?'We’ll ask before sending this text to cloud AI':activeEngine==='device'?'On-device AI · the first request may download the model':'Local rules · no AI is used'}</p><div class="ai-status"><span>${icon(aiConfigured?'shield-check':'sparkles')}${activeEngine==='basic'?'Basic helper':!aiConfigured?'AI temporarily unavailable':activeEngine==='device'?'Local AI selected':'Cloud AI configured'}</span>${!aiConfigured&&activeEngine!=='basic'?'<span class="ai-status-note">Your message will be saved while AI is unavailable.</span>':''}</div><button class="saved-messages-link" id="show-inbox-shortcut" type="button">${icon('inbox')} Saved messages <span>${pending.length}</span></button></form>
          <div class="examples"><span>${t('ลองข้อความ','Try one')}</span><button data-example="multi">${t('งานจากแชต','A chat message')}${icon('arrow-up-right')}</button><button data-example="unclear">${t('วันที่ยังไม่ชัด','An unclear date')}${icon('arrow-up-right')}</button></div>
        </section>
        <aside class="overview">${renderMonthCalendar()}<section class="card today-card overview-summary"><div class="aside-title">${icon('calendar-days')}<h2>A little overview</h2><span>${prettyDate(today())}</span></div><div class="stat-row"><div><strong>${due.length}</strong><span>Due or overdue</span></div><div><strong>${open.length}</strong><span>Open tasks</span></div></div></section></aside>
      </div>
      ${pending.length?`<section class="pending-strip"><div>${icon('inbox')}<span><strong>${pending.length}</strong> saved messages waiting for review</span></div><button id="show-inbox">Open saved messages ${icon('arrow-right')}</button></section>`:''}
      <section class="tasks-section" aria-labelledby="tasks-heading"><div class="tasks-toolbar"><div><span class="eyebrow">YOUR SPACE</span><h2 id="tasks-heading">${t('งานของฉัน','My tasks')}<span class="count">${open.length}</span></h2></div><div class="filters" role="group" aria-label="${t('กรองงาน','Filter tasks')}">${[['open',t('ยังไม่เสร็จ','Open')],['today',t('ถึงกำหนด','Due')],['undated',t('ยังไม่กำหนดวัน','No date')],['done',t('เสร็จแล้ว','Done')]].map(([key,label])=>`<button data-filter="${key}" aria-pressed="${filter===key}" class="${filter===key?'active':''}">${label}</button>`).join('')}</div></div>
      <div id="task-list" class="task-list">${renderTasks()}</div></section>
      <footer class="footer"><span>${t('เก็บไว้ในเครื่องนี้ · ไม่ได้ซิงก์ข้ามอุปกรณ์','Saved in this browser · no cross-device sync')}</span><button id="export-data">${t('ดาวน์โหลดสำรองข้อมูล','Export a backup')}${icon('arrow-up-right')}</button><span class="made-with">FIREBASE AI LOGIC · CLOUD PROTOTYPE</span></footer>
    </main><dialog id="modal" class="modal"></dialog><dialog id="auth-modal" class="modal auth-modal"></dialog><div id="toast" class="toast" aria-live="polite"></div>`;
  heroIntroduced = true;
  bind(); refreshIcons();
  if(readError) notify(readError,true);
  if(!entry) showSignIn();
}
function renderTasks() {
  const tasks = data.tasks.filter(task=>filter==='done'?!!task.completedAt:!task.completedAt && (filter==='today'?!!task.dueDate&&task.dueDate<=today():filter==='undated'?!task.dueDate:true));
  const savedMessages=filter==='open'?data.captures.filter(c=>c.status==='pending'&&!data.tasks.some(task=>task.captureId===c.id)):[];
  if (!tasks.length&&!savedMessages.length) return `<div class="empty"><span class="empty-icon">${icon(filter==='done'?'check-check':'inbox')}</span><h3>${filter==='done'?'Your finished tasks live here':'Make room in your mind'}</h3><p>${filter==='done'?'Check off a task to see it here.':'Start with one message. Your saved tasks will appear here.'}</p>${filter==='open'?`<button class="text-button" id="focus-capture">Capture your first thought${icon('arrow-right')}</button>`:''}</div>`;
  const taskRows=tasks.map(task=>`<article class="task-row ${task.completedAt?'completed':''}"><button class="task-check" data-toggle="${esc(task.id)}" aria-label="${esc((task.completedAt?'Reopen: ':'Complete: ')+task.title)}">${task.completedAt?icon('check'):''}</button><div class="task-content"><h3>${esc(task.title)}</h3><div class="task-meta">${task.dueDate?`<span class="date-tag ${task.dueDate<today()&&!task.completedAt?'overdue':''}">${icon('calendar-days')}${prettyDate(task.dueDate)}${task.dueTime?' · '+esc(task.dueTime):''}</span>`:'<span>No due date</span>'}<span class="source-tag">${engineLabel(task.engine)}</span>${task.calendarDate?`<span>On calendar · ${esc(prettyDate(task.calendarDate))}${task.calendarTime?' · '+esc(task.calendarTime):''}</span>`:''}</div></div><div class="task-actions"><button class="mark-calendar" data-mark-calendar="${esc(task.id)}">${icon('calendar-days')}${task.calendarDate?'Edit calendar':'Mark in Calendar'}</button><button data-schedule="${esc(task.id)}" title="Add to Google Calendar" aria-label="Add to Google Calendar">${icon('arrow-up-right')}</button><button data-edit="${esc(task.id)}" title="Edit" aria-label="Edit">${icon('pencil')}</button><button data-delete="${esc(task.id)}" title="Delete" aria-label="Delete">${icon('trash-2')}</button></div></article>`).join('');
  const savedRows=savedMessages.map(capture=>`<article class="task-row saved-task-row"><div class="task-content"><h3>${esc(capture.text)}</h3><p class="saved-task-label">Saved message · not yet a task</p></div><div class="saved-task-actions"><button class="saved-task-open" data-open-capture="${esc(capture.id)}">Review message</button><button class="saved-task-delete" data-delete-capture="${esc(capture.id)}" title="Delete saved message" aria-label="${esc('Delete saved message: '+capture.text)}">${icon('trash-2')}</button></div></article>`).join('');
  return taskRows+savedRows;
}
function bind() {
  document.querySelector('#account')?.addEventListener('click',openAccount);
  document.querySelector('#sync-google-calendar')?.addEventListener('click',openGoogleSync);
  document.querySelectorAll<HTMLButtonElement>('[data-calendar-date]').forEach(button=>button.addEventListener('click',()=>{
    selectedCalendarDate=button.dataset.calendarDate!;render();
    document.querySelector<HTMLButtonElement>(`[data-calendar-date="${selectedCalendarDate}"]`)?.focus();
  }));
  for(const [id,offset] of [['calendar-prev',-1],['calendar-next',1]] as const) {
    document.querySelector(`#${id}`)?.addEventListener('click',()=>{
      visibleCalendarMonth=shiftMonth(visibleCalendarMonth,offset);
      selectedCalendarDate=today().startsWith(visibleCalendarMonth)?today():`${visibleCalendarMonth}-01`;
      render();
      document.querySelector<HTMLButtonElement>(`#${id}`)?.focus();
    });
  }
  const textarea = document.querySelector<HTMLTextAreaElement>('#capture-text')!;
  textarea.addEventListener('input',()=>{captureDraft.text=textarea.value;saveCaptureDraft();document.querySelector('#char-count')!.textContent=`${textarea.value.length.toLocaleString()} / 12,000`;});
  document.querySelector<HTMLInputElement>('#reference-date')!.addEventListener('change',event=>{captureDraft.referenceDate=(event.target as HTMLInputElement).value;saveCaptureDraft();});
  textarea.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();document.querySelector<HTMLFormElement>('#capture-form')!.requestSubmit();}});
  document.querySelector('#capture-form')?.addEventListener('submit',event=>{
    event.preventDefault(); if(busy)return;
    const text=textarea.value.trim(); if(!text)return;
    const date=document.querySelector<HTMLInputElement>('#reference-date')!.value;
    if (!date) return;
    const started=performance.now();
    const capture:Capture={id:crypto.randomUUID(),text,referenceDate:date,timeZone:zone(),createdAt:new Date().toISOString(),status:'pending'};
    if(!persist(copy=>copy.captures.unshift(capture)))return;
    lastCaptureMs=performance.now()-started;
    captureDraft={text:'',referenceDate:today()};saveCaptureDraft();
    render(); void beginExtraction(capture);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach(button=>button.addEventListener('click',()=>{
    textarea.value=button.dataset.example==='multi'?t('พรุ่งนี้ช่วยส่งสไลด์ก่อนเที่ยง แล้วฝากทักร้านเรื่องใบเสร็จด้วยนะ','Please send the slides before noon tomorrow and ask the shop for a receipt.'):t('ศุกร์หน้าฝากเช็กเอกสารหน่อย แล้วอย่าลืมซื้อไข่ด้วย','Please review the document next Friday and remember to buy eggs.');
    textarea.dispatchEvent(new Event('input'));textarea.focus();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter!;render();}));
  document.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button=>button.addEventListener('click',()=>{
    if(persist(copy=>{const task=copy.tasks.find(x=>x.id===button.dataset.toggle)!;task.completedAt=task.completedAt?null:new Date().toISOString();})){render();}
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(button=>button.addEventListener('click',()=>{
    const target=data.tasks.find(x=>x.id===button.dataset.delete)!;
    const index=data.tasks.findIndex(x=>x.id===target.id);
    if(persist(copy=>{copy.tasks=copy.tasks.filter(x=>x.id!==target.id);})){undoItem={kind:'task',item:target,index};render();notify(t('ลบงานแล้ว','Task deleted'),false,true);}
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-delete-capture]').forEach(button=>button.addEventListener('click',()=>{
    const index=data.captures.findIndex(capture=>capture.id===button.dataset.deleteCapture);
    const target=data.captures[index];
    if(!target || target.status!=='pending' || data.tasks.some(task=>task.captureId===target.id))return;
    if(persist(copy=>{copy.captures=copy.captures.filter(capture=>capture.id!==target.id);})){if(review?.capture.id===target.id)review=null;undoItem={kind:'capture',item:target,index};render();notify('Saved message deleted',false,true);}
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button=>button.addEventListener('click',()=>openEdit(data.tasks.find(x=>x.id===button.dataset.edit)!)));
  document.querySelectorAll<HTMLButtonElement>('[data-mark-calendar]').forEach(button=>button.addEventListener('click',()=>openMarkCalendar(data.tasks.find(x=>x.id===button.dataset.markCalendar)!)));
  document.querySelectorAll<HTMLButtonElement>('[data-open-capture]').forEach(button=>button.addEventListener('click',()=>{
    const capture=data.captures.find(x=>x.id===button.dataset.openCapture);
    if(!capture)return;
    if(capture.reviewDraft?.extraction.candidates.length){review={capture,extraction:structuredClone(capture.reviewDraft.extraction),selectedIds:new Set(capture.reviewDraft.selectedIds)};openReview();}
    else openSavedMessage(capture);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-schedule]').forEach(button=>button.addEventListener('click',()=>openCalendar(data.tasks.find(x=>x.id===button.dataset.schedule)!)));
  document.querySelector('#focus-capture')?.addEventListener('click',()=>textarea.focus());
  document.querySelector('#show-inbox')?.addEventListener('click',openInbox);
  document.querySelector('#show-inbox-shortcut')?.addEventListener('click',openInbox);
  document.querySelector('#export-data')?.addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`diao-tham-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
}
function showDialog(content:string,owner='other') {
  const dialog = document.querySelector<HTMLDialogElement>('#modal')!;
  cancelCloudConsent?.();
  if(dialogOwner===`extract-${run}`&&dialogOwner!==owner)stopExtraction(false);
  if(dialogOwner==='review')saveReviewDraft();
  dialogOwner=owner;
  dialog.innerHTML=content;
  dialog.setAttribute('aria-labelledby','modal-title');
  const close=()=>{if(dialogOwner==='review'&&!saveReviewDraft())return;if(dialogOwner.startsWith('extract-'))stopExtraction();dialog.close();};
  dialog.querySelectorAll('[data-close], [data-stop-extraction]').forEach(button=>button.addEventListener('click',close));
  dialog.oncancel=event=>{if(dialogOwner==='review'&&!saveReviewDraft())event.preventDefault();else if(dialogOwner.startsWith('extract-'))stopExtraction();};
  dialog.onclose=()=>{if(!dialog.isConnected||dialog.open)return;if(dialogOwner==='review')saveReviewDraft();if(dialogOwner.startsWith('extract-'))stopExtraction();dialogOwner='';if(accountRefreshPending)render();};
  if(!dialog.open)dialog.showModal();
  refreshIcons();
  return dialog;
}
const modalHeader=(title:string,subtitle='')=>`<div class="modal-header"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="icon-button" data-close aria-label="${t('ปิด','Close')}">${icon('x')}</button></div>`;
async function beginExtraction(capture:Capture, forced?:Engine) {
  if(dialogOwner==='review')saveReviewDraft();
  const selected:Engine=forced||(entry?.mode==='local'?entry.localEngine:'cloud');
  extractionController?.abort();
  const controller=new AbortController();extractionController=controller;
  const currentRun=++run;setBusy(true);review={capture,extraction:null,selectedIds:new Set()};
  const owner=`extract-${currentRun}`;
  showDialog(`${modalHeader(t('เก็บข้อความไว้แล้ว','Your text is saved'),t('กำลังจัดเป็นรายการงาน','Turning it into tasks'))}<div class="processing">${icon('loader-circle','spin')}<h3>${esc(engineLabel(selected))}</h3><p>${selected==='device'?'Checking for a ready local model. Your original is saved.':'The original is safe in your inbox.'}</p>${selected==='device'?'<button class="button secondary" id="use-basic">Use basic helper</button><button class="button secondary" id="try-cloud">Try cloud AI</button>':''}<button class="text-button" data-stop-extraction>Stop and keep message</button></div>`,owner);
  document.querySelector('#use-basic')?.addEventListener('click',()=>void beginExtraction(capture,'basic'));
  document.querySelector('#try-cloud')?.addEventListener('click',()=>void beginExtraction(capture,'cloud'));
  try {
    let result:Extraction;
    if(selected==='basic')result=extractBasic(capture.text,{referenceDate:capture.referenceDate,timeZone:capture.timeZone,locale});
    else {
      if(!settings || validateSettings(settings).length)throw new Error('AI is temporarily unavailable. You can still use the basic helper.');
      if(selected==='cloud'){
        const decision=await cloudConsent(capture.text,owner);
        if(decision!=='approved'){
          if(currentRun===run){
            setBusy(false);review=null;
            const dialog=document.querySelector<HTMLDialogElement>('#modal');
            if(decision==='kept'&&dialog?.open&&dialogOwner===owner) openSavedMessage(capture,true);
            else {if(!dialog?.open||dialogOwner===owner)render();notify('Original saved in Saved messages. Nothing was sent to cloud AI.');}
          }
          return;
        }
        if(currentRun!==run)return;
      }
      result=await extractFirebase(capture.text,{referenceDate:capture.referenceDate,timeZone:capture.timeZone,locale},settings,selected,controller.signal);
    }
    if(currentRun!==run)return;
    setBusy(false);lastExtraction=result;
    saveExtractedTasks(capture,result,owner);
  } catch(error){
    if(currentRun!==run)return;setBusy(false);
    if(!document.querySelector<HTMLDialogElement>('#modal')?.open||dialogOwner!==owner){if(!document.querySelector<HTMLDialogElement>('#modal')?.open)render();notify(t('แยกไม่สำเร็จ แต่ต้นฉบับยังอยู่ในกล่องข้อความ','Extraction failed. Your original is in the inbox.'),true);return;}
    const errorCode=(error as {code?:string})?.code;
    const message=errorCode==='device-unavailable'?'On-device AI is not ready for this message. Your original is saved.' : errorCode==='cloud-unavailable'||errorCode==='setup-required'?'AI is temporarily unavailable. Your message is saved.'
      :(error as Error).message;
    showDialog(`${modalHeader(t('ต้นฉบับยังอยู่ครบ','Your original is still saved'))}<div class="notice error-notice">${esc(message)}</div><div class="dialog-actions"><button class="button secondary" id="fallback-basic">${t('แยกด้วยตัวช่วยพื้นฐาน','Use the basic helper')}</button>${settings&&!validateSettings(settings).length?`<button class="button primary" id="fallback-cloud">${selected==='cloud'?'Try cloud AI again':'Try cloud AI'}</button>`:''}</div>`);
    document.querySelector('#fallback-basic')!.addEventListener('click',()=>void beginExtraction(capture,'basic'));
    document.querySelector('#fallback-cloud')?.addEventListener('click',()=>void beginExtraction(capture,'cloud'));
  } finally {
    controller.abort();
    if(currentRun===run){extractionController=null;setBusy(false);}
  }
}
function saveExtractedTasks(capture:Capture,result:Extraction,owner:string) {
  let added=0;
  if(!persist(copy=>{added=recordExtraction(copy,capture.id,result,new Date().toISOString());})) {
    const dialog=document.querySelector<HTMLDialogElement>('#modal');
    if(dialog?.open&&dialogOwner===owner) {
      showDialog(`${modalHeader('Could not save tasks')}<p class="dialog-intro">Your original message is still saved. Copy any unsaved work if needed, then try again.</p><div class="dialog-actions"><button class="button primary" id="retry-extraction-save">Try saving again</button></div>`,owner);
      document.querySelector('#retry-extraction-save')!.addEventListener('click',()=>saveExtractedTasks(capture,result,owner));
    }
    return;
  }
  review=null;
  const dialog=document.querySelector<HTMLDialogElement>('#modal');
  if(!dialog?.open||dialogOwner!==owner){if(!dialog?.open)render();notify(added?`${added} tasks saved to My tasks.`:'Original saved. No new tasks were added.');return;}
  const savedTasks=data.tasks.filter(task=>task.captureId===capture.id);
  const content=savedTasks.length
    ? `<p class="dialog-intro">${added?`${added} task${added===1?'':'s'} saved to My tasks. Check the details before acting.`:'This message has already been processed. Check My tasks for its saved items.'}</p><div class="result-task-list">${savedTasks.map(task=>`<div class="result-task"><strong>${esc(task.title)}</strong><span>${candidateDeadline(task)}</span></div>`).join('')}</div>`
    : '<p class="dialog-intro">No clear tasks found. Your original is still in Saved messages.</p>';
  const resultDialog=showDialog(`${modalHeader(`${savedTasks.length} task${savedTasks.length===1?'':'s'} found`,`${engineLabel(result.engine)} · ${Math.max(1,Math.round(result.durationMs))} ms`)}${content}<div class="dialog-actions"><button class="button secondary" id="review-later">Review later</button>${savedTasks.length?'<button class="button primary" id="result-add-calendar">Add to Calendar</button>':''}</div>`,owner);
  resultDialog.addEventListener('close',()=>{if(!resultDialog.isConnected||resultDialog.open)return;filter='open';render();}, {once:true});
  document.querySelector('#review-later')!.addEventListener('click',()=>resultDialog.close());
  document.querySelector('#result-add-calendar')?.addEventListener('click',()=>openResultCalendar(capture.id));
}
function openResultCalendar(captureId:string) {
  const tasks=data.tasks.filter(task=>task.captureId===captureId);
  if(!tasks.length){notify('These tasks are no longer available.');return;}
  const rows=tasks.map((task,index)=>{
    // Existing marks take precedence over the extracted deadline, even if they have no time.
    const date=task.calendarDate||task.dueDate||'';
    const time=task.calendarDate?(task.calendarTime||''):(task.dueTime||'');
    return `<article class="result-calendar-row" data-result-task="${esc(task.id)}"><label class="result-calendar-select"><input type="checkbox" checked aria-label="Select ${esc(task.title)}"><strong>${esc(task.title)}</strong></label><div class="form-grid"><label>Calendar date<input type="date" data-result-date value="${esc(date)}"></label><label>Time (optional)<input type="time" data-result-time value="${esc(time)}"></label></div></article>`;
  }).join('');
  const dialog=showDialog(`${modalHeader('Add to Calendar')}<p class="dialog-intro">Choose which tasks to add and check each date and time. Suggested values come from the extracted deadline; change them if you want a different calendar time.</p><p class="small-copy">This adds to the calendar in this app only. Google Calendar is updated separately when you choose Sync.</p><form id="result-calendar-form" class="settings-form"><div class="result-calendar-list">${rows}</div><p id="result-calendar-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" id="result-calendar-cancel">Review later</button><button type="submit" class="button primary">Add selected to Calendar</button></div></form>`);
  dialog.querySelector<HTMLButtonElement>('#result-calendar-cancel')!.addEventListener('click',()=>dialog.close());
  dialog.querySelector<HTMLFormElement>('#result-calendar-form')!.addEventListener('submit',event=>{
    event.preventDefault();
    const error=dialog.querySelector<HTMLElement>('#result-calendar-error')!;
    const marks:ResultCalendarMark[]=[];
    dialog.querySelectorAll<HTMLElement>('[data-result-task]').forEach(row=>{
      if(!row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked)return;
      marks.push({taskId:row.dataset.resultTask!,date:row.querySelector<HTMLInputElement>('[data-result-date]')!.value,time:row.querySelector<HTMLInputElement>('[data-result-time]')!.value});
    });
    try { markResultTasks(structuredClone(data),captureId,marks); }
    catch(reason) { error.textContent=reason instanceof Error?reason.message:'Check the selected tasks and dates.'; return; }
    if(persist(copy=>markResultTasks(copy,captureId,marks))){
      selectedCalendarDate=marks[0].date;visibleCalendarMonth=marks[0].date.slice(0,7);filter='open';
      dialog.close();render();notify(`${marks.length} task${marks.length===1?'':'s'} added to the in-app calendar.`);
    } else error.textContent='Could not save the calendar marks. Your tasks are still in My tasks.';
  });
}
function cloudConsent(text:string,owner:string):Promise<'approved'|'kept'|'closed'> {
  return new Promise(resolve=>{
    const dialog=showDialog(`${modalHeader(t('ใช้ AI บนคลาวด์กับข้อความนี้?','Use cloud AI for this text?'))}<p class="dialog-intro">${t('ข้อความด้านล่างจะถูกส่งไปยังโมเดล Google ผ่าน Firebase AI Logic เพื่อแยกงาน ไม่ส่งรายการงานอื่นของคุณ','The text below will be sent to a Google model through Firebase AI Logic. Your other saved tasks are not included.')}</p><blockquote class="source-preview">${esc(text)}</blockquote><div class="dialog-actions"><button class="button secondary" id="decline-cloud">${t('เก็บไว้ก่อน','Keep it local')}</button><button class="button primary" id="approve-cloud">${icon('cloud')}${t('ส่งข้อความนี้ให้ AI','Send this text to AI')}</button></div>`,owner);
    let settled=false;
    const finish=(decision:'approved'|'kept'|'closed')=>{if(settled)return;settled=true;if(cancelCloudConsent===closed)cancelCloudConsent=null;dialog.removeEventListener('close',closed);resolve(decision);};
    const closed=()=>finish('closed');dialog.addEventListener('close',closed,{once:true});
    cancelCloudConsent=closed;
    document.querySelector('#decline-cloud')!.addEventListener('click',()=>finish('kept'));
    document.querySelector('#approve-cloud')!.addEventListener('click',()=>{
      finish('approved');showDialog(`${modalHeader(t('กำลังแยกงานบนคลาวด์','Extracting with cloud AI'))}<div class="processing">${icon('loader-circle','spin')}<p>${t('ต้นฉบับเก็บไว้ในเครื่องแล้ว','Your original is already saved locally.')}</p><button class="text-button" data-stop-extraction>Stop and keep message</button><small>Stopping cannot recall text already sent.</small></div>`,owner);
    });
  });
}
function candidateDeadline(candidate:Candidate) {
  if(candidate.dueDate) return `Due ${prettyDate(candidate.dueDate)}${candidate.dueTime?' · '+esc(candidate.dueTime):' · no time set'}`;
  if(candidate.dueTime) return `${esc(candidate.dueTime)} · date needed`;
  if(candidate.needsReview&&/(confirm.*date|ambig|unclear|กรุณายืนยันวันที่|ไม่ชัด)/i.test(candidate.reviewReason))return 'Date needs review';
  return 'No due date';
}
function englishReviewReason(candidate:Candidate) {
  // Old saved drafts can contain system copy produced before the English-only UI.
  // Never translate the title or source evidence the user supplied.
  return /[\u0E00-\u0E7F]/.test(candidate.reviewReason)
    ? 'Please check the task, date and time against the original message.'
    : candidate.reviewReason;
}
function candidateFields(candidate:Candidate,index:number) {
  const selected=review?.selectedIds.has(candidate.id)??true;
  const reason=englishReviewReason(candidate);
  return `<article class="candidate" data-candidate="${candidate.id}"><div class="candidate-title"><input type="checkbox" id="select-${index}" name="selected" value="${candidate.id}" ${selected?'checked':''} aria-label="Select task ${index+1}"><input class="task-title-input" id="title-${index}" value="${esc(candidate.title)}" maxlength="200" ${selected?'required':''} aria-label="Task title ${index+1}"></div><div class="candidate-deadline" id="deadline-summary-${index}">${icon('calendar-days')}<span>${candidateDeadline(candidate)}</span></div><details><summary>${candidate.needsReview?'<span class="review-dot"></span>Check date & details':'Date & original text'}${icon('chevron-down')}</summary><div class="candidate-details"><div class="form-grid"><label>Due date<input id="date-${index}" type="date" value="${esc(candidate.dueDate||'')}"></label><label>Due time (optional)<input id="time-${index}" type="time" value="${esc(candidate.dueTime||'')}"></label></div>${reason?`<p class="review-reason">${esc(reason)}</p>`:''}<blockquote>${esc(candidate.evidence)}</blockquote></div></details></article>`;
}
function reviewCounts() {
  const candidates=review?.extraction?.candidates||[];
  const found=candidates.filter(candidate=>candidate.reviewReason!=='Added manually'&&candidate.reviewReason!=='เพิ่มด้วยตัวเอง').length;
  return { found, selected:review?.selectedIds.size||0, total:candidates.length };
}
function updateReviewSummary() {
  const counts=reviewCounts();
  const selected=document.querySelector('#review-selection-count');
  if(selected)selected.textContent=`${counts.selected} of ${counts.total} selected`;
  review?.extraction?.candidates.forEach((candidate,index)=>{
    const summary=document.querySelector(`#deadline-summary-${index} span`);
    if(summary)summary.innerHTML=candidateDeadline(candidate);
  });
}
function openReview() {
  if(!review?.extraction)return;
  const {capture,extraction}=review;
  const counts=reviewCounts();
  showDialog(`${modalHeader(`${counts.found} task${counts.found===1?'':'s'} found`,`${engineLabel(extraction.engine)} · ${Math.max(1,Math.round(extraction.durationMs))} ms`)}<form id="review-form"><div class="review-overview"><p>Check the actions and deadlines before saving.</p><span id="review-selection-count" aria-live="polite">${counts.selected} of ${counts.total} selected</span></div><div class="review-candidates">${extraction.candidates.length?extraction.candidates.map(candidateFields).join(''):`<div class="empty small">${icon('file-text')}<h3>No clear tasks found</h3><p>The original is saved. You can add a task yourself.</p></div>`}</div><button type="button" class="text-button add-manual" id="add-manual">${icon('plus')}Add a task</button><button type="button" class="text-button" id="dismiss-capture">No tasks to keep from this message</button><div class="dialog-actions sticky"><button class="button secondary" type="button" id="keep-draft">Review later</button><button class="button primary" type="submit">${icon('check')}Save selected tasks</button></div></form>`,'review');
  const form=document.querySelector<HTMLFormElement>('#review-form')!;
  form.addEventListener('input',()=>{saveReviewDraft();updateReviewSummary();});
  form.addEventListener('change',()=>{
    extraction.candidates.forEach((candidate,index)=>{document.querySelector<HTMLInputElement>(`#title-${index}`)!.required=document.querySelector<HTMLInputElement>(`#select-${index}`)!.checked;});
    saveReviewDraft();updateReviewSummary();
  });
  document.querySelector('#keep-draft')!.addEventListener('click',()=>{if(!saveReviewDraft())return;document.querySelector<HTMLDialogElement>('#modal')!.close();render();});
  document.querySelector('#dismiss-capture')!.addEventListener('click',()=>{
    if(persist(copy=>{const item=copy.captures.find(x=>x.id===capture.id)!;item.status='reviewed';delete item.reviewDraft;})){
      review=null;document.querySelector<HTMLDialogElement>('#modal')!.close();render();notify(t('ทบทวนข้อความนี้แล้ว ไม่เพิ่มงาน','Message reviewed. No tasks added.'));
    }
  });
  document.querySelector('#add-manual')!.addEventListener('click',()=>{
    syncReviewInputs();
    const candidate:Candidate={id:crypto.randomUUID(),title:'',dueDate:null,dueTime:null,evidence:capture.text,needsReview:true,reviewReason:t('เพิ่มด้วยตัวเอง','Added manually')};
    extraction.candidates.push(candidate);review!.selectedIds.add(candidate.id);saveReviewDraft(false);openReview();
    document.querySelector<HTMLInputElement>(`#title-${extraction.candidates.length-1}`)?.focus();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();syncReviewInputs();
    const chosen=extraction.candidates.filter(x=>review!.selectedIds.has(x.id));
    if(!chosen.length){notify(t('เลือกอย่างน้อยหนึ่งงาน หรือเลือกว่าข้อความนี้ไม่มีงานที่ต้องเก็บ','Select a task, or choose that this message has no tasks to keep.'),true);return;}
    if(chosen.some(x=>!x.title.trim() || (x.dueTime&&!x.dueDate))){notify(t('กรอกชื่องาน และระบุวันที่หากใส่เวลากำหนดส่ง','Add a title and a due date when setting a due time.'),true);return;}
    const newTasks=chosen.filter(candidate=>!data.tasks.some(x=>x.captureId===capture.id&&x.id===candidate.id));
    if(persist(copy=>{copy.tasks.unshift(...newTasks.map(candidate=>({...candidate,title:candidate.title.trim(),captureId:capture.id,createdAt:new Date().toISOString(),completedAt:null,engine:extraction.engine})));const item=copy.captures.find(x=>x.id===capture.id)!;item.status='reviewed';delete item.reviewDraft;})){
      review=null;filter='open';document.querySelector<HTMLDialogElement>('#modal')!.close();render();notify(t(`บันทึก ${newTasks.length} งานแล้ว`,`Saved ${newTasks.length} tasks`));
    }
  });
}
function syncReviewInputs() {
  if(!document.querySelector('#review-form'))return;
  review?.extraction?.candidates.forEach((candidate,index)=>{
    const title=document.querySelector<HTMLInputElement>(`#title-${index}`);
    if(!title)return;
    candidate.title=title.value;
    candidate.dueDate=document.querySelector<HTMLInputElement>(`#date-${index}`)?.value||null;
    candidate.dueTime=document.querySelector<HTMLInputElement>(`#time-${index}`)?.value||null;
    const selected=document.querySelector<HTMLInputElement>(`#select-${index}`);
    if(selected?.checked)review!.selectedIds.add(candidate.id);else review!.selectedIds.delete(candidate.id);
  });
}
function saveReviewDraft(sync=true):boolean {
  if(!review?.extraction)return true;
  if(sync)syncReviewInputs();
  const current=review;
  return persist(copy=>{
    const capture=copy.captures.find(x=>x.id===current.capture.id);
    if(capture?.status==='pending')capture.reviewDraft={extraction:structuredClone(current.extraction!),selectedIds:[...current.selectedIds]};
  });
}
function openSavedMessage(capture:Capture, justKept=false) {
  showDialog(`${modalHeader('Saved on this device','Your original is in Saved messages.')}
    <p class="dialog-intro">${justKept?'This message was not sent to cloud AI. ':''}The original stays in this browser. No tasks have been saved from this message yet.</p>
    <blockquote class="source-preview saved-message-preview">${esc(capture.text)}</blockquote>
    <p class="small-copy">Message date: ${esc(prettyDate(capture.referenceDate))}. You can make tasks using local rules or choose cloud AI later.</p>
    <p id="saved-message-error" class="form-error" role="alert"></p>
    <div class="dialog-actions"><button class="button secondary" id="edit-saved-copy">Edit a copy</button><button class="button secondary" id="saved-message-list">All saved messages</button><button class="button primary" id="saved-use-basic">Make tasks locally</button></div>
    <p class="small-copy">Local rules use the basic helper, not AI. The original stays saved.</p>
    <button class="text-button" id="saved-try-cloud">Try cloud AI ${icon('arrow-right')}</button>`);
  document.querySelector('#saved-use-basic')!.addEventListener('click',()=>void beginExtraction(capture,'basic'));
  document.querySelector('#saved-try-cloud')!.addEventListener('click',()=>void beginExtraction(capture,'cloud'));
  document.querySelector('#saved-message-list')!.addEventListener('click',openInbox);
  document.querySelector('#edit-saved-copy')!.addEventListener('click',()=>{
    if(captureDraft.text.trim()) {
      document.querySelector('#saved-message-error')!.textContent='Your editor already has a draft. Finish or clear it before editing a copy.';
      return;
    }
    captureDraft={text:capture.text,referenceDate:capture.referenceDate};
    saveCaptureDraft();document.querySelector<HTMLDialogElement>('#modal')!.close();render();
    document.querySelector<HTMLTextAreaElement>('#capture-text')?.focus();
    notify('A copy is ready to edit. Your saved original is unchanged.');
  });
}
function openInbox() {
  const pending=data.captures.filter(x=>x.status==='pending');
  showDialog(`${modalHeader('Saved messages','Original messages kept in this browser.')}${pending.length?`<div class="inbox-list">${pending.map(capture=>`<button class="inbox-item" data-reopen="${capture.id}"><span>${esc(capture.text)}</span><small>${prettyDate(capture.referenceDate)} · ${capture.reviewDraft?'Review tasks':'View message'} ${icon('arrow-right')}</small></button>`).join('')}</div>`:'<p class="dialog-intro">No messages are waiting for review.</p>'}`);
  document.querySelectorAll<HTMLButtonElement>('[data-reopen]').forEach(button=>button.addEventListener('click',()=>{
    const capture=data.captures.find(x=>x.id===button.dataset.reopen)!;
    if(capture.reviewDraft?.extraction.candidates.length){review={capture,extraction:structuredClone(capture.reviewDraft.extraction),selectedIds:new Set(capture.reviewDraft.selectedIds)};openReview();}
    else if(review?.capture.id===capture.id&&review.extraction?.candidates.length)openReview();else openSavedMessage(capture);
  }));
}
function openGoogleSync() {
  const marked = data.tasks.filter(task => !!task.calendarDate);
  const knownAccount = () => Boolean(googleSignInEnabled && account?.email && isCalendarConnected());
  const list = marked.length
    ? `<div class="inbox-list">${marked.map(task=>`<div class="inbox-item"><strong>${esc(task.title)}</strong><small>${esc(task.calendarDate)}${task.calendarTime ? ` · ${esc(task.calendarTime)} (30 minutes)` : ' · all day'}</small></div>`).join('')}</div>`
    : '<p class="dialog-intro">Mark a task in the calendar first, then come back to sync it.</p>';
  const dialog = showDialog(`${modalHeader('Sync with Google Calendar')}<p class="dialog-intro">Send the marked tasks below to the connected account’s primary Google Calendar. Timed tasks use a 30-minute event; tasks without a time are all-day events. Sync can update events previously created by this app; it does not delete events.</p>${list}<p class="small-copy">Time zone: ${esc(zone())}. Only the listed task titles, dates and times are sent.</p><p id="sync-status" class="form-error" role="status"></p><div class="dialog-actions"><button class="button secondary" id="sync-connect" type="button">${knownAccount()?`Connected: ${esc(account!.email)}`:'Connect Google Calendar'}</button><button class="button primary" id="sync-confirm" type="button" ${!marked.length||!knownAccount()?'disabled':''}>Sync now</button></div>`);
  const connect = dialog.querySelector<HTMLButtonElement>('#sync-connect')!;
  const confirm = dialog.querySelector<HTMLButtonElement>('#sync-confirm')!;
  const status = dialog.querySelector<HTMLElement>('#sync-status')!;
  connect.addEventListener('click', async()=>{
    if(knownAccount())return;
    connect.disabled=true; status.textContent='';
    try {
      if(!googleSignInEnabled)throw new Error('Google sign-in is temporarily unavailable.');
      accountPopupOpen=true;
      const result=await signInGoogle(true);
      account=result.user; setCalendarToken(result.calendarToken);
      if(!knownAccount())throw new Error('Google did not return Calendar authorization or an account email.');
      if(!dialog.isConnected || !dialog.open)return;
      connect.textContent=account?.email ? `Connected account: ${account.email}` : 'Google authorization available';
      confirm.disabled=!marked.length;
      status.textContent='Check the list, then select Sync now.';
    } catch(error) {
      if(dialog.isConnected && dialog.open)status.textContent=authErrorMessage(error);
    } finally { accountPopupOpen=false; if(connect.isConnected)connect.disabled=false; }
  });
  confirm.addEventListener('click', async()=>{
    if(!knownAccount() || !marked.length)return;
    confirm.disabled=true; connect.disabled=true; status.textContent='Syncing marked tasks…';
    try {
      const results=await syncMarkedTasks(marked,zone());
      if(!dialog.isConnected || !dialog.open)return;
      const created=results.filter(result=>result.status==='created').length;
      const updated=results.filter(result=>result.status==='updated').length;
      const failed=results.filter(result=>result.status==='failed');
      status.textContent=`Synced ${created+updated} of ${results.length} tasks (${created} new, ${updated} updated).${failed.length?' Some tasks could not be synced; see details below.':''}`;
      if(failed.length){
        const details=document.createElement('ul');
        for(const item of failed){const line=document.createElement('li');line.textContent=`${item.title}: ${item.error || 'Could not sync.'}`;details.append(line);}
        status.append(details);
      }
    } catch {
      if(dialog.isConnected && dialog.open)status.textContent='Could not sync. Your tasks remain saved in this browser.';
    } finally {
      if(confirm.isConnected)confirm.disabled=!knownAccount();
      if(connect.isConnected){connect.disabled=false;if(!knownAccount())connect.textContent='Connect Google Calendar';}
    }
  });
}
function openEdit(task:Task) {
  showDialog(`${modalHeader(t('แก้ไขงาน','Edit task'))}<form id="edit-form" class="settings-form"><label>${t('ชื่องาน','Task title')}<input id="edit-title" value="${esc(task.title)}" required maxlength="200"></label><div class="form-grid"><label>${t('กำหนดส่ง','Due date')}<input id="edit-date" type="date" value="${task.dueDate||''}"></label><label>${t('เวลากำหนดส่ง','Due time')}<input id="edit-time" type="time" value="${task.dueTime||''}"></label></div><details class="source-details"><summary>${t('ดูข้อความต้นฉบับ','View original text')}</summary><blockquote>${esc(task.evidence)}</blockquote></details><div class="dialog-actions"><button type="submit" class="button primary">${t('บันทึกการแก้ไข','Save changes')}</button></div></form>`);
  document.querySelector('#edit-form')!.addEventListener('submit',event=>{event.preventDefault();
    const title=document.querySelector<HTMLInputElement>('#edit-title')!.value.trim();
    const date=document.querySelector<HTMLInputElement>('#edit-date')!.value||null;
    const time=document.querySelector<HTMLInputElement>('#edit-time')!.value||null;
    if(!title||(time&&!date)){notify(t('กรอกชื่องานและวันที่ให้ครบ','Please enter a title and a date for the due time.'),true);return;}
    if(persist(copy=>Object.assign(copy.tasks.find(x=>x.id===task.id)!,{title,dueDate:date,dueTime:time}))){document.querySelector<HTMLDialogElement>('#modal')!.close();render();notify(t('แก้ไขแล้ว','Changes saved'));}
  });
}
function openMarkCalendar(task:Task) {
  const date=task.calendarDate||task.dueDate||today();
  showDialog(`${modalHeader(task.calendarDate?'Edit calendar mark':'Mark in Calendar',esc(task.title))}<form id="mark-calendar-form" class="settings-form"><p class="dialog-intro">Choose a date to show this task on your in-app calendar. This does not add it to Google Calendar.</p><div class="form-grid"><label>Calendar date<input type="date" id="mark-calendar-date" value="${esc(date)}" required></label><label>Time (optional)<input type="time" id="mark-calendar-time" value="${esc(task.calendarTime||'')}"></label></div><p class="small-copy">${esc(zone())} · Your selected calendar date is separate from the task deadline.</p><p id="mark-calendar-error" class="form-error" role="alert"></p><div class="dialog-actions">${task.calendarDate?'<button type="button" class="button secondary" id="remove-calendar-mark">Remove mark</button>':''}<button type="submit" class="button primary">${task.calendarDate?'Save calendar mark':'Mark in Calendar'}</button></div></form>`);
  document.querySelector<HTMLFormElement>('#mark-calendar-form')!.addEventListener('submit',event=>{
    event.preventDefault();
    const markedDate=document.querySelector<HTMLInputElement>('#mark-calendar-date')!.value;
    const markedTime=document.querySelector<HTMLInputElement>('#mark-calendar-time')!.value;
    if(!markedDate){document.querySelector('#mark-calendar-error')!.textContent='Choose a calendar date.';return;}
    if(persist(copy=>{const item=copy.tasks.find(x=>x.id===task.id);if(!item)throw new Error('Task not found.');item.calendarDate=markedDate;if(markedTime)item.calendarTime=markedTime;else delete item.calendarTime;})){
      selectedCalendarDate=markedDate;visibleCalendarMonth=markedDate.slice(0,7);
      document.querySelector<HTMLDialogElement>('#modal')!.close();render();notify('Added to the in-app calendar.');
    }
  });
  document.querySelector('#remove-calendar-mark')?.addEventListener('click',()=>{
    if(persist(copy=>{const item=copy.tasks.find(x=>x.id===task.id);if(!item)throw new Error('Task not found.');delete item.calendarDate;delete item.calendarTime;})){
      document.querySelector<HTMLDialogElement>('#modal')!.close();render();notify('Calendar mark removed.');
    }
  });
}
function openCalendar(task:Task) {
  if(entry?.mode==='local'){
    showDialog(`${modalHeader('Connect Google Calendar')}<div class="account-panel"><p>Google Calendar needs a Google account. Switch to Google setup to connect it; your tasks stay in this browser.</p><button id="calendar-switch" class="button primary">Choose Google setup</button><p id="calendar-switch-error" class="form-error" role="alert"></p></div>`);
    document.querySelector('#calendar-switch')!.addEventListener('click',()=>{
      if(!clearEntry()){document.querySelector('#calendar-switch-error')!.textContent='Could not update your choice. Check browser storage.';return;}
      setCalendarToken(null);document.querySelector<HTMLDialogElement>('#modal')?.close();render();
    });
    return;
  }
  const scheduledKey=calendarEventStorageKey(task.id,googleSignInEnabled ? account?.uid || '' : null);
  const previous=localStorage.getItem(scheduledKey);
  const defaultDate=task.dueDate && task.dueDate>=today()?task.dueDate:today();
  showDialog(`${modalHeader('Make time to do it',esc(task.title))}<form id="calendar-form" class="settings-form"><p class="dialog-intro">Pick when you want to work on this. This is separate from its deadline.</p>${previous?`<div class="notice">This task is already on your calendar. <a href="${esc(previous)}" target="_blank" rel="noopener noreferrer">Open Calendar ${icon('external-link')}</a></div>`:''}<div class="form-grid"><label>Start<input type="datetime-local" id="calendar-start" value="${defaultDate}T09:00" required></label><label>End<input type="datetime-local" id="calendar-end" value="${defaultDate}T09:30" required></label></div><p class="small-copy">${esc(zone())} · Only the task title and selected time are sent.</p><button class="button secondary" id="connect-google" type="button">${isCalendarConnected()?'Google authorization available':'Connect Google Calendar'}</button><p class="small-copy">If asked again, choose the Google account whose calendar you want to use. Calendar permission is checked when you add an event.</p><p id="calendar-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="button primary" id="calendar-submit" ${previous?'disabled':''}>${icon('calendar-days')}Confirm & add to Calendar</button></div></form>`);
  if(!googleSignInEnabled && googleClientId) void prepareCalendar().catch(error=>{const field=document.querySelector('#calendar-error');if(field)field.textContent=error.message;});
  document.querySelector('#connect-google')!.addEventListener('click',async()=>{
    if(isCalendarConnected())return;
    try {
      if(!googleSignInEnabled){
        if(!googleClientId)throw new Error('Google Calendar is temporarily unavailable. Please try again later.');
        await authorizeCalendar(googleClientId);
        document.querySelector('#connect-google')!.textContent='Google authorization available';
        return;
      }
      const priorUid=account?.uid;
      const start=document.querySelector<HTMLInputElement>('#calendar-start')!.value;
      const end=document.querySelector<HTMLInputElement>('#calendar-end')!.value;
      accountPopupOpen=true;
      const result=await signInGoogle(true);account=result.user;setCalendarToken(result.calendarToken);
      if(priorUid !== result.user.uid){
        openCalendar(task);
        document.querySelector<HTMLInputElement>('#calendar-start')!.value=start;
        document.querySelector<HTMLInputElement>('#calendar-end')!.value=end;
      }
      if(!result.calendarToken)throw new Error('Google did not return an access token. Connect again to allow Calendar access.');
      document.querySelector('#connect-google')!.textContent='Google authorization available';
      const accountButton=document.querySelector('#account');if(accountButton)accountButton.textContent=accountName();
    } catch(error) {
      const field=document.querySelector('#calendar-error');if(field)field.textContent=(error as Error).message || authErrorMessage(error);
    } finally { accountPopupOpen=false; }
  });
  document.querySelector('#calendar-form')!.addEventListener('submit',async event=>{
    event.preventDefault();const errorElement=document.querySelector('#calendar-error')!;errorElement.textContent='';
    const start=document.querySelector<HTMLInputElement>('#calendar-start')!.value,end=document.querySelector<HTMLInputElement>('#calendar-end')!.value;
    if(new Date(end)<=new Date(start)){errorElement.textContent=t('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม','End time must be after start time.');return;}
    if(googleSignInEnabled && !account){errorElement.textContent='Sign in to Google before adding an event.';return;}
    if(!isCalendarConnected()){errorElement.textContent=t('กดเชื่อม Google Calendar ก่อน','Connect Google Calendar first.');return;}
    const button=document.querySelector<HTMLButtonElement>('#calendar-submit')!;button.disabled=true;
    const accountKey=calendarEventStorageKey(task.id,googleSignInEnabled ? account?.uid || '' : null);
    try{const link=await addCalendarEvent(task,start,end,zone());localStorage.setItem(accountKey,link);openCalendar(task);notify(t('เพิ่มลง Google Calendar แล้ว','Added to Google Calendar'));}
    catch(error){errorElement.textContent=(error as Error).message;button.disabled=false;if(!isCalendarConnected())document.querySelector('#connect-google')!.textContent='Connect Google Calendar';}
  });
}
render();
if(googleSignInEnabled && settings?.firebaseConfig) {
  try {
    watchAccount(settings.firebaseConfig,user=>{
      accountReady=true;
      if(!user || (account && account.uid !== user.uid)) setCalendarToken(null);
      account=user;
      if(!accountPopupOpen && !localSetupOpen){
        if(!entry && user && !hasMadeChoice) saveEntry({mode:'google',name:'',timeZone:defaultZone,localEngine:'device'});
        if(entry?.mode==='google' && !user) clearEntry();
        const modal=document.querySelector<HTMLDialogElement>('#modal');
        if(!busy&&!modal?.open)render();
        else {accountRefreshPending=true;const button=document.querySelector('#account');if(button)button.textContent=entry?.mode==='local'?(entry.name||'Local space'):accountName();}
      }
    });
  } catch {
    accountReady=true;accountError='Google sign-in is temporarily unavailable. Please try again later.';showSignIn();
  }
} else {
  accountReady=true;
  if(googleSignInEnabled)accountError='Google sign-in is temporarily unavailable. Please try again later.';
  render();
}
