// InkFrame — Offline Feedback Report
'use strict';
(function(root){
  const NOTE_LIMIT=4000;
  const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
  const cleanText=(value,max=NOTE_LIMIT)=>String(value==null?'':value).replace(CONTROL,'').replace(/\r\n?/g,'\n').slice(0,max).trim();
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const integer=(value,fallback=0)=>Math.max(0,Math.round(finite(value,fallback)));
  const percent=value=>`${Math.round(Math.max(0,Math.min(1,finite(value,0)))*100)}%`;
  const yesNo=value=>value?'yes':'no';
  const safeId=(value,fallback='unknown')=>/^[a-z0-9._-]{1,80}$/i.test(String(value||''))?String(value):fallback;

  function sanitizeNotes(value){
    const input=value&&typeof value==='object'?value:{};
    return Object.freeze({
      summary:cleanText(input.summary,500),
      steps:cleanText(input.steps),
      expected:cleanText(input.expected,2000),
      actual:cleanText(input.actual,2000),
    });
  }

  function normalizeSnapshot(value){
    const input=value&&typeof value==='object'?value:{};
    const canvas=input.canvas&&typeof input.canvas==='object'?input.canvas:{};
    const timeline=input.timeline&&typeof input.timeline==='object'?input.timeline:{};
    const layers=input.layers&&typeof input.layers==='object'?input.layers:{};
    const brush=input.brush&&typeof input.brush==='object'?input.brush:{};
    const onion=input.onion&&typeof input.onion==='object'?input.onion:{};
    const build=input.build&&typeof input.build==='object'?input.build:{};
    const holds=Array.isArray(timeline.holds)?timeline.holds.slice(0,120).map(item=>Math.max(1,Math.min(8,integer(item,1)))):[];
    return Object.freeze({
      build:Object.freeze({
        version:cleanText(build.version,40)||'unknown',
        packageName:safeId(build.packageName,'unknown'),
        variant:safeId(build.variant,'browser'),
        diagnostics:!!build.diagnostics,
        defaultBrushEngine:safeId(build.defaultBrushEngine,'unknown'),
      }),
      project:Object.freeze({slot:integer(input.projectSlot,1)||1,total:integer(input.projectTotal,1)||1}),
      canvas:Object.freeze({
        width:integer(canvas.width),height:integer(canvas.height),
        shape:canvas.shape==='circle'?'circle':'square',
      }),
      timeline:Object.freeze({
        frameCount:integer(timeline.frameCount),currentFrame:integer(timeline.currentFrame),
        fps:Math.max(1,Math.min(24,integer(timeline.fps,12)||12)),holds:Object.freeze(holds),
        playing:!!timeline.playing,loopEnabled:!!timeline.loopEnabled,
        loopIn:integer(timeline.loopIn),loopOut:integer(timeline.loopOut),
      }),
      layers:Object.freeze({count:integer(layers.count),active:integer(layers.active)}),
      brush:Object.freeze({
        id:safeId(brush.id),engine:safeId(brush.engine),stylusOnly:!!brush.stylusOnly,
        barrelMode:safeId(brush.barrelMode),activeStroke:!!brush.activeStroke,
      }),
      onion:Object.freeze({
        enabled:!!onion.enabled,depth:Math.max(0,Math.min(8,integer(onion.depth))),
        pastOpacity:Math.max(.02,Math.min(.85,finite(onion.pastOpacity,.34))),
        futureOpacity:Math.max(.02,Math.min(.85,finite(onion.futureOpacity,.24))),
        tint:Math.max(0,Math.min(1,finite(onion.tint,.5))),layerOnly:!!onion.layerOnly,
      }),
      recovery:Object.freeze({available:!!input.recoveryAvailable,lastSave:cleanText(input.recoveryLastSave,80)||'unknown'}),
    });
  }

  function platformSnapshot(source){
    const w=source&&typeof source==='object'?source:root;
    const nav=w&&w.navigator?w.navigator:{};
    const screen=w&&w.screen?w.screen:{};
    const ua=cleanText(nav.userAgent,600)||'unknown';
    const chrome=/Chrome\/([0-9.]+)/.exec(ua),webview=/; wv\)/.test(ua)||/Version\/4\.0/.test(ua);
    const media=query=>{try{return !!(w.matchMedia&&w.matchMedia(query).matches);}catch(_){return false;}};
    return Object.freeze({
      userAgent:ua,webViewVersion:chrome?chrome[1]:'unknown',androidWebView:webview,
      viewportWidth:integer(w.innerWidth),viewportHeight:integer(w.innerHeight),
      screenWidth:integer(screen.width),screenHeight:integer(screen.height),
      devicePixelRatio:finite(w.devicePixelRatio,1),touchPoints:integer(nav.maxTouchPoints),
      coarsePointer:media('(pointer: coarse)'),finePointer:media('(pointer: fine)'),
    });
  }

  function holdSummary(holds){
    if(!holds.length)return 'none';
    const counts=new Map();for(const value of holds)counts.set(value,(counts.get(value)||0)+1);
    return Array.from(counts).sort((a,b)=>a[0]-b[0]).map(([hold,count])=>`${hold}×:${count}`).join(', ');
  }

  function buildReport(snapshotValue,notesValue,platformValue,generatedAt){
    const s=normalizeSnapshot(snapshotValue),notes=sanitizeNotes(notesValue),p=platformValue&&typeof platformValue==='object'?platformValue:platformSnapshot(root);
    const stamp=generatedAt instanceof Date?generatedAt.toISOString():cleanText(generatedAt,80)||new Date().toISOString();
    return [
      'InkFrame Feedback Report',
      `Generated: ${stamp}`,
      'Privacy: no artwork, thumbnails, project names, layer names, archives, file paths, clipboard contents, or account identifiers are included.',
      '',
      '[Build]',
      `Version: ${s.build.version}`,
      `Package: ${s.build.packageName}`,
      `Variant: ${s.build.variant}`,
      `Diagnostics: ${yesNo(s.build.diagnostics)}`,
      `Default engine: ${s.build.defaultBrushEngine}`,
      '',
      '[Project and canvas]',
      `Project slot: ${s.project.slot}/${s.project.total}`,
      `Canvas: ${s.canvas.width}x${s.canvas.height} (${s.canvas.shape})`,
      `Frames: ${s.timeline.frameCount}`,
      `Current frame: ${s.timeline.currentFrame}`,
      `Layers: ${s.layers.count}`,
      `Active layer: ${s.layers.active}`,
      '',
      '[Timing]',
      `FPS: ${s.timeline.fps}`,
      `Playing: ${yesNo(s.timeline.playing)}`,
      `Loop: ${yesNo(s.timeline.loopEnabled)} (${s.timeline.loopIn}-${s.timeline.loopOut})`,
      `Holds: ${s.timeline.holds.join(',')||'none'}`,
      `Hold distribution: ${holdSummary(s.timeline.holds)}`,
      '',
      '[Brush and onion skin]',
      `Brush: ${s.brush.id}`,
      `Engine: ${s.brush.engine}`,
      `Stylus only: ${yesNo(s.brush.stylusOnly)}`,
      `Barrel mode: ${s.brush.barrelMode}`,
      `Active stroke: ${yesNo(s.brush.activeStroke)}`,
      `Onion: ${yesNo(s.onion.enabled)}`,
      `Onion depth: ${s.onion.depth}`,
      `Past/Future opacity: ${percent(s.onion.pastOpacity)} / ${percent(s.onion.futureOpacity)}`,
      `Tint: ${percent(s.onion.tint)}`,
      `Active layer only: ${yesNo(s.onion.layerOnly)}`,
      '',
      '[Recovery]',
      `Recovery available: ${yesNo(s.recovery.available)}`,
      `Last recovery save: ${s.recovery.lastSave}`,
      '',
      '[Device and WebView]',
      `Viewport: ${integer(p.viewportWidth)}x${integer(p.viewportHeight)} @${finite(p.devicePixelRatio,1)}`,
      `Screen: ${integer(p.screenWidth)}x${integer(p.screenHeight)}`,
      `Touch points: ${integer(p.touchPoints)}`,
      `Coarse/Fine pointer: ${yesNo(p.coarsePointer)} / ${yesNo(p.finePointer)}`,
      `Android WebView: ${yesNo(p.androidWebView)}`,
      `WebView/Chrome version: ${cleanText(p.webViewVersion,80)||'unknown'}`,
      `User agent: ${cleanText(p.userAgent,600)||'unknown'}`,
      '',
      '[Tester notes]',
      `Summary: ${notes.summary||'(not provided)'}`,
      'Steps:',notes.steps||'(not provided)',
      'Expected:',notes.expected||'(not provided)',
      'Actual:',notes.actual||'(not provided)',
    ].join('\n');
  }

  const projectViews=new WeakMap(),fallbackView={open:false,notes:sanitizeNotes({})};
  function viewFor(project){
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,notes:sanitizeNotes({})};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function environment(){try{return typeof root.InkFrameFeedbackEnvironment==='function'?root.InkFrameFeedbackEnvironment():null;}catch(_){return null;}}
  function snapshot(){const env=environment();try{return normalizeSnapshot(env&&typeof env.snapshot==='function'?env.snapshot():{});}catch(_){return normalizeSnapshot({});}}
  function canOpen(env){return !env||typeof env.canOpen!=='function'||env.canOpen()!==false;}
  function notify(env,message){try{if(env&&typeof env.notify==='function')env.notify(message);}catch(_){};}
  function reportFor(view){return buildReport(snapshot(),view.notes,platformSnapshot(root));}
  function fileName(){return `InkFrame-feedback-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;}

  function copyText(text){
    try{if(root.InkFrameAndroidBridge&&typeof root.InkFrameAndroidBridge.copyTesterReport==='function'){root.InkFrameAndroidBridge.copyTesterReport(text);return Promise.resolve(true);}}catch(_){}
    try{if(root.navigator&&root.navigator.clipboard&&typeof root.navigator.clipboard.writeText==='function')return root.navigator.clipboard.writeText(text).then(()=>true); }catch(_){}
    try{const d=root.document,area=d.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';d.body.appendChild(area);area.select();const ok=d.execCommand&&d.execCommand('copy');area.remove();return Promise.resolve(!!ok);}catch(_){return Promise.resolve(false);}
  }
  function saveText(text,name){
    const dataUrl=`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    try{if(root.InkFrameAndroidBridge&&typeof root.InkFrameAndroidBridge.saveDataUrl==='function'){root.InkFrameAndroidBridge.saveDataUrl(dataUrl,name,'text/plain');return true;}}catch(_){}
    try{const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=name;root.document.body.appendChild(a);a.click();a.remove();root.setTimeout(()=>URL.revokeObjectURL(url),0);return true;}catch(_){return false;}
  }

  let panel=null,toggle=null,styleInstalled=false,observer=null,installTimer=0;
  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeFeedbackStyle='true';style.textContent=`
.inkframe-feedback-toggle.on{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-feedback{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:48;width:min(96vw,820px);max-height:min(78vh,690px);overflow:auto;padding:14px;border-radius:24px;background:rgba(10,0,10,.95);border:1px solid rgba(247,202,201,.46);box-shadow:0 24px 70px rgba(10,0,10,.76),inset 0 1px 0 rgba(255,255,255,.18);backdrop-filter:blur(18px) saturate(145%);-webkit-backdrop-filter:blur(18px) saturate(145%);color:var(--text);font-family:var(--font-ui)}
.inkframe-feedback[hidden]{display:none}.inkframe-feedback header{display:flex;align-items:center;justify-content:space-between;gap:10px}.inkframe-feedback h2{margin:0;font:800 15px/1.1 var(--font-ui);letter-spacing:.08em;text-transform:uppercase}.inkframe-feedback .privacy{margin:8px 0 12px;padding:9px 11px;border-radius:14px;background:rgba(255,240,243,.055);border:1px solid rgba(247,202,201,.18);color:var(--dim);font:700 10px/1.45 var(--font-ui)}
.inkframe-feedback .summary{white-space:pre-wrap;margin:0 0 12px;padding:10px;border-radius:14px;background:rgba(0,0,0,.22);color:var(--rose);font:650 10px/1.45 var(--font-mono)}.inkframe-feedback-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.inkframe-feedback label{display:grid;gap:5px;font:800 9px/1.2 var(--font-ui);letter-spacing:.05em;text-transform:uppercase}.inkframe-feedback textarea{min-height:74px;resize:vertical;padding:9px;border-radius:13px;border:1px solid rgba(247,202,201,.28);background:rgba(255,240,243,.07);color:var(--text);font:600 12px/1.4 var(--font-ui);touch-action:manipulation}.inkframe-feedback textarea[data-note="steps"]{min-height:112px}.inkframe-feedback-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.inkframe-feedback button{min-height:40px;padding:8px 13px;border-radius:999px;border:1px solid rgba(247,202,201,.34);background:rgba(255,240,243,.08);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.06em;text-transform:uppercase;touch-action:manipulation}.inkframe-feedback button.primary{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}
@media(max-width:680px){.inkframe-feedback-grid{grid-template-columns:1fr}.inkframe-feedback{bottom:8px}}
`;document.head.appendChild(style);styleInstalled=true;
  }
  function actionsNode(document){return Array.from(document.querySelectorAll('.node')).find(node=>{const label=node.querySelector('.orb .lbl');return label&&String(label.textContent||'').trim()==='Actions';})||null;}
  function removeLegacyButton(document){const legacy=document&&document.getElementById('inkframe-test-report-btn');if(legacy)legacy.remove();}
  function makeButton(document,label,className,handler){const button=document.createElement('button');button.type='button';button.textContent=label;if(className)button.className=className;button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();handler(button);});return button;}
  function makeToggle(document,node){const kid=document.createElement('div');kid.className='kid glass inkframe-feedback-toggle';kid.title='Open offline Feedback Report';kid.innerHTML='<span class="glyph">☷</span><span class="sub">Feedback</span>';kid.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const env=environment();if(!canOpen(env)){notify(env,'Finish the active stroke before opening Feedback');return;}const view=viewFor(env&&env.project);view.open=!view.open;renderPanel();if(node.classList.contains('open')&&typeof node._relayout==='function')node._relayout();});node._kids.appendChild(kid);if(node.classList.contains('open')&&typeof node._relayout==='function')node._relayout();return kid;}
  function ensurePanel(document){if(panel&&panel.isConnected)return panel;panel=document.createElement('section');panel.className='inkframe-feedback';panel.hidden=true;panel.setAttribute('aria-label','Offline Feedback Report');document.body.appendChild(panel);return panel;}
  function updateNotes(view){const next={};for(const area of panel.querySelectorAll('textarea[data-note]'))next[area.dataset.note]=area.value;view.notes=sanitizeNotes(next);}
  function renderPanel(){
    const document=root.document;if(!document)return false;installStyle(document);removeLegacyButton(document);ensurePanel(document);
    const env=environment(),view=viewFor(env&&env.project);panel.hidden=!view.open;if(toggle){toggle.classList.toggle('on',view.open);toggle.setAttribute('aria-pressed',view.open?'true':'false');}if(!view.open)return true;
    panel.innerHTML='';const header=document.createElement('header'),title=document.createElement('h2');title.textContent='Offline Feedback Report';header.appendChild(title);header.appendChild(makeButton(document,'×','',()=>{view.open=false;renderPanel();}));panel.appendChild(header);
    const privacy=document.createElement('p');privacy.className='privacy';privacy.textContent='Nothing is uploaded. The report excludes artwork, project and layer names, archives, file paths, account identifiers, and clipboard contents. Data leaves the device only when you choose Copy or Save.';panel.appendChild(privacy);
    const s=snapshot(),summary=document.createElement('pre');summary.className='summary';summary.textContent=`InkFrame ${s.build.version} · ${s.build.variant}\n${s.canvas.width}×${s.canvas.height} ${s.canvas.shape} · ${s.timeline.frameCount} frames · ${s.layers.count} layers\n${s.brush.engine}/${s.brush.id} · Onion ${s.onion.enabled?'on':'off'} · Recovery ${s.recovery.available?'available':'not reported'}`;panel.appendChild(summary);
    const grid=document.createElement('div');grid.className='inkframe-feedback-grid';for(const [key,label,placeholder] of [['summary','Summary','One-line description'],['steps','Reproduction steps','1. Tap…\n2. Draw…\n3. Export…'],['expected','Expected result','What should InkFrame have done?'],['actual','Actual result','What happened instead?']]){const wrap=document.createElement('label');wrap.textContent=label;const area=document.createElement('textarea');area.dataset.note=key;area.placeholder=placeholder;area.value=view.notes[key]||'';area.addEventListener('input',()=>updateNotes(view));wrap.appendChild(area);grid.appendChild(wrap);}panel.appendChild(grid);
    const actions=document.createElement('div');actions.className='inkframe-feedback-actions';actions.appendChild(makeButton(document,'Copy report','primary',()=>{updateNotes(view);copyText(reportFor(view)).then(ok=>notify(env,ok?'Feedback report copied':'Copy unavailable'));}));actions.appendChild(makeButton(document,'Save .txt','',()=>{updateNotes(view);notify(env,saveText(reportFor(view),fileName())?'Feedback report save started':'Save unavailable');}));actions.appendChild(makeButton(document,'Reset notes','',()=>{view.notes=sanitizeNotes({});renderPanel();notify(env,'Feedback notes reset');}));panel.appendChild(actions);return true;
  }
  function install(){const document=root.document;if(!document)return false;installStyle(document);removeLegacyButton(document);ensurePanel(document);const node=actionsNode(document);if(!node||!node._kids)return false;const existing=node._kids.querySelector('.inkframe-feedback-toggle');toggle=existing||makeToggle(document,node);renderPanel();return true;}
  function scheduleInstall(){if(installTimer)return;const run=()=>{installTimer=0;if(!install())installTimer=root.setTimeout(run,60);};installTimer=root.setTimeout(run,0);}
  if(root&&typeof root.addEventListener==='function'){
    root.addEventListener('load',scheduleInstall);
    if(root.document&&typeof root.MutationObserver==='function'){observer=new root.MutationObserver(()=>{removeLegacyButton(root.document);if(!toggle||!toggle.isConnected)scheduleInstall();});observer.observe(root.document.documentElement,{childList:true,subtree:true});}
  }
  scheduleInstall();

  const api={
    NOTE_LIMIT,sanitizeNotes,normalizeSnapshot,platformSnapshot,buildReport,copyText,saveText,renderPanel,install,
    projectCanvasWrites:0,artworkUndoWrites:0,timingHistoryWrites:0,projectSchemaWrites:0,storageWrites:0,
    clipboardWrites:'explicit',deviceDownloadWrites:'explicit',networkWrites:0,artworkReads:0,projectNameReads:0,
  };
  root.InkFrameFeedbackReport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
