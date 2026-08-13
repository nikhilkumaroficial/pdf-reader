import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs';

const $=s=>document.querySelector(s);
const dbName='leaf-pdf-library', store='books';
let db, books=[], active=null, pdf=null, page=1, zoom=1, busy=false;
let pointerStart=null, dragging=false, dragTurn=null;

const el={
  library:$('#libraryView'),reader:$('#readerView'),grid:$('#bookGrid'),empty:$('#emptyState'),drop:$('#dropzone'),file:$('#fileInput'),
  book:$('#book'),loader:$('#loader'),title:$('#readerTitle'),meta:$('#readerMeta'),current:$('#pageCurrent'),total:$('#pageTotal'),range:$('#pageRange'),fill:$('#progressFill'),zoom:$('#zoomLabel')
};

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(store))d.createObjectStore(store,{keyPath:'id'})};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}
function tx(mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function getAll(){return new Promise((res,rej)=>{const r=tx().getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(b){return new Promise((res,rej)=>{const r=tx('readwrite').put(b);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function del(id){return new Promise((res,rej)=>{const r=tx('readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function clearDB(){return new Promise((res,rej)=>{const r=tx('readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function toast(t){const x=$('#toast');x.textContent=t;x.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>x.classList.remove('show'),2400)}
function esc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

async function coverFromPdf(p){try{const pg=await p.getPage(1),v=pg.getViewport({scale:.45}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c.toDataURL('image/jpeg',.72)}catch{return ''}}

async function importPdf(file){
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))return toast('Please choose a valid PDF.');
  try{$('#loader').classList.add('show');const buf=await file.arrayBuffer();const p=await pdfjsLib.getDocument({data:buf.slice(0)}).promise;const cover=await coverFromPdf(p);
    const b={id:crypto.randomUUID(),name:file.name.replace(/\.pdf$/i,''),blob:new Blob([buf],{type:'application/pdf'}),cover,pages:p.numPages,current:1,added:Date.now(),opened:Date.now()};
    await put(b);books=await getAll();renderLibrary();toast('Book added to your library.')
  }catch(e){console.error(e);toast('That PDF could not be opened.')}finally{$('#loader').classList.remove('show')}
}

function renderLibrary(){
  const sort=$('#sortSelect').value;let a=[...books];
  a.sort((x,y)=>sort==='name'?x.name.localeCompare(y.name):sort==='added'?y.added-x.added:y.opened-x.opened);
  el.grid.innerHTML=a.map(b=>{const pct=Math.round((b.current/b.pages)*100);return `<article class="book-card"><div class="cover-wrap">${b.cover?`<img src="${b.cover}" alt="">`:`<div class="cover-fallback">${esc(b.name)}</div>`}</div><div class="book-info"><div class="book-name" title="${esc(b.name)}">${esc(b.name)}</div><div class="book-meta">Page ${b.current} / ${b.pages} · ${pct}%</div><div class="card-progress"><i style="width:${pct}%"></i></div><div class="card-actions"><button class="continue" data-open="${b.id}">${b.current>1?'Continue':'Open'} →</button><button data-delete="${b.id}">Delete</button></div></div></article>`}).join('');
  el.empty.style.display=a.length?'none':'block';
}

function pageScale(pg){
  const base=pg.getViewport({scale:1});
  const mobile=innerWidth<760;
  const availableW=mobile?innerWidth*.88:Math.min(innerWidth*.72,820);
  const availableH=innerHeight*.78;
  const fit=Math.min(availableW/base.width,availableH/base.height);
  return fit*zoom;
}

async function renderCanvas(n){
  const pg=await pdf.getPage(n);const s=pageScale(pg);const v=pg.getViewport({scale:s});
  const c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);
  await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c;
}

function sheetFor(canvas,n){
  const sh=document.createElement('div');sh.className='sheet single-sheet';sh.dataset.page=n;sh.appendChild(canvas);return sh;
}

async function showPage(){
  if(!pdf)return;busy=true;el.loader.classList.add('show');
  try{el.book.innerHTML='';const c=await renderCanvas(page);el.book.appendChild(sheetFor(c,page));updateUI()}
  catch(e){console.error(e);toast('Could not render this page.')}finally{el.loader.classList.remove('show');busy=false}
}

function updateUI(){
  el.current.textContent=page;el.total.textContent=pdf.numPages;el.meta.textContent=`${page} / ${pdf.numPages}`;el.range.max=pdf.numPages;el.range.value=page;el.fill.style.width=(page/pdf.numPages*100)+'%';
  el.zoom.textContent=Math.round(zoom*100)+'%';
  const zs=$('#zoomRange');if(zs){zs.value=Math.round(zoom*100);}
}

function saveProgress(){if(!active)return;active.current=page;active.opened=Date.now();put(active)}

async function buildFlip(next,dir){
  const currentCanvas=await renderCanvas(page);const nextCanvas=await renderCanvas(next);
  const layer=document.createElement('div');layer.className=`flip-page ${dir>0?'flip-next':'flip-prev'}`;
  const front=document.createElement('div');front.className='flip-face flip-front';front.appendChild(currentCanvas);
  const back=document.createElement('div');back.className='flip-face flip-back';back.appendChild(nextCanvas);
  layer.append(front,back);el.book.innerHTML='';
  const staticNext=sheetFor(nextCanvas.cloneNode(true),next);
  staticNext.classList.add('under-page');
  // Render a separate under-page canvas to avoid canvas mutation during the flip.
  staticNext.innerHTML='';const underCanvas=await renderCanvas(next);staticNext.appendChild(underCanvas);el.book.appendChild(staticNext);el.book.appendChild(layer);
  return layer;
}

async function turn(dir){
  if(busy||!pdf)return;
  const next=page+dir;if(next<1||next>pdf.numPages)return;
  busy=true;const old=page;
  try{
    const layer=await buildFlip(next,dir);
    requestAnimationFrame(()=>requestAnimationFrame(()=>layer.classList.add('flipping')));
    await new Promise(r=>setTimeout(r,720));
    page=next;saveProgress();
    await showPage();
  }catch(e){console.error(e);toast('Page turn failed.')}finally{busy=false}
}

async function openBook(id){
  active=books.find(b=>b.id===id);if(!active)return;
  try{el.library.classList.add('hidden');el.reader.classList.remove('hidden');el.title.textContent=active.name;const ab=await active.blob.arrayBuffer();pdf=await pdfjsLib.getDocument({data:ab}).promise;page=Math.min(active.current||1,pdf.numPages);active.current=page;active.opened=Date.now();await put(active);await showPage()}
  catch(e){console.error(e);toast('Could not open this PDF.');closeReader()}
}

async function closeReader(){pdf=null;active=null;el.reader.classList.add('hidden');el.library.classList.remove('hidden');books=await getAll();renderLibrary()}

async function setZoom(value){zoom=Math.max(.5,Math.min(4,Number(value)));await showPage()}
function fit(){zoom=1;showPage()}
function fitWidth(){zoom=Math.max(.5,Math.min(4,innerWidth<760?1.04:1.22));showPage()}

$('#uploadBtn').onclick=()=>el.file.click();$('#emptyUpload').onclick=()=>el.file.click();el.file.onchange=e=>e.target.files[0]&&importPdf(e.target.files[0]);el.drop.onclick=()=>el.file.click();
['dragenter','dragover'].forEach(x=>el.drop.addEventListener(x,e=>{e.preventDefault();el.drop.classList.add('drag')}));['dragleave','drop'].forEach(x=>el.drop.addEventListener(x,e=>{e.preventDefault();el.drop.classList.remove('drag')}));el.drop.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)importPdf(f)});
$('#sortSelect').onchange=renderLibrary;
el.grid.onclick=async e=>{const o=e.target.closest('[data-open]'),d=e.target.closest('[data-delete]');if(o)openBook(o.dataset.open);if(d&&confirm('Delete this book from your browser?')){await del(d.dataset.delete);books=await getAll();renderLibrary()}};
$('#clearAll').onclick=async()=>{if(books.length&&confirm('Delete every locally saved book?')){await clearDB();books=[];renderLibrary();toast('Library cleared.')}};
$('#backBtn').onclick=closeReader;$('#nextBtn').onclick=()=>turn(1);$('#prevBtn').onclick=()=>turn(-1);$('#hitRight').onclick=()=>turn(1);$('#hitLeft').onclick=()=>turn(-1);
$('#zoomIn').onclick=()=>setZoom(zoom+.1);$('#zoomOut').onclick=()=>setZoom(zoom-.1);$('#fitBtn').onclick=fit;$('#fitWidthBtn').onclick=fitWidth;$('#zoomRange').oninput=e=>{zoom=Number(e.target.value)/100;updateUI();clearTimeout(setZoom.t);setZoom.t=setTimeout(showPage,80)};
$('#pageRange').oninput=e=>{if(!busy){page=+e.target.value;saveProgress();showPage()}};
$('#fullscreenBtn').onclick=()=>document.documentElement.requestFullscreen?.();
function toggleTheme(){document.body.classList.toggle('dark');localStorage.setItem('leaf-theme',document.body.classList.contains('dark')?'dark':'light')}
$('#themeBtn').onclick=toggleTheme;$('#readerTheme').onclick=toggleTheme;if(localStorage.getItem('leaf-theme')==='dark')document.body.classList.add('dark');

window.addEventListener('keydown',e=>{if(el.reader.classList.contains('hidden'))return;if(e.target.matches('input'))return;if(e.key==='ArrowRight')turn(1);if(e.key==='ArrowLeft')turn(-1);if(e.key==='+'||e.key==='=')setZoom(zoom+.1);if(e.key==='-'||e.key==='_')setZoom(zoom-.1);if(e.key==='0')fit();if(e.key==='Escape'&&document.fullscreenElement)document.exitFullscreen?.()});

el.book.addEventListener('pointerdown',e=>{
  if(busy||!pdf)return;pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};dragging=true;el.book.setPointerCapture?.(e.pointerId);
  const rect=el.book.getBoundingClientRect();const fromRight=e.clientX>rect.left+rect.width*.55;dragTurn=fromRight?1:-1;
  el.book.classList.add('dragging', dragTurn>0?'drag-next':'drag-prev');
});
el.book.addEventListener('pointermove',e=>{if(!dragging||!pointerStart)return;const dx=e.clientX-pointerStart.x;const amount=Math.max(0,Math.min(1,Math.abs(dx)/(el.book.clientWidth*.72)));el.book.style.setProperty('--drag-progress',amount);el.book.style.setProperty('--drag-angle',(dragTurn*amount*172)+'deg');});
el.book.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;el.book.classList.remove('dragging');el.book.style.removeProperty('--drag-progress');el.book.style.removeProperty('--drag-angle');const dx=e.clientX-pointerStart.x;pointerStart=null;if(Math.abs(dx)>55)turn(dx<0?1:-1)});
el.book.addEventListener('pointercancel',()=>{dragging=false;pointerStart=null;el.book.classList.remove('dragging');el.book.style.removeProperty('--drag-progress');el.book.style.removeProperty('--drag-angle')});

window.addEventListener('resize',()=>{if(pdf&&!busy)showPage()});
await openDB();books=await getAll();renderLibrary();
