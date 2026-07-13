// InkFrame — radial exposure rhythms, preview, and timing-only history
'use strict';
(function(root){
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clampHold=value=>Math.max(1,Math.min(8,Math.round(finite(value,1))));
  const freezePattern=(id,label,values)=>Object.freeze({id,label,values:Object.freeze(values.map(clampHold))});
  const PATTERNS=Object.freeze([
    freezePattern('ones','Ones',[1]),
    freezePattern('twos','Twos',[2]),
    freezePattern('threes','Threes',[3]),
    freezePattern('snap','Snap',[1,1,2,1]),
    freezePattern('ease-in','Ease In',[3,3,2,2,1,1]),
    freezePattern('ease-out','Ease Out',[1,1,2,2,3,3]),
  ]);
  const patternById=id=>PATTERNS.find(pattern=>pattern.id===String(id||''))||null;

  function normalizeIndices(indices,count){
    const total=Math.max(0,Math.floor(finite(count,0))),seen=new Set(),result=[];
    for(const value of indices||[]){
      const index=Math.floor(finite(value,-1));
      if(index>=0&&index<total&&!seen.has(index)){seen.add(index);result.push(index);}
    }
    result.sort((a,b)=>a-b);return Object.freeze(result);
  }

  function resolveTargetIndices(environment){
    const env=environment||{},count=Math.max(0,Math.floor(finite(env.framesLength,0)));
    if(!count)return Object.freeze({kind:'none',label:'No frames',indices:Object.freeze([])});
    const selected=env.selectedFrames&&typeof env.selectedFrames[Symbol.iterator]==='function'
      ? normalizeIndices(Array.from(env.selectedFrames),count):Object.freeze([]);
    if(selected.length)return Object.freeze({kind:'selection',label:`Selection · ${selected.length}`,indices:selected});
    if(env.loopOn&&count>1){
      const a=Math.max(0,Math.min(count-1,Math.floor(finite(env.loopIn,0))));
      const b=Math.max(0,Math.min(count-1,Math.floor(finite(env.loopOut,count-1))));
      const first=Math.min(a,b),last=Math.max(a,b),indices=[];
      for(let i=first;i<=last;i++)indices.push(i);
      return Object.freeze({kind:'loop',label:`Loop · ${indices.length}`,indices:Object.freeze(indices)});
    }
    const indices=Object.freeze(Array.from({length:count},(_,index)=>index));
    return Object.freeze({kind:'all',label:`All frames · ${count}`,indices});
  }

  function assignmentsForPattern(pattern,indices,holdAt,phase=0){
    const source=pattern&&Array.isArray(pattern.values)?pattern.values:[];
    if(!source.length)return Object.freeze([]);
    const normalized=normalizeIndices(indices,Number.MAX_SAFE_INTEGER),offset=Math.floor(finite(phase,0)),entries=[];
    normalized.forEach((index,order)=>{
      const before=clampHold(typeof holdAt==='function'?holdAt(index):1);
      const after=clampHold(source[((order+offset)%source.length+source.length)%source.length]);
      entries.push(Object.freeze({index,before,after}));
    });
    return Object.freeze(entries);
  }

  function changedAssignments(assignments){return Object.freeze((assignments||[]).filter(entry=>entry&&entry.before!==entry.after));}
  function invertAssignments(assignments){return Object.freeze((assignments||[]).map(entry=>Object.freeze({index:entry.index,before:entry.after,after:entry.before})));}

  const projectViews=new WeakMap(),projectHistories=new WeakMap();
  const fallbackView={open:false,preview:false,previewPatternId:null};
  const fallbackHistory={undo:[],redo:[]};
  function viewFor(env){
    const project=env&&env.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);if(!view){view={open:false,preview:false,previewPatternId:null};projectViews.set(project,view);}return view;
    }
    return fallbackView;
  }
  function historyFor(env){
    const project=env&&env.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let history=projectHistories.get(project);if(!history){history={undo:[],redo:[]};projectHistories.set(project,history);}return history;
    }
    return fallbackHistory;
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView,history=project&&projectHistories.get(project)||fallbackHistory;
    return Object.freeze({open:!!view.open,preview:!!view.preview,previewPatternId:view.previewPatternId||null,undoDepth:history.undo.length,redoDepth:history.redo.length});
  }

  let styleInstalled=false,lastBoard=null,lastEnvironment=null,lastPlan=null,rendering=false,refreshQueued=false;
  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeRhythmStyle='true';
    style.textContent=`
.inkframe-rhythm-toggle[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent))!important;border-color:var(--rim)!important}
.inkframe-rhythm-shelf{position:absolute;left:50%;top:-158px;transform:translateX(-50%);z-index:10;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;max-width:min(92vw,760px);padding:6px;border-radius:18px;background:rgba(10,0,10,.74);border:1px solid rgba(247,202,201,.30);box-shadow:0 8px 24px rgba(10,0,10,.44),inset 0 1px 0 rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.inkframe-rhythm-shelf button{min-height:31px;padding:6px 9px;border-radius:999px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.045em;text-transform:uppercase;touch-action:manipulation}
.inkframe-rhythm-shelf button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}
.inkframe-rhythm-shelf button:disabled{opacity:.32}
.inkframe-rhythm-scope{min-width:116px;color:var(--blush);font:800 9px/1.2 var(--font-ui);letter-spacing:.045em;text-align:center;white-space:nowrap}
.inkframe-rhythm-preview-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2}
.inkframe-rhythm-preview-arc{fill:none;stroke:#fff;stroke-width:6.6;stroke-linecap:round;stroke-dasharray:3 4;vector-effect:non-scaling-stroke;opacity:.88;filter:drop-shadow(0 0 8px rgba(255,255,255,.9)) drop-shadow(0 0 12px rgba(187,0,55,.82))}
@media (pointer:coarse){.inkframe-rhythm-shelf button{min-height:39px;padding:7px 11px}.inkframe-rhythm-scope{min-width:132px}}
@media (prefers-reduced-motion:reduce){.inkframe-rhythm-preview-arc{filter:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }

  function canEdit(env){
    if(env&&typeof env.canEditTiming==='function')return env.canEditTiming()!==false;
    return !(env&&typeof env.canNavigate==='function')||env.canNavigate()!==false;
  }
  function scheduleRefresh(){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{refreshQueued=false;if(lastBoard&&lastEnvironment)render(lastBoard,lastEnvironment);};
    if(root&&typeof root.setTimeout==='function')root.setTimeout(run,0);else run();
  }
  function writeAssignments(assignments){
    if(!lastEnvironment||!canEdit(lastEnvironment)||typeof lastEnvironment.setHolds!=='function')return false;
    const entries=(assignments||[]).map(entry=>({index:entry.index,value:clampHold(entry.after)}));
    if(!entries.length)return false;
    lastEnvironment.setHolds(entries);scheduleRefresh();return true;
  }
  function applyPattern(patternId){
    const pattern=patternById(patternId);if(!pattern||!lastEnvironment||!canEdit(lastEnvironment))return false;
    const scope=resolveTargetIndices(lastEnvironment),assignments=changedAssignments(assignmentsForPattern(pattern,scope.indices,lastEnvironment.holdAt));
    if(!assignments.length)return false;
    const history=historyFor(lastEnvironment);if(!writeAssignments(assignments))return false;
    history.undo.push(Object.freeze({patternId:pattern.id,label:pattern.label,scope:scope.kind,assignments}));
    if(history.undo.length>20)history.undo.shift();history.redo.length=0;
    const view=viewFor(lastEnvironment);view.previewPatternId=null;return true;
  }
  function undo(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;
    const history=historyFor(lastEnvironment),transaction=history.undo.pop();if(!transaction)return false;
    if(!writeAssignments(invertAssignments(transaction.assignments))){history.undo.push(transaction);return false;}
    history.redo.push(transaction);return true;
  }
  function redo(){
    if(!lastEnvironment||!canEdit(lastEnvironment))return false;
    const history=historyFor(lastEnvironment),transaction=history.redo.pop();if(!transaction)return false;
    if(!writeAssignments(transaction.assignments)){history.redo.push(transaction);return false;}
    history.undo.push(transaction);return true;
  }

  function createPreview(document,board,plan,env,pattern){
    const timing=root.InkFrameRadialTiming;if(!timing||typeof timing.holdArcPath!=='function')return;
    const scope=resolveTargetIndices(env),assignments=assignmentsForPattern(pattern,scope.indices,env.holdAt);
    if(!assignments.length)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('inkframe-rhythm-preview-svg');
    svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    for(const entry of assignments){
      const slot=plan.slots[entry.index];if(!slot)continue;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('inkframe-rhythm-preview-arc');
      path.dataset.frame=String(entry.index);path.dataset.hold=String(entry.after);path.setAttribute('d',timing.holdArcPath(plan,slot,entry.after));svg.appendChild(path);
    }
    board.appendChild(svg);
  }

  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});return button;
  }
  function createShelf(document,board,env,view){
    const shelf=document.createElement('div');shelf.className='inkframe-rhythm-shelf';shelf.setAttribute('role','toolbar');shelf.setAttribute('aria-label','Exposure rhythm patterns');
    const scope=resolveTargetIndices(env),scopeLabel=document.createElement('span');scopeLabel.className='inkframe-rhythm-scope';scopeLabel.textContent=scope.label;shelf.appendChild(scopeLabel);
    for(const pattern of PATTERNS){
      const button=makeButton(document,pattern.label,`inkframe-rhythm-pattern inkframe-rhythm-${pattern.id}`,()=>{
        if(view.preview){view.previewPatternId=pattern.id;scheduleRefresh();}else applyPattern(pattern.id);
      });
      button.dataset.pattern=pattern.id;button.setAttribute('aria-pressed',view.preview&&view.previewPatternId===pattern.id?'true':'false');shelf.appendChild(button);
    }
    const preview=makeButton(document,'Preview','inkframe-rhythm-preview',()=>{view.preview=!view.preview;if(!view.preview)view.previewPatternId=null;scheduleRefresh();});
    preview.setAttribute('aria-pressed',view.preview?'true':'false');shelf.appendChild(preview);
    const apply=makeButton(document,'Apply','inkframe-rhythm-apply',()=>{if(view.previewPatternId)applyPattern(view.previewPatternId);});
    apply.disabled=!view.previewPatternId;shelf.appendChild(apply);
    const history=historyFor(env),undoButton=makeButton(document,'Undo','inkframe-rhythm-undo',undo);undoButton.disabled=!history.undo.length;shelf.appendChild(undoButton);
    const redoButton=makeButton(document,'Redo','inkframe-rhythm-redo',redo);redoButton.disabled=!history.redo.length;shelf.appendChild(redoButton);
    board.appendChild(shelf);
  }

  function installBoard(board){
    if(!board||board._inkframeRhythmInstalled)return;board._inkframeRhythmInstalled=true;
    board.addEventListener('keydown',event=>{
      if(!lastEnvironment||!canEdit(lastEnvironment))return;
      const timing=root.InkFrameRadialTiming,mode=timing&&timing.viewSnapshot?timing.viewSnapshot(lastEnvironment.project).timingMode:false;
      if(!mode)return;const view=viewFor(lastEnvironment);let handled=true;
      if(event.key.toLowerCase()==='r')view.open=!view.open;
      else if(event.key.toLowerCase()==='p'&&view.open){view.preview=!view.preview;if(!view.preview)view.previewPatternId=null;}
      else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&view.open){event.shiftKey?redo():undo();return;}
      else handled=false;
      if(handled){event.preventDefault();event.stopImmediatePropagation();scheduleRefresh();}
    },true);
  }

  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,timing=root.InkFrameRadialTiming,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan||!timing)return false;
    lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;installStyle(document);installBoard(board);rendering=true;
    try{
      for(const node of board.querySelectorAll('.inkframe-rhythm-shelf,.inkframe-rhythm-preview-svg,.inkframe-rhythm-toggle'))node.remove();
      const timingMode=timing.viewSnapshot(lastEnvironment.project).timingMode,tools=board.querySelector('.inkframe-timing-tools'),view=viewFor(lastEnvironment);
      if(!timingMode){view.open=false;view.preview=false;view.previewPatternId=null;return true;}
      if(tools){
        const toggle=makeButton(document,'Rhythm','inkframe-rhythm-toggle',()=>{view.open=!view.open;scheduleRefresh();});
        toggle.setAttribute('aria-pressed',view.open?'true':'false');toggle.title='Exposure rhythm patterns and timing-only history';tools.appendChild(toggle);
      }
      if(view.open)createShelf(document,board,lastEnvironment,view);
      const pattern=view.preview&&view.previewPatternId?patternById(view.previewPatternId):null;if(pattern)createPreview(document,board,plan,lastEnvironment,pattern);
      return true;
    }finally{rendering=false;}
  }

  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialPatternsPatched)return false;
    const originalRender=radial.render;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};
    radial.__radialPatternsPatched=true;return true;
  }

  const api={
    patterns:PATTERNS,patternById,normalizeIndices,resolveTargetIndices,assignmentsForPattern,changedAssignments,invertAssignments,
    applyPattern,undo,redo,render,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,projectSchemaWrites:0,
  };
  root.InkFrameRadialPatterns=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
