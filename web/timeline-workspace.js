// InkFrame — Contextual Perimeter Timeline Workspace
'use strict';
(function(root){
  const COMMANDS=Object.freeze([
    Object.freeze({name:'hold',value:1,label:'Hold 1',group:'hold'}),
    Object.freeze({name:'hold',value:2,label:'Hold 2',group:'hold'}),
    Object.freeze({name:'hold',value:3,label:'Hold 3',group:'hold'}),
    Object.freeze({name:'hold',value:4,label:'Hold 4',group:'hold'}),
    Object.freeze({name:'holdDelta',value:-1,label:'H−',group:'hold'}),
    Object.freeze({name:'holdDelta',value:1,label:'H+',group:'hold'}),
    Object.freeze({name:'duplicate',label:'Duplicate',group:'edit'}),
    Object.freeze({name:'delete',label:'Delete',group:'edit'}),
    Object.freeze({name:'selectAll',label:'Select all',group:'select'}),
    Object.freeze({name:'clearSelection',label:'Clear selection',group:'select'}),
    Object.freeze({name:'reverse',label:'Reverse',group:'cycle'}),
    Object.freeze({name:'pingPong',label:'Ping-pong',group:'cycle'}),
  ]);
  const integer=(value,fallback=0)=>Number.isFinite(Number(value))?Math.max(0,Math.round(Number(value))):fallback;
  const boundedFrames=value=>Array.isArray(value)?value.map(item=>integer(item)).filter(item=>item>0).slice(0,120):[];

  function normalizeTimelineState(value){
    const input=value&&typeof value==='object'?value:{};
    const selected=boundedFrames(input.selected);
    const frameCount=integer(input.frameCount);
    const currentFrame=Math.min(Math.max(1,integer(input.currentFrame,1)||1),Math.max(1,frameCount));
    const maxFrames=Math.max(frameCount,integer(input.maxFrames,frameCount));
    const targetCount=integer(input.targetCount,selected.length||1)||1;
    const hold=Math.max(1,Math.min(8,integer(input.hold,1)||1));
    return Object.freeze({
      frameCount,currentFrame,maxFrames,targetCount,
      remainingFrames:Math.max(0,integer(input.remainingFrames,Math.max(0,maxFrames-frameCount))),
      selected:Object.freeze(selected),selectedCount:selected.length,
      selectionStart:selected.length?Math.min(...selected):0,selectionEnd:selected.length?Math.max(...selected):0,
      hold,mixedHold:!!input.mixedHold,loopEnabled:!!input.loopEnabled,canInteract:input.canInteract!==false,
    });
  }
  function selectionLabel(state){
    if(!state.selectedCount)return `Frame ${state.currentFrame}`;
    if(state.selectedCount===1)return `1 selected · ${state.selected[0]}`;
    const contiguous=state.selectionEnd-state.selectionStart+1===state.selectedCount;
    return contiguous?`${state.selectedCount} selected · ${state.selectionStart}–${state.selectionEnd}`:`${state.selectedCount} selected`;
  }
  function holdLabel(state){return state.mixedHold?'Mixed':`×${state.hold}`;}

  function environment(){
    try{return typeof root.InkFrameTabletDeckEnvironment==='function'?root.InkFrameTabletDeckEnvironment():null;}
    catch(_){return null;}
  }
  function state(){
    const env=environment();
    try{return normalizeTimelineState(env&&typeof env.timelineSnapshot==='function'?env.timelineSnapshot():{});}
    catch(_){return normalizeTimelineState({});}
  }
  function notify(message){
    const env=environment();
    try{if(env&&typeof env.notify==='function'){env.notify(String(message||'Timeline Workspace'));return;}}catch(_){}
    try{if(root.InkFrameTimelineWorkspace&&typeof root.InkFrameTimelineWorkspace.onNotice==='function')root.InkFrameTimelineWorkspace.onNotice(String(message||''));}catch(_){}
  }

  let panel=null,styleInstalled=false,observer=null,installTimer=0,refreshQueued=false;
  function queueState(){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{refreshQueued=false;updateState();};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);else root.setTimeout(run,0);
  }
  function setText(element,value){const text=String(value);if(element&&element.textContent!==text)element.textContent=text;}
  function framesNode(document){
    return Array.from(document.querySelectorAll('.node')).find(node=>{
      const label=node.querySelector('.orb .lbl');return label&&String(label.textContent||'').trim().toLowerCase()==='frames';
    })||null;
  }
  function framesOpen(document){const node=framesNode(document);return !!(node&&node.classList.contains('open'));}

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeTimelineWorkspaceStyle='true';style.textContent=`
#inkframeTabletDeck .deck-body{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
#inkframeTimelineWorkspace{display:grid;gap:8px;padding:10px;border-radius:19px;background:linear-gradient(155deg,rgba(187,0,55,.13),rgba(0,0,0,.28));border:1px solid rgba(247,202,201,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.10)}
#inkframeTimelineWorkspace[hidden]{display:none}#inkframeTimelineWorkspace header{display:flex;align-items:center;gap:8px}#inkframeTimelineWorkspace h3{margin:0;flex:1;font:900 11px/1.1 var(--font-ui);letter-spacing:.11em;text-transform:uppercase;color:var(--text)}#inkframeTimelineWorkspace .timeline-count{padding:5px 8px;border-radius:999px;background:rgba(255,240,243,.08);border:1px solid rgba(247,202,201,.18);font:850 9px/1 var(--font-ui);color:var(--dim)}
#inkframeTimelineWorkspace .timeline-state{display:grid;grid-template-columns:1fr 1fr;gap:6px}#inkframeTimelineWorkspace .timeline-state div{min-width:0;padding:8px 9px;border-radius:12px;background:rgba(0,0,0,.20);border:1px solid rgba(247,202,201,.13)}#inkframeTimelineWorkspace .timeline-state b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:850 10px/1.2 var(--font-ui);color:var(--text)}#inkframeTimelineWorkspace .timeline-state span{display:block;margin-top:3px;font:750 8px/1.1 var(--font-ui);letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}
#inkframeTimelineWorkspace .timeline-holds{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}#inkframeTimelineWorkspace .timeline-holds button:nth-last-child(-n+2){grid-column:span 2}#inkframeTimelineWorkspace .timeline-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}#inkframeTimelineWorkspace button{min-height:48px;padding:6px;border-radius:14px;border:1px solid rgba(247,202,201,.24);background:rgba(255,240,243,.06);color:var(--text);font:850 9px/1.1 var(--font-ui);letter-spacing:.06em;text-transform:uppercase;touch-action:manipulation}#inkframeTimelineWorkspace button.active{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim);box-shadow:0 0 12px rgba(187,0,55,.28)}#inkframeTimelineWorkspace button:disabled{opacity:.38;filter:saturate(.45)}
@media(max-width:820px),(orientation:portrait){#inkframeTabletDeck .deck-body{max-height:calc(68vh - 92px)}#inkframeTimelineWorkspace .timeline-state{grid-template-columns:repeat(4,1fr)}#inkframeTimelineWorkspace .timeline-actions{grid-template-columns:repeat(4,1fr)}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,definition){
    const button=document.createElement('button');button.type='button';button.textContent=definition.label;button.dataset.timelineCommand=definition.name;
    if(definition.value!=null)button.dataset.timelineValue=String(definition.value);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();runCommand(definition.name,definition.value);});
    return button;
  }
  function makeStat(document,key,label){
    const cell=document.createElement('div'),value=document.createElement('b'),caption=document.createElement('span');
    value.dataset.timelineState=key;caption.textContent=label;cell.append(value,caption);return cell;
  }
  function ensurePanel(document){
    if(panel&&panel.isConnected)return panel;
    const deck=document.getElementById('inkframeTabletDeck'),body=deck&&deck.querySelector('.deck-body');if(!body)return null;
    panel=document.createElement('section');panel.id='inkframeTimelineWorkspace';panel.hidden=true;panel.setAttribute('aria-label','Frame workspace');
    const header=document.createElement('header'),title=document.createElement('h3'),count=document.createElement('span');title.textContent='Frame Workspace';count.className='timeline-count';count.dataset.timelineState='count';header.append(title,count);panel.appendChild(header);
    const stats=document.createElement('div');stats.className='timeline-state';stats.append(makeStat(document,'selection','Selection'),makeStat(document,'hold','Hold'),makeStat(document,'capacity','Capacity'),makeStat(document,'loop','Loop'));panel.appendChild(stats);
    const holds=document.createElement('div');holds.className='timeline-holds';for(const definition of COMMANDS.filter(item=>item.group==='hold'))holds.appendChild(makeButton(document,definition));panel.appendChild(holds);
    const actions=document.createElement('div');actions.className='timeline-actions';for(const definition of COMMANDS.filter(item=>item.group!=='hold'))actions.appendChild(makeButton(document,definition));panel.appendChild(actions);
    const transport=body.querySelector('.deck-transport');body.insertBefore(panel,transport||body.lastChild);return panel;
  }
  function runCommand(name,value){
    const env=environment();
    try{if(!env||typeof env.timelineCommand!=='function'){notify('Timeline controls unavailable');return false;}}
    catch(_){notify('Timeline controls unavailable');return false;}
    try{if(typeof env.canInteract==='function'&&env.canInteract()===false){notify('Finish the active stroke before editing frames');return false;}}catch(_){return false;}
    let result=false;
    try{result=env.timelineCommand(String(name||''),value)!==false;}catch(_){result=false;}
    if(!result)notify('Timeline command unavailable');queueState();return result;
  }
  function updateState(){
    const document=root.document;if(!document)return false;installStyle(document);if(!ensurePanel(document))return false;
    const current=state(),visible=framesOpen(document);panel.hidden=!visible;
    setText(panel.querySelector('[data-timeline-state="count"]'),`${current.frameCount} / ${current.maxFrames}`);
    setText(panel.querySelector('[data-timeline-state="selection"]'),selectionLabel(current));
    setText(panel.querySelector('[data-timeline-state="hold"]'),holdLabel(current));
    setText(panel.querySelector('[data-timeline-state="capacity"]'),`${current.remainingFrames} free`);
    setText(panel.querySelector('[data-timeline-state="loop"]'),current.loopEnabled?'On':'Off');
    for(const button of panel.querySelectorAll('button[data-timeline-command]')){
      const command=button.dataset.timelineCommand,value=Number(button.dataset.timelineValue);
      button.disabled=!current.canInteract||(command==='reverse'&&current.selectedCount<2)||(command==='pingPong'&&current.frameCount<2);
      button.classList.toggle('active',command==='hold'&&!current.mixedHold&&value===current.hold);
    }
    return true;
  }
  function install(){const document=root.document;if(!document)return false;installStyle(document);const installed=!!ensurePanel(document);if(installed)updateState();return installed;}
  function scheduleInstall(){if(installTimer)return;const run=()=>{installTimer=0;if(!install())installTimer=root.setTimeout(run,60);};installTimer=root.setTimeout(run,0);}
  if(root&&typeof root.addEventListener==='function'){
    root.addEventListener('load',scheduleInstall);root.addEventListener('resize',queueState);root.addEventListener('orientationchange',queueState);root.addEventListener('inkframe:timeline',queueState);
    if(root.document&&typeof root.MutationObserver==='function'){observer=new root.MutationObserver(()=>{if(!panel||!panel.isConnected)scheduleInstall();else queueState();});observer.observe(root.document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});}
  }
  scheduleInstall();
  const api={COMMANDS,normalizeTimelineState,selectionLabel,holdLabel,runCommand,updateState,install,onNotice:null,directFrameWrites:0,directHoldWrites:0,directSelectionWrites:0,directProjectSchemaWrites:0,archiveWrites:0,storageWrites:0,networkWrites:0,delegatedTimelineCommands:true,artworkReads:0,projectNameReads:0};
  root.InkFrameTimelineWorkspace=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
