// InkFrame — Contextual Tablet Layer Workspace
'use strict';
(function(root){
  const COMMANDS=Object.freeze([
    Object.freeze({name:'selectBelow',label:'Layer below',group:'navigate'}),
    Object.freeze({name:'selectAbove',label:'Layer above',group:'navigate'}),
    Object.freeze({name:'opacity',value:25,label:'25%',group:'opacity'}),
    Object.freeze({name:'opacity',value:50,label:'50%',group:'opacity'}),
    Object.freeze({name:'opacity',value:75,label:'75%',group:'opacity'}),
    Object.freeze({name:'opacity',value:100,label:'100%',group:'opacity'}),
    Object.freeze({name:'add',label:'Add',group:'edit'}),
    Object.freeze({name:'duplicate',label:'Duplicate',group:'edit'}),
    Object.freeze({name:'delete',label:'Delete',group:'edit'}),
    Object.freeze({name:'moveUp',label:'Move up',group:'order'}),
    Object.freeze({name:'moveDown',label:'Move down',group:'order'}),
    Object.freeze({name:'mergeDown',label:'Merge down',group:'order'}),
    Object.freeze({name:'visibility',label:'Hide',group:'property'}),
    Object.freeze({name:'blend',label:'Next blend',group:'property'}),
  ]);
  const integer=(value,fallback=0)=>Number.isFinite(Number(value))?Math.max(0,Math.round(Number(value))):fallback;
  const safeText=(value,fallback='Normal')=>{
    const text=String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,'').trim();
    return text.slice(0,48)||fallback;
  };

  function normalizeLayerState(value){
    const input=value&&typeof value==='object'?value:{};
    const count=integer(input.count);
    const active=count?Math.min(Math.max(1,integer(input.active,1)||1),count):0;
    const opacity=Math.max(0,Math.min(100,integer(input.opacity,100)));
    return Object.freeze({
      count,active,visible:input.visible!==false,opacity,
      blend:safeText(input.blend),canInteract:input.canInteract!==false,
      canSelectAbove:count>0&&active<count,canSelectBelow:count>0&&active>1,
      canMoveUp:count>0&&active<count,canMoveDown:count>0&&active>1,
      canDelete:count>1,canMergeDown:count>1&&active>1,
    });
  }
  function layerLabel(state){return state.count?`${state.active} / ${state.count}`:'—';}
  function visibilityLabel(state){return state.visible?'Visible':'Hidden';}

  function environment(){
    try{return typeof root.InkFrameTabletDeckEnvironment==='function'?root.InkFrameTabletDeckEnvironment():null;}
    catch(_){return null;}
  }
  function state(){
    const env=environment();
    try{return normalizeLayerState(env&&typeof env.layerSnapshot==='function'?env.layerSnapshot():{});}
    catch(_){return normalizeLayerState({});}
  }
  function notify(message){
    const env=environment();
    try{if(env&&typeof env.notify==='function'){env.notify(String(message||'Layer Workspace'));return;}}catch(_){}
    try{if(root.InkFrameLayerWorkspace&&typeof root.InkFrameLayerWorkspace.onNotice==='function')root.InkFrameLayerWorkspace.onNotice(String(message||''));}catch(_){}
  }

  let panel=null,styleInstalled=false,observer=null,installTimer=0,refreshQueued=false;
  function queueState(){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{refreshQueued=false;updateState();};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);else root.setTimeout(run,0);
  }
  function setText(element,value){const text=String(value);if(element&&element.textContent!==text)element.textContent=text;}
  function layersNode(document){
    return Array.from(document.querySelectorAll('.node')).find(node=>{
      const label=node.querySelector('.orb .lbl');return label&&String(label.textContent||'').trim().toLowerCase()==='layers';
    })||null;
  }
  function layersOpen(document){const node=layersNode(document);return !!(node&&node.classList.contains('open'));}

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeLayerWorkspaceStyle='true';style.textContent=`
#inkframeLayerWorkspace{display:grid;gap:8px;padding:10px;border-radius:19px;background:linear-gradient(155deg,rgba(247,202,201,.12),rgba(0,0,0,.28));border:1px solid rgba(247,202,201,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.10)}
#inkframeLayerWorkspace[hidden]{display:none}#inkframeLayerWorkspace header{display:flex;align-items:center;gap:8px}#inkframeLayerWorkspace h3{margin:0;flex:1;font:900 11px/1.1 var(--font-ui);letter-spacing:.11em;text-transform:uppercase;color:var(--text)}#inkframeLayerWorkspace .layer-count{padding:5px 8px;border-radius:999px;background:rgba(255,240,243,.08);border:1px solid rgba(247,202,201,.18);font:850 9px/1 var(--font-ui);color:var(--dim)}
#inkframeLayerWorkspace .layer-state{display:grid;grid-template-columns:1fr 1fr;gap:6px}#inkframeLayerWorkspace .layer-state div{min-width:0;padding:8px 9px;border-radius:12px;background:rgba(0,0,0,.20);border:1px solid rgba(247,202,201,.13)}#inkframeLayerWorkspace .layer-state b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:850 10px/1.2 var(--font-ui);color:var(--text)}#inkframeLayerWorkspace .layer-state span{display:block;margin-top:3px;font:750 8px/1.1 var(--font-ui);letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}
#inkframeLayerWorkspace .layer-navigation,#inkframeLayerWorkspace .layer-properties{display:grid;grid-template-columns:1fr 1fr;gap:6px}#inkframeLayerWorkspace .layer-opacity{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}#inkframeLayerWorkspace .layer-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#inkframeLayerWorkspace button{min-height:48px;padding:6px;border-radius:14px;border:1px solid rgba(247,202,201,.24);background:rgba(255,240,243,.06);color:var(--text);font:850 9px/1.1 var(--font-ui);letter-spacing:.06em;text-transform:uppercase;touch-action:manipulation}#inkframeLayerWorkspace button.active{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim);box-shadow:0 0 12px rgba(187,0,55,.28)}#inkframeLayerWorkspace button:disabled{opacity:.38;filter:saturate(.45)}#inkframeLayerWorkspace button[data-layer-command="delete"],#inkframeLayerWorkspace button[data-layer-command="mergeDown"]{border-color:rgba(255,145,165,.38)}
@media(max-width:820px),(orientation:portrait){#inkframeLayerWorkspace .layer-state{grid-template-columns:repeat(4,1fr)}#inkframeLayerWorkspace .layer-actions{grid-template-columns:repeat(4,1fr)}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function makeButton(document,definition){
    const button=document.createElement('button');button.type='button';button.textContent=definition.label;button.dataset.layerCommand=definition.name;
    if(definition.value!=null)button.dataset.layerValue=String(definition.value);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();runCommand(definition.name,definition.value);});
    return button;
  }
  function makeStat(document,key,label){
    const cell=document.createElement('div'),value=document.createElement('b'),caption=document.createElement('span');
    value.dataset.layerState=key;caption.textContent=label;cell.append(value,caption);return cell;
  }
  function ensurePanel(document){
    if(panel&&panel.isConnected)return panel;
    const deck=document.getElementById('inkframeTabletDeck'),body=deck&&deck.querySelector('.deck-body');if(!body)return null;
    panel=document.createElement('section');panel.id='inkframeLayerWorkspace';panel.hidden=true;panel.setAttribute('aria-label','Layer workspace');
    const header=document.createElement('header'),title=document.createElement('h3'),count=document.createElement('span');title.textContent='Layer Workspace';count.className='layer-count';count.dataset.layerState='count';header.append(title,count);panel.appendChild(header);
    const stats=document.createElement('div');stats.className='layer-state';stats.append(makeStat(document,'position','Layer'),makeStat(document,'visibility','Visibility'),makeStat(document,'opacity','Opacity'),makeStat(document,'blend','Blend'));panel.appendChild(stats);
    const navigation=document.createElement('div');navigation.className='layer-navigation';for(const definition of COMMANDS.filter(item=>item.group==='navigate'))navigation.appendChild(makeButton(document,definition));panel.appendChild(navigation);
    const opacity=document.createElement('div');opacity.className='layer-opacity';for(const definition of COMMANDS.filter(item=>item.group==='opacity'))opacity.appendChild(makeButton(document,definition));panel.appendChild(opacity);
    const properties=document.createElement('div');properties.className='layer-properties';for(const definition of COMMANDS.filter(item=>item.group==='property'))properties.appendChild(makeButton(document,definition));panel.appendChild(properties);
    const actions=document.createElement('div');actions.className='layer-actions';for(const definition of COMMANDS.filter(item=>item.group==='edit'||item.group==='order'))actions.appendChild(makeButton(document,definition));panel.appendChild(actions);
    const transport=body.querySelector('.deck-transport');body.insertBefore(panel,transport||body.lastChild);return panel;
  }
  function runCommand(name,value){
    const env=environment();
    try{if(!env||typeof env.layerCommand!=='function'){notify('Layer controls unavailable');return false;}}
    catch(_){notify('Layer controls unavailable');return false;}
    try{if(typeof env.canInteract==='function'&&env.canInteract()===false){notify('Finish the active stroke before editing layers');return false;}}catch(_){return false;}
    let result=false;
    try{result=env.layerCommand(String(name||''),value)!==false;}catch(_){result=false;}
    if(!result)notify('Layer command unavailable');queueState();return result;
  }
  function updateState(){
    const document=root.document;if(!document)return false;installStyle(document);if(!ensurePanel(document))return false;
    const current=state();panel.hidden=!layersOpen(document);
    setText(panel.querySelector('[data-layer-state="count"]'),`${current.count} layer${current.count===1?'':'s'}`);
    setText(panel.querySelector('[data-layer-state="position"]'),layerLabel(current));
    setText(panel.querySelector('[data-layer-state="visibility"]'),visibilityLabel(current));
    setText(panel.querySelector('[data-layer-state="opacity"]'),`${current.opacity}%`);
    setText(panel.querySelector('[data-layer-state="blend"]'),current.blend);
    const visibility=panel.querySelector('[data-layer-command="visibility"]');if(visibility)setText(visibility,current.visible?'Hide':'Show');
    for(const button of panel.querySelectorAll('button[data-layer-command]')){
      const command=button.dataset.layerCommand,value=Number(button.dataset.layerValue);
      let allowed=current.canInteract&&current.count>0;
      if(command==='selectAbove')allowed=allowed&&current.canSelectAbove;
      else if(command==='selectBelow')allowed=allowed&&current.canSelectBelow;
      else if(command==='moveUp')allowed=allowed&&current.canMoveUp;
      else if(command==='moveDown')allowed=allowed&&current.canMoveDown;
      else if(command==='delete')allowed=allowed&&current.canDelete;
      else if(command==='mergeDown')allowed=allowed&&current.canMergeDown;
      else if(command==='add')allowed=current.canInteract;
      button.disabled=!allowed;
      button.classList.toggle('active',command==='opacity'&&value===current.opacity);
    }
    return true;
  }
  function install(){const document=root.document;if(!document)return false;installStyle(document);const installed=!!ensurePanel(document);if(installed)updateState();return installed;}
  function scheduleInstall(){if(installTimer)return;const run=()=>{installTimer=0;if(!install())installTimer=root.setTimeout(run,60);};installTimer=root.setTimeout(run,0);}
  if(root&&typeof root.addEventListener==='function'){
    root.addEventListener('load',scheduleInstall);root.addEventListener('resize',queueState);root.addEventListener('orientationchange',queueState);root.addEventListener('inkframe:layers',queueState);
    if(root.document&&typeof root.MutationObserver==='function'){observer=new root.MutationObserver(()=>{if(!panel||!panel.isConnected)scheduleInstall();else queueState();});observer.observe(root.document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});}
  }
  scheduleInstall();
  const api={COMMANDS,normalizeLayerState,layerLabel,visibilityLabel,runCommand,updateState,install,onNotice:null,directLayerWrites:0,directCanvasWrites:0,directOrderWrites:0,directProjectSchemaWrites:0,archiveWrites:0,storageWrites:0,networkWrites:0,delegatedLayerCommands:true,artworkReads:0,layerNameReads:0,projectNameReads:0};
  root.InkFrameLayerWorkspace=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
