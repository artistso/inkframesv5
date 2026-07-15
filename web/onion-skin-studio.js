// InkFrame — Onion Skin Studio
'use strict';
(function(root){
  const DEFAULTS=Object.freeze({
    enabled:true,depth:2,pastOpacity:.34,futureOpacity:.24,tint:.5,
    layerOnly:false,pastColor:'#880057',futureColor:'#f7cac9',
  });
  const PRESETS=Object.freeze([
    Object.freeze({id:'clean',label:'Clean',depth:1,pastOpacity:.24,futureOpacity:.16,tint:.20,layerOnly:false}),
    Object.freeze({id:'inbetween',label:'Inbetween',depth:2,pastOpacity:.38,futureOpacity:.28,tint:.50,layerOnly:false}),
    Object.freeze({id:'rough',label:'Rough',depth:4,pastOpacity:.26,futureOpacity:.20,tint:.65,layerOnly:false}),
    Object.freeze({id:'arc',label:'Arc',depth:6,pastOpacity:.18,futureOpacity:.14,tint:.82,layerOnly:false}),
    Object.freeze({id:'layer',label:'Layer',depth:3,pastOpacity:.32,futureOpacity:.24,tint:.55,layerOnly:true}),
  ]);
  const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const cleanHex=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():fallback;

  function normalizeSettings(value,fallback){
    const base=fallback&&typeof fallback==='object'?fallback:DEFAULTS,input=value&&typeof value==='object'?value:{};
    return Object.freeze({
      enabled:typeof input.enabled==='boolean'?input.enabled:!!base.enabled,
      depth:Math.round(clamp(finite(input.depth,base.depth),0,8)),
      pastOpacity:clamp(finite(input.pastOpacity,base.pastOpacity),.02,.85),
      futureOpacity:clamp(finite(input.futureOpacity,base.futureOpacity),.02,.85),
      tint:clamp(finite(input.tint,base.tint),0,1),
      layerOnly:typeof input.layerOnly==='boolean'?input.layerOnly:!!base.layerOnly,
      pastColor:cleanHex(input.pastColor,cleanHex(base.pastColor,DEFAULTS.pastColor)),
      futureColor:cleanHex(input.futureColor,cleanHex(base.futureColor,DEFAULTS.futureColor)),
    });
  }
  function applyPreset(settings,id){
    const current=normalizeSettings(settings),preset=PRESETS.find(item=>item.id===String(id||''));
    return preset?normalizeSettings({...current,...preset,enabled:true},current):current;
  }
  function settingsSignature(settings){
    const value=normalizeSettings(settings);
    return [value.enabled?1:0,value.depth,value.pastOpacity.toFixed(3),value.futureOpacity.toFixed(3),value.tint.toFixed(3),value.layerOnly?1:0,value.pastColor,value.futureColor].join('|');
  }
  function matchingPreset(settings){
    const value=normalizeSettings(settings);
    return PRESETS.find(preset=>{
      const candidate=applyPreset(value,preset.id);
      return candidate.depth===value.depth&&Math.abs(candidate.pastOpacity-value.pastOpacity)<1e-9&&Math.abs(candidate.futureOpacity-value.futureOpacity)<1e-9&&Math.abs(candidate.tint-value.tint)<1e-9&&candidate.layerOnly===value.layerOnly;
    })||null;
  }

  const projectViews=new WeakMap();
  const fallbackView={open:false};
  function viewFor(project){
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function environment(){
    try{return typeof root.InkFrameOnionStudioEnvironment==='function'?root.InkFrameOnionStudioEnvironment():null;}catch(_){return null;}
  }
  function snapshot(){
    const env=environment();if(!env||typeof env.snapshot!=='function')return normalizeSettings(DEFAULTS);
    try{return normalizeSettings(env.snapshot(),DEFAULTS);}catch(_){return normalizeSettings(DEFAULTS);}
  }
  function canEdit(env){return !env||typeof env.canEdit!=='function'||env.canEdit()!==false;}
  function notify(env,message){try{if(env&&typeof env.notify==='function')env.notify(message);}catch(_){};}

  let panel=null,toggle=null,styleInstalled=false,observer=null,installTimer=0;
  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeOnionStudioStyle='true';
    style.textContent=`
.inkframe-onion-studio-toggle.on{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important;box-shadow:0 0 18px rgba(187,0,55,.62),inset 0 1px 0 var(--rim)!important}
.inkframe-onion-studio{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:46;width:min(96vw,760px);max-height:min(72vh,620px);overflow:auto;padding:12px;border-radius:24px;background:rgba(10,0,10,.94);border:1px solid rgba(247,202,201,.44);box-shadow:0 24px 70px rgba(10,0,10,.72),inset 0 1px 0 rgba(255,255,255,.19);backdrop-filter:blur(18px) saturate(145%);-webkit-backdrop-filter:blur(18px) saturate(145%);color:var(--text);font-family:var(--font-ui)}
.inkframe-onion-studio[hidden]{display:none}.inkframe-onion-studio header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.inkframe-onion-studio h2{margin:0;font:800 15px/1.1 var(--font-ui);letter-spacing:.08em;text-transform:uppercase}.inkframe-onion-close{min-width:40px}.inkframe-onion-status{margin:0 0 10px;color:var(--dim);font:750 10px/1.35 var(--font-ui);letter-spacing:.04em}.inkframe-onion-presets,.inkframe-onion-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.inkframe-onion-studio button,.inkframe-onion-studio input{touch-action:manipulation}.inkframe-onion-studio button{min-height:36px;padding:7px 11px;border-radius:999px;border:1px solid rgba(247,202,201,.34);background:rgba(255,240,243,.08);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.06em;text-transform:uppercase}.inkframe-onion-studio button[aria-pressed="true"],.inkframe-onion-studio button.on{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}.inkframe-onion-studio button:disabled{opacity:.38}.inkframe-onion-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.inkframe-onion-control{display:grid;grid-template-columns:110px 1fr 48px;align-items:center;gap:8px;padding:8px;border-radius:15px;border:1px solid rgba(247,202,201,.18);background:rgba(255,240,243,.045)}.inkframe-onion-control label{font:800 9px/1.2 var(--font-ui);letter-spacing:.05em;text-transform:uppercase}.inkframe-onion-control output{text-align:right;color:var(--rose);font:800 10px/1 var(--font-mono)}.inkframe-onion-control input[type=range]{width:100%;accent-color:var(--accent)}.inkframe-onion-colors{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.inkframe-onion-color{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:15px;border:1px solid rgba(247,202,201,.18);background:rgba(255,240,243,.045);font:800 9px/1 var(--font-ui);letter-spacing:.05em;text-transform:uppercase}.inkframe-onion-color input{width:44px;height:30px;padding:0;border:0;background:transparent}.inkframe-onion-warning{color:#ffd7a3}.inkframe-onion-studio[data-blocked="true"]{outline:2px solid rgba(255,190,120,.65)}
@media (pointer:coarse){.inkframe-onion-studio button{min-height:42px;padding:9px 13px}.inkframe-onion-control{min-height:52px}.inkframe-onion-studio{bottom:12px}}
@media (max-width:640px){.inkframe-onion-grid,.inkframe-onion-colors{grid-template-columns:1fr}.inkframe-onion-control{grid-template-columns:92px 1fr 44px}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }
  function actionsNode(document){
    return Array.from(document.querySelectorAll('.node')).find(node=>{
      const label=node.querySelector('.orb .lbl');return label&&String(label.textContent||'').trim()==='Actions';
    })||null;
  }
  function makeToggle(document,node){
    const kid=document.createElement('div');kid.className='kid glass inkframe-onion-studio-toggle';kid.title='Open Onion Skin Studio';
    kid.innerHTML='<span class="glyph">◎</span><span class="sub">O·Studio</span>';
    kid.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const env=environment(),view=viewFor(env&&env.project);view.open=!view.open;renderPanel();if(node.classList.contains('open')&&typeof node._relayout==='function')node._relayout();});
    node._kids.appendChild(kid);if(node.classList.contains('open')&&typeof node._relayout==='function')node._relayout();return kid;
  }
  function rangeRow(document,key,label,min,max,step,multiplier){
    const row=document.createElement('div');row.className='inkframe-onion-control';
    const name=document.createElement('label');name.textContent=label;const input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.dataset.key=key;
    const out=document.createElement('output');out.dataset.output=key;row.append(name,input,out);
    input.addEventListener('input',()=>{out.textContent=key==='depth'?String(Math.round(Number(input.value))):`${Math.round(Number(input.value))}%`;});
    input.addEventListener('change',()=>{const raw=Number(input.value),value=multiplier?raw*multiplier:raw;applyChange({[key]:value},`${label} · ${out.textContent}`);});return row;
  }
  function ensurePanel(document){
    if(panel&&panel.isConnected)return panel;
    panel=document.createElement('section');panel.className='inkframe-onion-studio';panel.hidden=true;panel.setAttribute('aria-label','Onion Skin Studio');
    document.body.appendChild(panel);return panel;
  }
  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;if(className)button.className=className;button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();handler(button);});return button;
  }
  function applyChange(patch,message){
    const env=environment();if(!env||typeof env.apply!=='function')return false;
    if(!canEdit(env)){notify(env,'Finish the active stroke before changing onion settings');renderPanel();return false;}
    const current=snapshot(),next=normalizeSettings({...current,...patch},current);
    if(settingsSignature(next)===settingsSignature(current))return true;
    const result=env.apply(next);
    if(!result)return false;notify(env,message||'Onion Skin Studio');renderPanel();return true;
  }
  function renderPanel(){
    const document=root.document;if(!document)return false;installStyle(document);ensurePanel(document);
    const env=environment(),view=viewFor(env&&env.project),settings=snapshot(),preset=matchingPreset(settings),blocked=!canEdit(env);
    panel.hidden=!view.open;panel.dataset.blocked=blocked?'true':'false';if(toggle){toggle.classList.toggle('on',view.open);toggle.setAttribute('aria-pressed',view.open?'true':'false');}
    if(!view.open)return true;
    panel.innerHTML='';
    const header=document.createElement('header'),title=document.createElement('h2');title.textContent='Onion Skin Studio';header.appendChild(title);header.appendChild(makeButton(document,'×','inkframe-onion-close',()=>{view.open=false;renderPanel();}));panel.appendChild(header);
    const status=document.createElement('p');status.className='inkframe-onion-status'+(blocked?' inkframe-onion-warning':'');status.textContent=blocked?'Active stroke · controls temporarily locked':`${settings.enabled?'On':'Off'} · ${settings.depth} frame${settings.depth===1?'':'s'} each side · ${settings.layerOnly?'active layer':'full frame'}${preset?` · ${preset.label}`:''}`;panel.appendChild(status);
    const presets=document.createElement('div');presets.className='inkframe-onion-presets';
    for(const item of PRESETS){const button=makeButton(document,item.label,'',()=>{const next=applyPreset(snapshot(),item.id);applyChange(next,`Onion preset · ${item.label}`);});button.setAttribute('aria-pressed',preset&&preset.id===item.id?'true':'false');button.disabled=blocked;presets.appendChild(button);}panel.appendChild(presets);
    const grid=document.createElement('div');grid.className='inkframe-onion-grid';
    grid.appendChild(rangeRow(document,'depth','Depth',0,8,1,0));grid.appendChild(rangeRow(document,'tint','Tint',0,100,1,.01));grid.appendChild(rangeRow(document,'pastOpacity','Past ghost',2,85,1,.01));grid.appendChild(rangeRow(document,'futureOpacity','Future ghost',2,85,1,.01));panel.appendChild(grid);
    const colors=document.createElement('div');colors.className='inkframe-onion-colors';
    for(const [key,label] of [['pastColor','Past color'],['futureColor','Future color']]){
      const wrap=document.createElement('label');wrap.className='inkframe-onion-color';wrap.textContent=label;
      const input=document.createElement('input');input.type='color';input.dataset.key=key;input.value=settings[key];input.disabled=blocked;
      input.addEventListener('input',()=>{wrap.dataset.previewColor=input.value;});
      input.addEventListener('change',()=>applyChange({[key]:input.value},`${label} · ${input.value}`));
      wrap.appendChild(input);colors.appendChild(wrap);
    }
    panel.appendChild(colors);
    const actions=document.createElement('div');actions.className='inkframe-onion-actions';
    const enabled=makeButton(document,settings.enabled?'Onion On':'Onion Off','',()=>applyChange({enabled:!settings.enabled},settings.enabled?'Onion skin off':'Onion skin on'));enabled.setAttribute('aria-pressed',settings.enabled?'true':'false');enabled.disabled=blocked;actions.appendChild(enabled);
    const layer=makeButton(document,settings.layerOnly?'Active layer':'Full frame','',()=>applyChange({layerOnly:!settings.layerOnly},settings.layerOnly?'Onion · full frame':'Onion · active layer only'));layer.setAttribute('aria-pressed',settings.layerOnly?'true':'false');layer.disabled=blocked;actions.appendChild(layer);
    const swap=makeButton(document,'Swap colors','',()=>applyChange({pastColor:settings.futureColor,futureColor:settings.pastColor},'Onion colors swapped'));swap.disabled=blocked;actions.appendChild(swap);
    const reset=makeButton(document,'Reset','',()=>applyChange(DEFAULTS,'Onion settings reset'));reset.disabled=blocked;actions.appendChild(reset);panel.appendChild(actions);
    for(const input of panel.querySelectorAll('input[type=range]')){const key=input.dataset.key,value=settings[key];input.value=String(key==='depth'?value:Math.round(value*100));input.disabled=blocked;const out=panel.querySelector(`[data-output="${key}"]`);if(out)out.textContent=key==='depth'?String(value):`${Math.round(value*100)}%`;}
    return true;
  }
  function install(){
    const document=root.document;if(!document)return false;installStyle(document);ensurePanel(document);
    const node=actionsNode(document);if(!node||!node._kids)return false;
    const existing=node._kids.querySelector('.inkframe-onion-studio-toggle');toggle=existing||makeToggle(document,node);renderPanel();return true;
  }
  function scheduleInstall(){
    if(installTimer)return;const run=()=>{installTimer=0;if(!install()){installTimer=root.setTimeout(run,60);}};installTimer=root.setTimeout(run,0);
  }
  if(root&&typeof root.addEventListener==='function'){
    root.addEventListener('inkframe:onion-settings',()=>renderPanel());root.addEventListener('load',scheduleInstall);
    if(root.document&&typeof root.MutationObserver==='function'){observer=new root.MutationObserver(()=>{if(!toggle||!toggle.isConnected)scheduleInstall();});observer.observe(root.document.documentElement,{childList:true,subtree:true});}
  }
  scheduleInstall();

  const api={
    DEFAULTS,PRESETS,normalizeSettings,applyPreset,settingsSignature,matchingPreset,snapshot,applyChange,renderPanel,install,
    projectCanvasWrites:0,artworkUndoWrites:0,projectSchemaWrites:0,historyWrites:0,devicePreferenceWrites:true,randomWrites:0,networkWrites:0,
  };
  root.InkFrameOnionSkinStudio=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
