// InkFrame — Tablet Command Deck
'use strict';
(function(root){
  const PREF_KEY='inkframe.ui.tabletDeck.v1';
  const UI_REVISION='studio-controls-v2';
  const MODE_DEFINITIONS=Object.freeze([
    Object.freeze({label:'Draw',target:'Tools'}),
    Object.freeze({label:'Frames',target:'Frames'}),
    Object.freeze({label:'Layers',target:'Layers'}),
    Object.freeze({label:'Actions',target:'Actions'}),
  ]);
  const MODE_LABELS=Object.freeze(MODE_DEFINITIONS.map(item=>item.label));
  const integer=(value,fallback=0)=>Number.isFinite(Number(value))?Math.max(0,Math.round(Number(value))):fallback;
  const safeText=(value,fallback='unknown')=>{
    const text=String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,'').trim();
    return text.slice(0,80)||fallback;
  };

  function normalizeSnapshot(value){
    const input=value&&typeof value==='object'?value:{};
    const timeline=input.timeline&&typeof input.timeline==='object'?input.timeline:{};
    const layers=input.layers&&typeof input.layers==='object'?input.layers:{};
    const brush=input.brush&&typeof input.brush==='object'?input.brush:{};
    const onion=input.onion&&typeof input.onion==='object'?input.onion:{};
    return Object.freeze({
      brush:Object.freeze({id:safeText(brush.id),engine:safeText(brush.engine),activeStroke:!!brush.activeStroke}),
      timeline:Object.freeze({frameCount:integer(timeline.frameCount),currentFrame:integer(timeline.currentFrame),fps:Math.max(1,Math.min(60,integer(timeline.fps,12)||12)),playing:!!timeline.playing}),
      layers:Object.freeze({count:integer(layers.count),active:integer(layers.active)}),
      onion:Object.freeze({enabled:!!onion.enabled}),
    });
  }

  function fallbackSnapshot(document){
    const count=document&&document.getElementById('railCount');
    const match=count&&/(\d+)\s*\/\s*(\d+)/.exec(String(count.textContent||''));
    return normalizeSnapshot({timeline:{currentFrame:match?Number(match[1]):0,frameCount:match?Number(match[2]):0,fps:12,playing:false},layers:{count:0,active:0},brush:{id:'ink',engine:'original',activeStroke:false},onion:{enabled:false}});
  }
  function environment(){
    try{
      if(typeof root.InkFrameTabletDeckEnvironment==='function')return root.InkFrameTabletDeckEnvironment();
      if(typeof root.InkFrameFeedbackEnvironment==='function')return root.InkFrameFeedbackEnvironment();
    }catch(_){}
    return null;
  }
  function snapshot(){
    const env=environment();
    try{return normalizeSnapshot(env&&typeof env.snapshot==='function'?env.snapshot():fallbackSnapshot(root.document));}
    catch(_){return fallbackSnapshot(root.document);}
  }
  function notify(message){
    const env=environment();
    try{if(env&&typeof env.notify==='function'){env.notify(String(message||'InkFrame'));return;}}catch(_){}
    try{if(root.InkFrameTabletDeck&&typeof root.InkFrameTabletDeck.onNotice==='function')root.InkFrameTabletDeck.onNotice(String(message||''));}catch(_){}
  }

  function defaultPreferences(){
    let landscape=false,coarse=false;
    try{landscape=Number(root.innerWidth)>=900;coarse=!!(root.matchMedia&&root.matchMedia('(pointer: coarse)').matches);}catch(_){}
    return {visible:true,expanded:landscape&&coarse};
  }
  function loadPreferences(){
    const defaults=defaultPreferences();
    try{
      const raw=root.localStorage&&root.localStorage.getItem(PREF_KEY);if(!raw)return defaults;
      const parsed=JSON.parse(raw);return {visible:parsed.visible!==false,expanded:typeof parsed.expanded==='boolean'?parsed.expanded:defaults.expanded};
    }catch(_){return defaults;}
  }
  function savePreferences(value){
    try{if(root.localStorage)root.localStorage.setItem(PREF_KEY,JSON.stringify({visible:!!value.visible,expanded:!!value.expanded}));return true;}
    catch(_){return false;}
  }

  let prefs=loadPreferences(),deck=null,toggle=null,styleInstalled=false,observer=null,installTimer=0,refreshQueued=false;
  function queueState(){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{refreshQueued=false;updateState();};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);else root.setTimeout(run,0);
  }

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    document.documentElement.classList.add('inkframe-modern-ui');
    const style=document.createElement('style');style.dataset.inkframeTabletDeckStyle='true';style.dataset.inkframeUiRevision=UI_REVISION;style.textContent=`
.inkframe-modern-ui{--ink-control-min:48px;--ink-control-min-coarse:56px;--ink-control-radius:16px;--ink-control-gap:8px;--ink-control-border:rgba(247,202,201,.32);--ink-control-bg:linear-gradient(155deg,rgba(255,240,243,.12),rgba(20,0,14,.42));--ink-control-bg-active:linear-gradient(155deg,var(--accent-deep),var(--accent));--ink-control-shadow:0 8px 24px rgba(10,0,10,.28),inset 0 1px 0 rgba(255,255,255,.16);--ink-focus:0 0 0 3px rgba(255,240,243,.92),0 0 0 6px rgba(187,0,55,.58)}
.inkframe-modern-ui button,.inkframe-modern-ui [role="button"],.inkframe-modern-ui .kid,.inkframe-modern-ui .orb{transition:transform .12s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease,opacity .18s ease;touch-action:manipulation}
.inkframe-modern-ui button:focus-visible,.inkframe-modern-ui [role="button"]:focus-visible,.inkframe-modern-ui .kid:focus-visible,.inkframe-modern-ui .orb:focus-visible{outline:none;box-shadow:var(--ink-focus)!important}
.inkframe-modern-ui button:active,.inkframe-modern-ui [role="button"]:active,.inkframe-modern-ui .kid:active,.inkframe-modern-ui .orb:active{transform:scale(.96)}
.inkframe-modern-ui button:disabled,.inkframe-modern-ui [aria-disabled="true"]{opacity:.38;filter:saturate(.45);pointer-events:none}
.inkframe-modern-ui .orb{border:1px solid rgba(247,202,201,.40);box-shadow:0 12px 34px rgba(10,0,10,.34),inset 0 1px 0 rgba(255,255,255,.20),inset 0 -12px 22px rgba(10,0,10,.08)}
.inkframe-modern-ui .node.open>.orb{border-color:rgba(255,240,243,.72);box-shadow:0 14px 38px rgba(10,0,10,.40),0 0 0 2px rgba(187,0,55,.25),0 0 24px rgba(187,0,55,.44),inset 0 1px 0 var(--rim)}
.inkframe-modern-ui .kid{border:1px solid var(--ink-control-border);box-shadow:var(--ink-control-shadow)}
.inkframe-modern-ui .kid.on,.inkframe-modern-ui .kid.sel,.inkframe-modern-ui .kid[aria-pressed="true"]{background:var(--ink-control-bg-active)!important;border-color:rgba(255,240,243,.84)!important;box-shadow:0 0 0 2px rgba(255,240,243,.72),0 0 22px rgba(187,0,55,.55),inset 0 1px 0 var(--rim)!important}
.inkframe-modern-ui :is(#studio .actions button,#studio .close,#projectPanel .footer button,.projBtn,#startActions button,#expo button,#blab button,#stylusPanel button,.customTemplate button,.inkframe-onion-studio button,.inkframe-feedback button){min-height:var(--ink-control-min);padding:11px 16px;border-radius:var(--ink-control-radius);border:1px solid var(--ink-control-border);background:var(--ink-control-bg);box-shadow:var(--ink-control-shadow);font-weight:820;letter-spacing:.075em}
.inkframe-modern-ui :is(#studio .actions button,#studio .close,#projectPanel .footer button,.projBtn,#startActions button,#expo button,#blab button,#stylusPanel button,.customTemplate button,.inkframe-onion-studio button,.inkframe-feedback button):hover{border-color:rgba(255,240,243,.66);background:linear-gradient(155deg,rgba(255,240,243,.20),rgba(187,0,55,.20))}
.inkframe-modern-ui :is(#studio .actions button.primary,#projectPanel .footer button.primary,.projBtn.primary,#startActions button.primary,[data-primary="true"]){background:var(--ink-control-bg-active);border-color:rgba(255,240,243,.78);box-shadow:0 10px 26px rgba(88,0,50,.35),inset 0 1px 0 rgba(255,255,255,.28)}
#inkframeTabletDeck{position:fixed;right:max(12px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);z-index:44;width:316px;max-height:calc(100vh - 24px);display:grid;gap:12px;padding:14px;border-radius:28px;background:linear-gradient(155deg,rgba(255,240,243,.19),rgba(10,0,10,.90));border:1px solid rgba(247,202,201,.42);box-shadow:0 26px 76px rgba(10,0,10,.66),inset 0 1px 0 rgba(255,255,255,.24);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);color:var(--text);font-family:var(--font-ui);transition:width .24s ease,opacity .2s ease,transform .24s ease}
#inkframeTabletDeck[hidden]{display:none}#inkframeTabletDeck:not(.expanded){width:68px;padding:7px;border-radius:34px}#inkframeTabletDeck:not(.expanded) .deck-body{display:none}#inkframeTabletDeck.obscured{opacity:.16;pointer-events:none}
#inkframeTabletDeck .deck-grip{width:54px;height:54px;min-height:54px;border-radius:18px;display:flex;align-items:center;justify-content:center;margin:auto;border:1px solid rgba(255,240,243,.62);background:var(--ink-control-bg-active);color:var(--text);font:900 12px/1 var(--font-ui);letter-spacing:.08em;touch-action:manipulation;box-shadow:0 10px 28px rgba(10,0,10,.38),inset 0 1px 0 rgba(255,255,255,.24)}
#inkframeTabletDeck.expanded .deck-grip{display:none}#inkframeTabletDeck .deck-body{display:grid;gap:12px;min-width:0}#inkframeTabletDeck header{display:flex;align-items:center;gap:8px;padding-bottom:2px}#inkframeTabletDeck h2{margin:0;flex:1;font:900 13px/1.1 var(--font-ui);letter-spacing:.13em;text-transform:uppercase;color:var(--text)}
#inkframeTabletDeck .deck-icon{width:50px;height:50px;min-height:50px;padding:0;border-radius:15px;border:1px solid var(--ink-control-border);background:var(--ink-control-bg);color:var(--text);font:900 17px/1 var(--font-ui);touch-action:manipulation;box-shadow:var(--ink-control-shadow)}
#inkframeTabletDeck .deck-status{display:grid;grid-template-columns:1fr 1fr;gap:8px}#inkframeTabletDeck .deck-status div{min-width:0;padding:10px 11px;border-radius:15px;background:rgba(0,0,0,.24);border:1px solid rgba(247,202,201,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}#inkframeTabletDeck .deck-status b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font:850 11px/1.25 var(--font-ui)}#inkframeTabletDeck .deck-status span{display:block;margin-top:4px;color:var(--dim);font:760 9px/1.2 var(--font-ui);letter-spacing:.075em;text-transform:uppercase}
#inkframeTabletDeck .deck-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px}#inkframeTabletDeck .deck-modes button,#inkframeTabletDeck .deck-transport button,#inkframeTabletDeck .deck-utilities button{position:relative;min-height:52px;border-radius:17px;border:1px solid var(--ink-control-border);background:var(--ink-control-bg);color:var(--text);font:860 10px/1 var(--font-ui);letter-spacing:.08em;text-transform:uppercase;touch-action:manipulation;box-shadow:var(--ink-control-shadow)}
#inkframeTabletDeck .deck-modes button::before{display:block;margin-bottom:5px;font-size:16px;line-height:1;color:var(--rose)}#inkframeTabletDeck .deck-modes button[data-mode="Draw"]::before{content:"✦"}#inkframeTabletDeck .deck-modes button[data-mode="Frames"]::before{content:"▦"}#inkframeTabletDeck .deck-modes button[data-mode="Layers"]::before{content:"▤"}#inkframeTabletDeck .deck-modes button[data-mode="Actions"]::before{content:"•••";letter-spacing:.08em}
#inkframeTabletDeck .deck-modes button.active{background:var(--ink-control-bg-active);border-color:rgba(255,240,243,.82);box-shadow:0 0 0 2px rgba(255,240,243,.68),0 0 20px rgba(187,0,55,.50),inset 0 1px 0 rgba(255,255,255,.25)}#inkframeTabletDeck .deck-modes button.active::before{color:#fff}
#inkframeTabletDeck .deck-transport{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:8px}#inkframeTabletDeck .deck-transport button{font-size:20px}#inkframeTabletDeck .deck-transport button[data-action="play"]{font-size:10px;background:linear-gradient(155deg,rgba(255,240,243,.16),rgba(187,0,55,.18))}#inkframeTabletDeck .deck-utilities{display:grid;grid-template-columns:1fr 1fr;gap:8px}#inkframeTabletDeck .deck-utilities button{background:rgba(255,240,243,.055)}
.inkframe-tablet-deck-toggle.on{background:var(--ink-control-bg-active)!important;border-color:rgba(255,240,243,.82)!important;box-shadow:0 0 0 2px rgba(255,240,243,.58),0 0 20px rgba(187,0,55,.48)!important}
:is(#studio .card,#projectPanel .card,#startPanel .card,#helpPanel .card,#blab,#stylusPanel,.inkframe-onion-studio,.inkframe-feedback){background:linear-gradient(155deg,rgba(255,240,243,.17),rgba(10,0,10,.90))!important;border-color:rgba(247,202,201,.38)!important;box-shadow:0 26px 76px rgba(10,0,10,.66),inset 0 1px 0 rgba(255,255,255,.22)!important}
@media(pointer:coarse){.inkframe-modern-ui{--ink-control-min:var(--ink-control-min-coarse)}.frameSlot{width:28px!important;height:28px!important;border-radius:9px!important;font-size:9px!important}.frameSlot::before{content:"";position:absolute;inset:-7px}.frameSlot.cur{transform:translate(-50%,-50%) scale(1.22)!important}.frameSlot.sel{transform:translate(-50%,-50%) scale(1.13)!important}.frameSlot.held::after{width:8px!important;height:8px!important}.kid{min-width:56px;min-height:56px}#inkframeTabletDeck .deck-icon,#inkframeTabletDeck .deck-modes button,#inkframeTabletDeck .deck-transport button,#inkframeTabletDeck .deck-utilities button{min-height:56px}}
@media(max-width:820px),(orientation:portrait){#inkframeTabletDeck{left:8px;right:8px;top:auto;bottom:max(72px,calc(env(safe-area-inset-bottom) + 62px));transform:none;width:auto;max-height:46vh;border-radius:24px}#inkframeTabletDeck:not(.expanded){left:auto;right:10px;width:68px;border-radius:34px}.deck-status{grid-template-columns:repeat(4,1fr)!important}.deck-modes{grid-template-columns:repeat(4,1fr)!important}}
@media(prefers-reduced-motion:reduce){.inkframe-modern-ui button,.inkframe-modern-ui [role="button"],.inkframe-modern-ui .kid,.inkframe-modern-ui .orb,#inkframeTabletDeck{transition:none!important}}
`;document.head.appendChild(style);styleInstalled=true;
  }

  function nodes(document){return Array.from(document.querySelectorAll('.node'));}
  function nodeLabel(node){const label=node&&node.querySelector('.orb .lbl');return label?safeText(label.textContent,''):'';}
  function nodeByLabel(document,label){return nodes(document).find(node=>nodeLabel(node).toLowerCase()===String(label).toLowerCase())||null;}
  function kidByLabels(node,labels){
    if(!node)return null;const wanted=labels.map(value=>String(value).toLowerCase());
    return Array.from(node.querySelectorAll('.kid')).find(kid=>{const sub=kid.querySelector('.sub'),text=safeText(sub&&sub.textContent||kid.title||kid.getAttribute('aria-label')||'','').toLowerCase();return wanted.includes(text);})||null;
  }
  function fire(element){
    if(!element)return false;
    try{element.dispatchEvent(new root.MouseEvent('click',{bubbles:true,cancelable:true,view:root}));return true;}
    catch(_){try{element.click();return true;}catch(__){return false;}}
  }
  function modeDefinition(label){return MODE_DEFINITIONS.find(item=>item.label===label||item.target===label)||null;}
  function safeInteraction(){
    const env=environment();
    try{if(env&&typeof env.canInteract==='function'&&env.canInteract()===false){notify('Finish the active stroke before changing the interface');return false;}}catch(_){}
    if(snapshot().brush.activeStroke){notify('Finish the active stroke before changing the interface');return false;}return true;
  }
  function openNodeFallback(target){
    const node=nodeByLabel(root.document,target);if(!node)return false;
    if(!node.classList.contains('open')){node.classList.add('open');if(typeof node._relayout==='function')root.requestAnimationFrame(()=>node._relayout());}return true;
  }
  function activateMode(label){
    if(!safeInteraction())return false;const definition=modeDefinition(label);if(!definition)return false;const env=environment();let opened=false;
    try{if(env&&typeof env.openMode==='function')opened=env.openMode(definition.target)!==false;}catch(_){}
    if(!opened)opened=openNodeFallback(definition.target);if(!opened){notify(`${definition.label} controls unavailable`);return false;}queueState();return true;
  }
  function openBrushLab(){
    if(!safeInteraction())return false;const env=environment();
    try{if(env&&typeof env.openBrushLab==='function'&&env.openBrushLab()!==false){queueState();return true;}}catch(_){}
    notify('Brush Lab unavailable');return false;
  }
  function transport(action){
    if(!safeInteraction())return false;const document=root.document,env=environment();let result=false;
    if(action==='prev')result=fire(document.getElementById('railPrev'));
    else if(action==='next')result=fire(document.getElementById('railNext'));
    else if(action==='play'){
      try{if(env&&typeof env.togglePlayback==='function'&&env.togglePlayback()!==false)result=true;}catch(_){}
      if(!result){const frameNode=nodeByLabel(document,'Frames'),kid=kidByLabels(frameNode,['Play','Pause']);if(kid)result=fire(kid);}
      if(!result)notify('Playback control unavailable');
    }
    queueState();return result;
  }
  function collapseNodes(){
    if(!safeInteraction())return false;const env=environment();let changed=false;
    try{if(env&&typeof env.collapseModes==='function')changed=env.collapseModes()!==false;}catch(_){}
    if(!changed){for(const node of nodes(root.document)){if(node.classList.contains('open')){node.classList.remove('open');changed=true;}}}
    queueState();return changed;
  }

  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;if(className)button.className=className;
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();handler(button);});return button;
  }
  function setExpanded(value){prefs.expanded=!!value;savePreferences(prefs);renderVisibility();}
  function setVisible(value){prefs.visible=!!value;savePreferences(prefs);renderVisibility();}
  function ensureDeck(document){
    if(deck&&deck.isConnected)return deck;
    deck=document.createElement('aside');deck.id='inkframeTabletDeck';deck.dataset.uiRevision=UI_REVISION;deck.setAttribute('aria-label','Tablet command deck');
    const grip=makeButton(document,'IF','deck-grip',()=>setExpanded(true));grip.title='Open Tablet Command Deck';grip.setAttribute('aria-label','Open Tablet Command Deck');deck.appendChild(grip);
    const body=document.createElement('div');body.className='deck-body';
    const header=document.createElement('header'),title=document.createElement('h2');title.textContent='Control Deck';header.appendChild(title);
    const collapse=makeButton(document,'−','deck-icon',()=>setExpanded(false));collapse.title='Collapse deck';collapse.setAttribute('aria-label','Collapse Tablet Command Deck');header.appendChild(collapse);
    const hide=makeButton(document,'×','deck-icon',()=>setVisible(false));hide.title='Hide deck';hide.setAttribute('aria-label','Hide Tablet Command Deck');header.appendChild(hide);body.appendChild(header);
    const status=document.createElement('div');status.className='deck-status';
    for(const [key,label] of [['brush','Brush'],['frame','Frame'],['layers','Layers'],['timing','Timing']]){const cell=document.createElement('div'),value=document.createElement('b'),caption=document.createElement('span');value.dataset.status=key;caption.textContent=label;cell.append(value,caption);status.appendChild(cell);}body.appendChild(status);
    const modes=document.createElement('div');modes.className='deck-modes';for(const definition of MODE_DEFINITIONS){const button=makeButton(document,definition.label,'',()=>activateMode(definition.label));button.dataset.mode=definition.label;button.dataset.target=definition.target;button.setAttribute('aria-pressed','false');modes.appendChild(button);}body.appendChild(modes);
    const transportRow=document.createElement('div');transportRow.className='deck-transport';
    const previous=makeButton(document,'‹','',()=>transport('prev'));previous.title='Previous frame';previous.setAttribute('aria-label','Previous frame');previous.dataset.action='prev';transportRow.appendChild(previous);
    const play=makeButton(document,'Play','',()=>transport('play'));play.title='Play or pause';play.dataset.action='play';transportRow.appendChild(play);
    const next=makeButton(document,'›','',()=>transport('next'));next.title='Next frame';next.setAttribute('aria-label','Next frame');next.dataset.action='next';transportRow.appendChild(next);body.appendChild(transportRow);
    const utilities=document.createElement('div');utilities.className='deck-utilities';utilities.appendChild(makeButton(document,'Brush Lab','',openBrushLab));utilities.appendChild(makeButton(document,'Collapse','',collapseNodes));body.appendChild(utilities);
    deck.appendChild(body);document.body.appendChild(deck);return deck;
  }
  function actionsNode(document){return nodeByLabel(document,'Actions');}
  function installToggle(document){
    const node=actionsNode(document);if(!node||!node._kids)return false;
    const existing=node._kids.querySelector('.inkframe-tablet-deck-toggle');if(existing){toggle=existing;return true;}
    const kid=document.createElement('div');kid.className='kid glass inkframe-tablet-deck-toggle';kid.title='Show or hide Tablet Command Deck';kid.setAttribute('role','button');kid.setAttribute('tabindex','0');kid.setAttribute('aria-label','Show or hide Tablet Command Deck');kid.innerHTML='<span class="glyph">▤</span><span class="sub">Deck</span>';
    const activate=event=>{event.preventDefault();event.stopPropagation();setVisible(!prefs.visible);if(node.classList.contains('open')&&typeof node._relayout==='function')node._relayout();};
    kid.addEventListener('click',activate);kid.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){activate(event);}});
    node._kids.appendChild(kid);if(node.classList.contains('open')&&typeof node._relayout==='function')node._relayout();toggle=kid;return true;
  }
  function modalOpen(document){
    if(['studio','projectPanel','startPanel','helpPanel','blab','stylusPanel'].some(id=>{const element=document.getElementById(id);return !!(element&&element.classList.contains('show'));}))return true;
    return Array.from(document.querySelectorAll('.inkframe-onion-studio,.inkframe-feedback')).some(panel=>!panel.hidden);
  }
  function updateState(){
    const document=root.document;if(!document||!deck||!deck.isConnected)return false;const current=snapshot();
    const values={brush:`${current.brush.engine} · ${current.brush.id}`,frame:`${current.timeline.currentFrame||0} / ${current.timeline.frameCount||0}`,layers:current.layers.count?`${current.layers.active||0} / ${current.layers.count}`:'—',timing:`${current.timeline.fps} fps · ${current.timeline.playing?'playing':'paused'}${current.onion.enabled?' · onion':''}`};
    for(const [key,value] of Object.entries(values)){const element=deck.querySelector(`[data-status="${key}"]`);if(element&&element.textContent!==value)element.textContent=value;}
    const play=deck.querySelector('[data-action="play"]'),playLabel=current.timeline.playing?'Pause':'Play';if(play&&play.textContent!==playLabel)play.textContent=playLabel;if(play)play.setAttribute('aria-pressed',current.timeline.playing?'true':'false');
    for(const button of deck.querySelectorAll('[data-mode]')){const node=nodeByLabel(document,button.dataset.target),active=!!(node&&node.classList.contains('open'));button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false');}
    deck.classList.toggle('obscured',modalOpen(document));return true;
  }
  function renderVisibility(){
    if(!deck)return false;deck.hidden=!prefs.visible;deck.classList.toggle('expanded',prefs.visible&&prefs.expanded);
    if(toggle){toggle.classList.toggle('on',prefs.visible);toggle.setAttribute('aria-pressed',prefs.visible?'true':'false');}updateState();return true;
  }
  function install(){
    const document=root.document;if(!document)return false;installStyle(document);ensureDeck(document);const toggleReady=installToggle(document);renderVisibility();return toggleReady;
  }
  function scheduleInstall(){if(installTimer)return;const run=()=>{installTimer=0;if(!install())installTimer=root.setTimeout(run,60);};installTimer=root.setTimeout(run,0);}
  if(root&&typeof root.addEventListener==='function'){
    root.addEventListener('load',scheduleInstall);root.addEventListener('resize',queueState);root.addEventListener('orientationchange',queueState);root.addEventListener('inkframe:onion-settings',queueState);
    if(root.document&&typeof root.MutationObserver==='function'){observer=new root.MutationObserver(()=>{if(!deck||!deck.isConnected||!toggle||!toggle.isConnected)scheduleInstall();else queueState();});observer.observe(root.document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});}
  }
  scheduleInstall();

  const api={PREF_KEY,UI_REVISION,MODE_DEFINITIONS,MODE_LABELS,normalizeSnapshot,fallbackSnapshot,loadPreferences,savePreferences,activateMode,openBrushLab,transport,collapseNodes,updateState,install,setVisible,setExpanded,onNotice:null,projectCanvasWrites:0,artworkUndoWrites:0,timingHistoryWrites:0,projectSchemaWrites:0,archiveWrites:0,storageWrites:'device-ui-preference-only',networkWrites:0,artworkReads:0,projectNameReads:0};
  root.InkFrameTabletDeck=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
