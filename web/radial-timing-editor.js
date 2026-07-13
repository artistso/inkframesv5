// InkFrame — radial timing editor for per-frame holds and loop bounds
'use strict';
(function(root){
  const TAU=Math.PI*2;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  const normalizeHold=value=>Math.max(1,Math.min(8,Math.round(finite(value,1))));

  function holdFromRadialDrag(startHold,startRadius,currentRadius,stepPx=18){
    const step=Math.max(8,finite(stepPx,18));
    return normalizeHold(normalizeHold(startHold)+Math.round((finite(currentRadius)-finite(startRadius))/step));
  }

  function holdArcGeometry(plan,slot,hold){
    if(!plan||!slot)return null;
    const ring=plan.rings&&plan.rings[slot.ring];
    const size=Math.max(1,finite(ring&&ring.size,1));
    const unit=TAU/size;
    const normalized=normalizeHold(hold);
    const span=Math.min(unit*.82,unit*(.18+normalized*.075));
    const start=slot.angle+span/2,end=slot.angle-span/2;
    const rx=Math.max(1,finite(slot.rx)+11),ry=Math.max(1,finite(slot.ry)+11);
    return Object.freeze({start,end,span,rx,ry,hold:normalized,ring:slot.ring,index:slot.index});
  }

  function holdArcPath(plan,slot,hold){
    const g=holdArcGeometry(plan,slot,hold);if(!g)return '';
    const cx=plan.metrics.centerX,cy=plan.metrics.centerY;
    const sx=cx+Math.cos(g.start)*g.rx,sy=cy+Math.sin(g.start)*g.ry;
    const ex=cx+Math.cos(g.end)*g.rx,ey=cy+Math.sin(g.end)*g.ry;
    return `M${sx.toFixed(2)},${sy.toFixed(2)} A${g.rx.toFixed(2)},${g.ry.toFixed(2)} 0 ${g.span>Math.PI?1:0} 0 ${ex.toFixed(2)},${ey.toFixed(2)}`;
  }

  function loopHandlePoint(plan,index,offset=22){
    const slot=plan&&plan.slots&&plan.slots[Math.floor(finite(index,-1))];
    if(!slot)return null;
    const rx=Math.max(1,slot.rx+finite(offset,22)),ry=Math.max(1,slot.ry+finite(offset,22));
    return Object.freeze({
      index:slot.index,ring:slot.ring,angle:slot.angle,
      x:plan.metrics.centerX+Math.cos(slot.angle)*rx,
      y:plan.metrics.centerY+Math.sin(slot.angle)*ry,
    });
  }

  function clampLoopRange(loopIn,loopOut,count){
    const total=Math.max(0,Math.floor(finite(count,0)));
    if(!total)return Object.freeze({loopIn:0,loopOut:0});
    const a=Math.max(0,Math.min(total-1,Math.floor(finite(loopIn,0))));
    const b=Math.max(0,Math.min(total-1,Math.floor(finite(loopOut,total-1))));
    return Object.freeze({loopIn:Math.min(a,b),loopOut:Math.max(a,b)});
  }

  function nearestFilledIndex(plan,x,y,count){
    const radial=root.InkFrameRadialTimeline;
    if(radial&&typeof radial.nearestSlotIndex==='function')return radial.nearestSlotIndex(plan,x,y,count,-1);
    const total=Math.min(Math.max(0,Math.floor(finite(count,0))),plan&&plan.slots?plan.slots.length:0);
    let best=-1,bestD=Infinity;
    for(let i=0;i<total;i++){
      const p=plan.slots[i],d=Math.pow(p.x-finite(x),2)+Math.pow(p.y-finite(y),2);
      if(d<bestD){bestD=d;best=i;}
    }
    return best;
  }

  const projectViews=new WeakMap();
  const fallbackView={timingMode:false};
  function viewFor(env){
    const project=env&&env.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);
      if(!view){view={timingMode:false};projectViews.set(project,view);}
      return view;
    }
    return fallbackView;
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView;
    return Object.freeze({timingMode:!!view.timingMode});
  }

  let styleInstalled=false,lastBoard=null,lastEnvironment=null,lastPlan=null;
  let lastPlayback=Object.freeze({current:0,loopOn:false,loopIn:0,loopOut:0});
  let holdDrag=null,loopDrag=null,rendering=false,refreshQueued=false;

  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeRadialTimingStyle='true';
    style.textContent=`
#frameBoard[data-radial-timing="true"] .inkframe-radial-timing-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1}
.inkframe-hold-arc{fill:none;stroke:rgba(247,202,201,.44);stroke-width:3.2;stroke-linecap:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 4px rgba(187,0,55,.38));transition:stroke-width .14s,stroke .14s,opacity .14s}
#frameBoard[data-timing-mode="true"] .inkframe-hold-arc{stroke:rgba(247,202,201,.78);stroke-width:4.6}
.inkframe-hold-arc.current{stroke:#fff;stroke-width:5.4;filter:drop-shadow(0 0 7px rgba(255,255,255,.82)) drop-shadow(0 0 9px rgba(187,0,55,.75))}
.inkframe-hold-arc.selected{stroke:var(--accent);stroke-width:5}
.inkframe-timing-tools{position:absolute;left:50%;top:-108px;transform:translateX(-50%);z-index:9;display:flex;align-items:center;gap:5px;padding:5px;border-radius:999px;background:rgba(10,0,10,.68);border:1px solid rgba(247,202,201,.28);box-shadow:0 7px 20px rgba(10,0,10,.38),inset 0 1px 0 rgba(255,255,255,.16);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}
.inkframe-timing-tools button{min-width:42px;min-height:30px;padding:5px 8px;border-radius:999px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.055em;text-transform:uppercase;touch-action:manipulation}
.inkframe-timing-tools .inkframe-timing-status{min-width:104px;padding:0 8px;color:var(--blush);font:800 9px/1.2 var(--font-ui);letter-spacing:.055em;text-align:center;white-space:nowrap}
.inkframe-timing-loop-handle{position:absolute;transform:translate(-50%,-50%);z-index:7;width:30px;height:30px;padding:0;border-radius:50%;border:2px solid rgba(255,255,255,.94);background:linear-gradient(160deg,var(--accent-deep),var(--accent));color:#fff;box-shadow:0 0 0 2px rgba(42,0,26,.72),0 0 16px rgba(187,0,55,.78);font:900 8px/1 var(--font-ui);letter-spacing:.02em;touch-action:none}
.inkframe-timing-loop-handle[data-which="out"]{background:linear-gradient(160deg,var(--rose),var(--accent-deep))}
@media (pointer:coarse){.inkframe-timing-tools button{min-width:48px;min-height:38px}.inkframe-timing-loop-handle{width:38px;height:38px;font-size:9px}}
@media (prefers-reduced-motion:reduce){.inkframe-hold-arc{transition:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }

  function canEdit(env){
    if(env&&typeof env.canEditTiming==='function')return env.canEditTiming()!==false;
    return !(env&&typeof env.canNavigate==='function')||env.canNavigate()!==false;
  }

  function boardPoint(board,event){
    const rect=board&&board.getBoundingClientRect?board.getBoundingClientRect():{left:0,top:0};
    return {x:finite(event&&event.clientX)-finite(rect.left),y:finite(event&&event.clientY)-finite(rect.top)};
  }

  function radialDistance(plan,point){
    return Math.hypot(point.x-plan.metrics.centerX,point.y-plan.metrics.centerY);
  }

  function scheduleRefresh(){
    if(refreshQueued)return;refreshQueued=true;
    const run=()=>{refreshQueued=false;if(lastBoard&&lastEnvironment)render(lastBoard,lastEnvironment);};
    if(root&&typeof root.setTimeout==='function')root.setTimeout(run,0);else run();
  }

  function applyHold(index,value){
    if(!lastEnvironment||!canEdit(lastEnvironment)||typeof lastEnvironment.setHold!=='function')return false;
    lastEnvironment.setHold(index,normalizeHold(value));scheduleRefresh();return true;
  }

  function applyLoopRange(loopIn,loopOut){
    if(!lastEnvironment||!canEdit(lastEnvironment)||typeof lastEnvironment.setLoopRange!=='function')return false;
    const range=clampLoopRange(loopIn,loopOut,lastEnvironment.framesLength);
    lastEnvironment.setLoopRange(range.loopIn,range.loopOut);lastPlayback=Object.freeze({...lastPlayback,loopOn:true,...range});scheduleRefresh();return true;
  }

  function makeButton(document,label,className,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.className=className||'';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(canEdit(lastEnvironment))handler();});
    return button;
  }

  function createTimingTools(document,board,env){
    const tools=document.createElement('div');tools.className='inkframe-timing-tools';tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','Frame timing controls');
    const status=document.createElement('span');status.className='inkframe-timing-status';status.setAttribute('aria-live','polite');tools.appendChild(status);
    const current=()=>Math.max(0,Math.min(Math.max(0,env.framesLength-1),Math.floor(finite(lastPlayback.current,env.current))));
    const hold=()=>normalizeHold(typeof env.holdAt==='function'?env.holdAt(current()):1);
    tools.appendChild(makeButton(document,'−','inkframe-timing-minus',()=>applyHold(current(),hold()-1)));
    tools.appendChild(makeButton(document,'1s','inkframe-timing-ones',()=>applyHold(current(),1)));
    tools.appendChild(makeButton(document,'2s','inkframe-timing-twos',()=>applyHold(current(),2)));
    tools.appendChild(makeButton(document,'+','inkframe-timing-plus',()=>applyHold(current(),hold()+1)));
    const loop=makeButton(document,lastPlayback.loopOn?'Loop on':'Loop','inkframe-timing-loop',()=>{
      if(typeof env.toggleLoop==='function'){env.toggleLoop();scheduleRefresh();}
    });
    loop.setAttribute('aria-pressed',lastPlayback.loopOn?'true':'false');tools.appendChild(loop);
    board.appendChild(tools);updateStatus();
  }

  function createHoldOverlay(document,board,plan,env){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.classList.add('inkframe-radial-timing-svg');svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);svg.setAttribute('aria-hidden','true');
    const total=Math.min(Math.max(0,Math.floor(finite(env.framesLength,0))),plan.slots.length);
    const current=Math.floor(finite(lastPlayback.current,env.current));
    for(let i=0;i<total;i++){
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.classList.add('inkframe-hold-arc');if(i===current)path.classList.add('current');
      if(env.selectedFrames&&typeof env.selectedFrames.has==='function'&&env.selectedFrames.has(i))path.classList.add('selected');
      const hold=normalizeHold(typeof env.holdAt==='function'?env.holdAt(i):1);
      path.dataset.frame=String(i);path.dataset.hold=String(hold);path.setAttribute('d',holdArcPath(plan,plan.slots[i],hold));svg.appendChild(path);
    }
    board.appendChild(svg);
  }

  function createLoopHandle(document,board,plan,env,which,index){
    const point=loopHandlePoint(plan,index);if(!point)return;
    const button=document.createElement('button');button.type='button';button.className='inkframe-timing-loop-handle';button.dataset.which=which;
    button.textContent=which==='in'?'IN':'OUT';button.style.left=`${point.x}px`;button.style.top=`${point.y}px`;
    button.title=`Loop ${which} · frame ${index+1}`;button.setAttribute('aria-label',button.title);
    button.addEventListener('pointerdown',event=>{
      if(!canEdit(lastEnvironment))return;event.preventDefault();event.stopPropagation();
      button.setPointerCapture&&button.setPointerCapture(event.pointerId);loopDrag={pointerId:event.pointerId,which};
    });
    button.addEventListener('pointermove',event=>{
      if(!loopDrag||loopDrag.pointerId!==event.pointerId||!lastPlan)return;
      event.preventDefault();event.stopPropagation();const p=boardPoint(board,event);
      const next=nearestFilledIndex(lastPlan,p.x,p.y,lastEnvironment.framesLength);if(next<0)return;
      const range=clampLoopRange(lastPlayback.loopIn,lastPlayback.loopOut,lastEnvironment.framesLength);
      const a=which==='in'?Math.min(next,range.loopOut):range.loopIn;
      const b=which==='out'?Math.max(next,range.loopIn):range.loopOut;
      if(a!==range.loopIn||b!==range.loopOut)applyLoopRange(a,b);
    });
    const end=event=>{if(!loopDrag||loopDrag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();loopDrag=null;try{button.releasePointerCapture&&button.releasePointerCapture(event.pointerId);}catch(_){}};
    button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);board.appendChild(button);
  }

  function installBoard(board){
    if(!board||board._inkframeRadialTimingInstalled)return;board._inkframeRadialTimingInstalled=true;
    board.addEventListener('pointerdown',event=>{
      const view=viewFor(lastEnvironment);if(!view.timingMode||!lastPlan||!canEdit(lastEnvironment))return;
      if(event.target&&event.target.closest&&event.target.closest('.inkframe-timing-tools,.inkframe-timing-loop-handle,.inkframe-radial-nav'))return;
      const cell=event.target&&event.target.closest&&event.target.closest('.frameSlot.filled');if(!cell)return;
      event.preventDefault();event.stopImmediatePropagation();
      const index=Math.floor(finite(cell.dataset.frame,-1));if(index<0||index>=lastEnvironment.framesLength)return;
      board.setPointerCapture&&board.setPointerCapture(event.pointerId);const p=boardPoint(board,event);
      holdDrag={pointerId:event.pointerId,index,startRadius:radialDistance(lastPlan,p),startHold:normalizeHold(lastEnvironment.holdAt(index)),lastHold:normalizeHold(lastEnvironment.holdAt(index))};
      board.dataset.timingHoldDragging='true';
      if(typeof lastEnvironment.seek==='function')lastEnvironment.seek(index);
    },true);
    board.addEventListener('pointermove',event=>{
      if(!holdDrag||event.pointerId!==holdDrag.pointerId||!lastPlan)return;
      event.preventDefault();event.stopImmediatePropagation();const p=boardPoint(board,event);
      const next=holdFromRadialDrag(holdDrag.startHold,holdDrag.startRadius,radialDistance(lastPlan,p));
      if(next!==holdDrag.lastHold){holdDrag.lastHold=next;applyHold(holdDrag.index,next);}
    },true);
    const endHold=event=>{
      if(!holdDrag||event.pointerId!==holdDrag.pointerId)return;
      event.preventDefault();event.stopImmediatePropagation();holdDrag=null;delete board.dataset.timingHoldDragging;
      try{board.releasePointerCapture&&board.releasePointerCapture(event.pointerId);}catch(_){ }
    };
    board.addEventListener('pointerup',endHold,true);board.addEventListener('pointercancel',endHold,true);
    board.addEventListener('keydown',event=>{
      const view=viewFor(lastEnvironment);if(!view.timingMode||!canEdit(lastEnvironment))return;
      const current=Math.max(0,Math.min(Math.max(0,lastEnvironment.framesLength-1),Math.floor(finite(lastPlayback.current,lastEnvironment.current))));
      const hold=normalizeHold(lastEnvironment.holdAt(current));let handled=true;
      if(event.key==='['||event.key==='-')applyHold(current,hold-1);
      else if(event.key===']'||event.key==='+')applyHold(current,hold+1);
      else if(event.key==='1')applyHold(current,1);
      else if(event.key==='2')applyHold(current,2);
      else if(event.key.toLowerCase()==='l'&&typeof lastEnvironment.toggleLoop==='function'){lastEnvironment.toggleLoop();scheduleRefresh();}
      else handled=false;
      if(handled){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    if(typeof root.MutationObserver==='function'){
      const observer=new root.MutationObserver(()=>{
        if(rendering||refreshQueued||!lastBoard||board!==lastBoard)return;
        if(board.dataset.radialTimeline==='true'&&!board.querySelector('.inkframe-radial-timing-svg'))scheduleRefresh();
      });
      observer.observe(board,{childList:true});board._inkframeRadialTimingObserver=observer;
    }
  }

  function updateStatus(){
    if(!lastBoard||!lastEnvironment)return;
    const current=Math.max(0,Math.min(Math.max(0,lastEnvironment.framesLength-1),Math.floor(finite(lastPlayback.current,lastEnvironment.current))));
    const hold=normalizeHold(typeof lastEnvironment.holdAt==='function'?lastEnvironment.holdAt(current):1);
    const status=lastBoard.querySelector('.inkframe-timing-status');if(status)status.textContent=`Frame ${current+1} · Hold ${hold}`;
    for(const path of lastBoard.querySelectorAll('.inkframe-hold-arc'))path.classList.toggle('current',Number(path.dataset.frame)===current);
  }

  function render(board,environment){
    const radial=root.InkFrameRadialTimeline,plan=radial&&radial.lastLayout,document=board&&board.ownerDocument;
    if(!board||!document||!plan)return false;
    lastBoard=board;lastEnvironment=environment||{};lastPlan=plan;
    const radialState=radial.playbackState||{};lastPlayback=Object.freeze({
      current:Math.max(0,Math.floor(finite(radialState.current,lastEnvironment.current))),
      loopOn:!!radialState.loopOn,loopIn:Math.max(0,Math.floor(finite(radialState.loopIn,lastEnvironment.loopIn))),
      loopOut:Math.max(0,Math.floor(finite(radialState.loopOut,lastEnvironment.loopOut))),
    });
    installStyle(document);installBoard(board);rendering=true;
    try{
      board.dataset.radialTiming='true';const view=viewFor(lastEnvironment);board.dataset.timingMode=view.timingMode?'true':'false';
      for(const node of board.querySelectorAll('.inkframe-radial-timing-svg,.inkframe-timing-tools,.inkframe-timing-loop-handle,.inkframe-radial-timing-toggle'))node.remove();
      createHoldOverlay(document,board,plan,lastEnvironment);
      const nav=board.querySelector('.inkframe-radial-nav');
      if(nav){
        const toggle=makeButton(document,'Timing','inkframe-radial-timing-toggle',()=>{view.timingMode=!view.timingMode;render(board,lastEnvironment);});
        toggle.setAttribute('aria-pressed',view.timingMode?'true':'false');toggle.title=view.timingMode?'Hold editing on · drag a frame outward or inward':'Enable radial hold editing';nav.appendChild(toggle);
      }
      if(view.timingMode)createTimingTools(document,board,lastEnvironment);
      if(lastPlayback.loopOn&&lastEnvironment.framesLength>1){
        const range=clampLoopRange(lastPlayback.loopIn,lastPlayback.loopOut,lastEnvironment.framesLength);
        createLoopHandle(document,board,plan,lastEnvironment,'in',range.loopIn);createLoopHandle(document,board,plan,lastEnvironment,'out',range.loopOut);
      }
      updateStatus();return true;
    }finally{rendering=false;}
  }

  function syncPlayback(state){
    const prior=lastPlayback;
    lastPlayback=Object.freeze({
      current:Math.max(0,Math.floor(finite(state&&state.current,prior.current))),
      loopOn:!!(state&&state.loopOn),
      loopIn:Math.max(0,Math.floor(finite(state&&state.loopIn,prior.loopIn))),
      loopOut:Math.max(0,Math.floor(finite(state&&state.loopOut,prior.loopOut))),
    });
    if(!lastBoard||!lastEnvironment)return false;
    if(prior.loopOn!==lastPlayback.loopOn||prior.loopIn!==lastPlayback.loopIn||prior.loopOut!==lastPlayback.loopOut){scheduleRefresh();return true;}
    updateStatus();return true;
  }

  function toggleTimingMode(){
    if(!lastBoard||!lastEnvironment||!canEdit(lastEnvironment))return false;
    const view=viewFor(lastEnvironment);view.timingMode=!view.timingMode;return render(lastBoard,lastEnvironment);
  }

  function installIntoRadial(){
    const radial=root.InkFrameRadialTimeline;if(!radial||radial.__radialTimingPatched)return false;
    const originalRender=radial.render,originalSync=radial.syncPlayback;
    radial.render=function(board,environment){const result=originalRender.call(radial,board,environment);if(result)render(board,environment);return result;};
    radial.syncPlayback=function(state){const result=originalSync.call(radial,state);if(result)syncPlayback(state);return result;};
    radial.__radialTimingPatched=true;return true;
  }

  const api={
    normalizeHold,holdFromRadialDrag,holdArcGeometry,holdArcPath,loopHandlePoint,clampLoopRange,nearestFilledIndex,
    render,syncPlayback,toggleTimingMode,viewSnapshot,installIntoRadial,
    projectCanvasWrites:0,artworkUndoWrites:0,timelineTimingWrites:true,
  };
  root.InkFrameRadialTiming=api;installIntoRadial();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
