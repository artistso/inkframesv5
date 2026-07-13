// InkFrame — organic radial frame timeline + orbital navigation
'use strict';
(function(root){
  const TAU=Math.PI*2;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  const normalizeShape=value=>value==='circle'?'circle':'square';
  const normalizeAngle=value=>{
    let angle=finite(value,0)%TAU;
    if(angle<=-Math.PI)angle+=TAU;
    if(angle>Math.PI)angle-=TAU;
    return angle;
  };

  function ellipseCircumference(rx,ry){
    const a=Math.max(.5,Math.abs(finite(rx,.5))),b=Math.max(.5,Math.abs(finite(ry,.5)));
    const h=Math.pow(a-b,2)/Math.pow(a+b,2);
    return Math.PI*(a+b)*(1+(3*h)/(10+Math.sqrt(4-3*h)));
  }

  function normalizeMetrics(metrics){
    const source=metrics||{};
    const width=Math.max(1,finite(source.width,1));
    const height=Math.max(1,finite(source.height,1));
    const canvasWidth=Math.max(1,finite(source.canvasWidth,width));
    const canvasHeight=Math.max(1,finite(source.canvasHeight,height));
    const canvasLeft=finite(source.canvasLeft,(width-canvasWidth)/2);
    const canvasTop=finite(source.canvasTop,(height-canvasHeight)/2);
    return Object.freeze({
      width,height,canvasWidth,canvasHeight,canvasLeft,canvasTop,
      centerX:canvasLeft+canvasWidth/2,
      centerY:canvasTop+canvasHeight/2,
    });
  }

  function baseRadii(metrics,shape){
    const m=normalizeMetrics(metrics),mode=normalizeShape(shape);
    if(mode==='circle'){
      const radius=Math.max(1,Math.min(m.canvasWidth,m.canvasHeight)/2+22);
      return Object.freeze({rx:radius,ry:radius});
    }
    return Object.freeze({
      rx:Math.max(1,m.canvasWidth/2+20),
      ry:Math.max(1,m.canvasHeight/2+20),
    });
  }

  function ringCapacity(rx,ry,minimumArc=31){
    return Math.max(12,Math.floor(ellipseCircumference(rx,ry)/Math.max(22,finite(minimumArc,31))));
  }

  function planRings(count,metrics,shape,options){
    const total=Math.max(0,Math.floor(finite(count,0)));
    if(total===0)return Object.freeze([]);
    const opts=options||{},gap=Math.max(24,finite(opts.ringGap,32));
    const minimumArc=Math.max(22,finite(opts.minimumArc,31));
    const base=baseRadii(metrics,shape),rings=[];
    let remaining=total,index=0;
    while(remaining>0){
      const rx=base.rx+index*gap,ry=base.ry+index*gap;
      const capacity=ringCapacity(rx,ry,minimumArc);
      const size=Math.min(remaining,capacity);
      rings.push(Object.freeze({index,rx,ry,capacity,size,start:total-remaining}));
      remaining-=size;index++;
      if(index>12)throw new Error('Radial timeline ring planning exceeded safety bound');
    }
    return Object.freeze(rings);
  }

  function layout(count,metrics,shape,options){
    const m=normalizeMetrics(metrics),mode=normalizeShape(shape),opts=options||{};
    const rotation=normalizeAngle(opts.rotation);
    const rings=planRings(count,m,mode,opts),slots=[];
    for(const ring of rings){
      const phase=Math.PI/2+rotation+(ring.index%2?Math.PI/Math.max(1,ring.size):0);
      for(let local=0;local<ring.size;local++){
        const angle=phase-local/ring.size*TAU;
        const x=m.centerX+Math.cos(angle)*ring.rx;
        const y=m.centerY+Math.sin(angle)*ring.ry;
        const tangent=Math.atan2(Math.cos(angle)*ring.ry,-Math.sin(angle)*ring.rx);
        slots.push(Object.freeze({
          index:ring.start+local,ring:ring.index,local,angle,tangent,x,y,rx:ring.rx,ry:ring.ry,
        }));
      }
    }
    return Object.freeze({metrics:m,shape:mode,rotation,rings,slots:Object.freeze(slots)});
  }

  function ringForIndex(plan,index){
    const target=Math.floor(finite(index,-1));
    const point=plan&&plan.slots&&plan.slots[target];
    return point?point.ring:-1;
  }

  function rotationForFocus(plan,index,targetAngle=-Math.PI/2){
    const target=Math.floor(finite(index,-1));
    const point=plan&&plan.slots&&plan.slots[target];
    if(!point)return normalizeAngle(plan&&plan.rotation);
    return normalizeAngle(finite(plan.rotation)+normalizeAngle(finite(targetAngle,-Math.PI/2)-point.angle));
  }

  function stepIndex(current,delta,count){
    const total=Math.max(0,Math.floor(finite(count,0)));
    if(total===0)return -1;
    return Math.max(0,Math.min(total-1,Math.floor(finite(current,0))+Math.floor(finite(delta,0))));
  }

  function svgElement(document,name){return document.createElementNS('http://www.w3.org/2000/svg',name);}

  function stateFor(index,env){
    const framesLength=Math.max(0,Math.floor(finite(env.framesLength,0)));
    const selected=env.selectedFrames&&typeof env.selectedFrames.has==='function'&&env.selectedFrames.has(index);
    const filled=index<framesLength;
    const current=filled&&index===Math.floor(finite(env.current,-1));
    const hold=filled&&typeof env.holdAt==='function'?Math.max(1,Math.round(finite(env.holdAt(index),1))):1;
    return Object.freeze({filled,current,selected,hold,next:index===framesLength});
  }

  function createOrbitSvg(document,plan,current,focusRing){
    const svg=svgElement(document,'svg');
    svg.classList.add('inkframe-radial-orbits');
    svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);
    svg.setAttribute('aria-hidden','true');
    for(const ring of plan.rings){
      const orbit=svgElement(document,'ellipse');
      orbit.classList.add('inkframe-radial-orbit');
      if(focusRing>=0&&ring.index!==focusRing)orbit.classList.add('inkframe-radial-muted');
      orbit.setAttribute('cx',plan.metrics.centerX);orbit.setAttribute('cy',plan.metrics.centerY);
      orbit.setAttribute('rx',ring.rx);orbit.setAttribute('ry',ring.ry);
      orbit.dataset.ring=String(ring.index);svg.appendChild(orbit);

      const hit=svgElement(document,'ellipse');
      hit.classList.add('inkframe-radial-hit');
      if(focusRing>=0&&ring.index!==focusRing)hit.classList.add('inkframe-radial-muted');
      hit.setAttribute('cx',plan.metrics.centerX);hit.setAttribute('cy',plan.metrics.centerY);
      hit.setAttribute('rx',ring.rx);hit.setAttribute('ry',ring.ry);
      hit.dataset.ring=String(ring.index);svg.appendChild(hit);
    }
    const filledThrough=Math.min(plan.slots.length,Math.max(0,Math.floor(finite(current,-1))+1));
    if(filledThrough>1){
      const trail=svgElement(document,'polyline');
      trail.classList.add('inkframe-radial-progress');
      trail.setAttribute('points',plan.slots.slice(0,filledThrough).map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '));
      svg.appendChild(trail);
    }
    return svg;
  }

  function createSlot(document,point,env,focusRing){
    const state=stateFor(point.index,env),cell=document.createElement('div');
    cell.className='frameSlot inkframe-radial-slot';
    cell.id=`inkframe-radial-frame-${point.index}`;
    cell.style.left=`${point.x}px`;cell.style.top=`${point.y}px`;
    cell.style.setProperty('--timeline-angle',`${point.tangent}rad`);
    cell.style.setProperty('--timeline-order',String(point.index));
    cell.dataset.frame=String(point.index);cell.dataset.ring=String(point.ring);
    cell.setAttribute('role','option');cell.tabIndex=-1;
    if(focusRing>=0&&point.ring!==focusRing){
      cell.classList.add('inkframe-radial-muted');cell.setAttribute('aria-hidden','true');
    }
    if(state.filled){
      cell.classList.add('filled');
      if(state.current)cell.classList.add('cur');
      if(state.selected)cell.classList.add('sel');
      if(state.hold>1)cell.classList.add('held');
      const thumb=typeof env.thumbAt==='function'?env.thumbAt(point.index):'';
      if(thumb){
        const image=document.createElement('div');image.className='inkframe-radial-thumb';
        image.style.backgroundImage=`url(${thumb})`;cell.appendChild(image);
      }
      const number=document.createElement('span');number.className='inkframe-radial-number';number.textContent=String(point.index+1);cell.appendChild(number);
      cell.title=`Frame ${point.index+1} · hold ${state.hold}`;
      cell.setAttribute('aria-label',cell.title+(state.current?' · current':'')+(state.selected?' · selected':''));
      cell.setAttribute('aria-selected',state.current||state.selected?'true':'false');
    }else{
      cell.classList.add('empty');
      if(state.next){cell.classList.add('next');cell.textContent='+';}
      cell.title=`Add frame ${point.index+1}`;cell.setAttribute('aria-label',cell.title);
      cell.setAttribute('aria-selected','false');
    }
    return cell;
  }

  const projectViews=new WeakMap();
  const fallbackView={rotation:0,focusCurrentRing:false};
  function viewFor(environment){
    const project=environment&&environment.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);
      if(!view){view={rotation:0,focusCurrentRing:false};projectViews.set(project,view);}
      return view;
    }
    return fallbackView;
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView;
    return Object.freeze({rotation:normalizeAngle(view.rotation),focusCurrentRing:!!view.focusCurrentRing});
  }

  let styleInstalled=false,lastPlan=null,lastBoard=null,lastEnvironment=null,drag=null;
  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeRadialTimelineStyle='true';
    style.textContent=`
#frameBoard[data-radial-timeline="true"]{inset:0;overflow:visible;isolation:isolate}
#frameBoard[data-radial-timeline="true"]:focus-visible{outline:2px solid rgba(255,255,255,.82);outline-offset:10px;border-radius:32px}
#frameBoard[data-radial-timeline="true"] .inkframe-radial-orbits{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:0;filter:drop-shadow(0 0 8px rgba(247,202,201,.18))}
.inkframe-radial-orbit{fill:none;stroke:rgba(255,240,243,.20);stroke-width:1.25;stroke-dasharray:2.2 5.6;vector-effect:non-scaling-stroke;transition:opacity .18s}
.inkframe-radial-hit{fill:none;stroke:rgba(0,0,0,0);stroke-width:24;pointer-events:stroke;cursor:grab;touch-action:none}
.inkframe-radial-hit:active{cursor:grabbing}
.inkframe-radial-progress{fill:none;stroke:rgba(247,202,201,.72);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 5px rgba(187,0,55,.72))}
#frameBoard[data-radial-timeline="true"] .frameSlot{z-index:2;width:30px;height:30px;border-radius:50%;overflow:visible;background:rgba(42,0,26,.72);border:1px solid rgba(247,202,201,.42);box-shadow:0 4px 13px rgba(10,0,10,.40),inset 0 1px 0 rgba(255,255,255,.22);font:800 8px/1 var(--font-ui);transition:transform .14s cubic-bezier(.2,.9,.3,1.25),box-shadow .16s,opacity .16s,border-color .16s;animation:inkframeRadialArrival .28s both;animation-delay:calc(min(var(--timeline-order), 18) * 9ms)}
#frameBoard[data-radial-timeline="true"] .frameSlot.filled{background:linear-gradient(160deg,rgba(255,240,243,.22),rgba(42,0,26,.70));}
#frameBoard[data-radial-timeline="true"] .frameSlot.empty{width:24px;height:24px;opacity:.34;background:rgba(42,0,26,.46);border-style:dashed}
#frameBoard[data-radial-timeline="true"] .frameSlot.next{width:30px;height:30px;opacity:.94;font-size:15px;background:linear-gradient(160deg,rgba(247,202,201,.28),rgba(187,0,55,.42));box-shadow:0 0 15px rgba(187,0,55,.38),inset 0 1px 0 rgba(255,255,255,.28)}
#frameBoard[data-radial-timeline="true"] .frameSlot.cur{transform:translate(-50%,-50%) scale(1.34);border-color:rgba(255,255,255,.96);box-shadow:0 0 0 2px rgba(187,0,55,.75),0 0 22px rgba(247,202,201,.72),inset 0 1px 0 #fff;z-index:5}
#frameBoard[data-radial-timeline="true"] .frameSlot.sel{transform:translate(-50%,-50%) scale(1.20);border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.92),0 0 18px var(--accent);z-index:4}
#frameBoard[data-radial-timeline="true"] .frameSlot.cur.sel{transform:translate(-50%,-50%) scale(1.42)}
#frameBoard[data-radial-timeline="true"] .frameSlot.held::after{right:-1px;top:-1px;width:7px;height:7px;border:1px solid rgba(255,255,255,.7)}
#frameBoard[data-radial-timeline="true"] .inkframe-radial-muted{opacity:.10!important;pointer-events:none!important}
.inkframe-radial-thumb{position:absolute;inset:2px;border-radius:50%;background-size:cover;background-position:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.20);overflow:hidden}
.inkframe-radial-thumb::after{content:"";position:absolute;inset:0;border-radius:50%;background:linear-gradient(145deg,rgba(255,255,255,.22),transparent 42%,rgba(42,0,26,.24))}
.inkframe-radial-number{position:absolute;left:50%;bottom:-4px;transform:translate(-50%,50%);min-width:16px;height:16px;padding:0 3px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(10,0,10,.76);border:1px solid rgba(255,255,255,.24);text-shadow:var(--label-shadow);font:800 8px/1 var(--font-ui);z-index:3}
.inkframe-radial-nav{position:absolute;left:50%;top:-54px;transform:translateX(-50%);z-index:8;display:flex;gap:6px;pointer-events:auto;padding:5px;border-radius:999px;background:rgba(10,0,10,.58);border:1px solid rgba(247,202,201,.25);box-shadow:0 7px 20px rgba(10,0,10,.36),inset 0 1px 0 rgba(255,255,255,.16);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.inkframe-radial-nav button{min-width:78px;min-height:32px;padding:6px 10px;border-radius:999px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.08em;text-transform:uppercase;touch-action:manipulation}
.inkframe-radial-nav button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}
#frameBoard[data-radial-timeline="true"] .frameCapBadge{bottom:-48px;z-index:6;background:rgba(10,0,10,.68);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
@keyframes inkframeRadialArrival{from{opacity:0;transform:translate(-50%,-50%) scale(.55)}to{opacity:1}}
@media (pointer:coarse){.inkframe-radial-nav button{min-width:92px;min-height:40px;font-size:10px}.inkframe-radial-hit{stroke-width:32}}
@media (prefers-reduced-motion:reduce){#frameBoard[data-radial-timeline="true"] .frameSlot{animation:none;transition:none}.inkframe-radial-orbit{transition:none}}
`;
    document.head.appendChild(style);styleInstalled=true;
  }

  function metricsFromEnvironment(env){
    const frameGlass=env&&env.frameGlass,canvas=env&&env.canvas;
    const width=Math.max(1,finite(frameGlass&&frameGlass.clientWidth,1));
    const height=Math.max(1,finite(frameGlass&&frameGlass.clientHeight,1));
    const canvasWidth=Math.max(1,finite(canvas&&canvas.clientWidth,width));
    const canvasHeight=Math.max(1,finite(canvas&&canvas.clientHeight,height));
    return normalizeMetrics({
      width,height,canvasWidth,canvasHeight,
      canvasLeft:finite(canvas&&canvas.offsetLeft,(width-canvasWidth)/2),
      canvasTop:finite(canvas&&canvas.offsetTop,(height-canvasHeight)/2),
    });
  }

  function canNavigate(env){
    return !(env&&typeof env.canNavigate==='function')||env.canNavigate()!==false;
  }

  function requestSeek(env,index){
    const total=Math.max(0,Math.floor(finite(env&&env.framesLength,0)));
    if(!canNavigate(env)||total===0||typeof env.seek!=='function')return false;
    const next=Math.max(0,Math.min(total-1,Math.floor(finite(index,0))));
    env.seek(next);return true;
  }

  function createNavigation(document,board,plan,env,view,focusRing){
    const nav=document.createElement('div');nav.className='inkframe-radial-nav';nav.setAttribute('role','toolbar');
    nav.setAttribute('aria-label','Radial timeline navigation');

    const center=document.createElement('button');center.type='button';center.className='inkframe-radial-center';
    center.textContent='Center current';center.title='Rotate the current frame to twelve o’clock';
    center.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      if(!canNavigate(lastEnvironment))return;
      view.rotation=rotationForFocus(lastPlan,finite(lastEnvironment&&lastEnvironment.current,-1));
      render(lastBoard,lastEnvironment);
    });

    const ring=document.createElement('button');ring.type='button';ring.className='inkframe-radial-ring';
    ring.setAttribute('aria-pressed',view.focusCurrentRing?'true':'false');
    ring.textContent=view.focusCurrentRing&&focusRing>=0?`Ring ${focusRing+1}`:'All rings';
    ring.title=view.focusCurrentRing?'Show every timeline ring':'Focus only the current frame ring';
    ring.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      if(!canNavigate(lastEnvironment))return;
      view.focusCurrentRing=!view.focusCurrentRing;
      render(lastBoard,lastEnvironment);
    });

    nav.append(center,ring);return nav;
  }

  function angleAtEvent(board,event,plan){
    const rect=board&&board.getBoundingClientRect?board.getBoundingClientRect():{left:0,top:0};
    const x=finite(event&&event.clientX)-finite(rect.left)-plan.metrics.centerX;
    const y=finite(event&&event.clientY)-finite(rect.top)-plan.metrics.centerY;
    return Math.atan2(y,x);
  }

  function installNavigation(board){
    if(!board||board._inkframeRadialNavigation)return;
    board._inkframeRadialNavigation=true;
    board.addEventListener('pointerdown',event=>{
      const hit=event.target&&event.target.closest&&event.target.closest('.inkframe-radial-hit');
      if(!hit||!lastPlan||!canNavigate(lastEnvironment))return;
      event.preventDefault();event.stopPropagation();
      board.setPointerCapture&&board.setPointerCapture(event.pointerId);
      const view=viewFor(lastEnvironment);
      drag={pointerId:event.pointerId,startAngle:angleAtEvent(board,event,lastPlan),startRotation:view.rotation};
      board.dataset.timelineDragging='true';
    });
    board.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pointerId||!lastPlan)return;
      event.preventDefault();event.stopPropagation();
      const view=viewFor(lastEnvironment);
      view.rotation=normalizeAngle(drag.startRotation+angleAtEvent(board,event,lastPlan)-drag.startAngle);
      render(board,lastEnvironment);
    });
    const endDrag=event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      event.preventDefault();event.stopPropagation();
      drag=null;delete board.dataset.timelineDragging;
      try{board.releasePointerCapture&&board.releasePointerCapture(event.pointerId);}catch(_){}
    };
    board.addEventListener('pointerup',endDrag);
    board.addEventListener('pointercancel',endDrag);
    board.addEventListener('keydown',event=>{
      if(!lastEnvironment||!canNavigate(lastEnvironment))return;
      let next=null;
      if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=stepIndex(lastEnvironment.current,-1,lastEnvironment.framesLength);
      else if(event.key==='ArrowRight'||event.key==='ArrowDown')next=stepIndex(lastEnvironment.current,1,lastEnvironment.framesLength);
      else if(event.key==='PageUp')next=stepIndex(lastEnvironment.current,-10,lastEnvironment.framesLength);
      else if(event.key==='PageDown')next=stepIndex(lastEnvironment.current,10,lastEnvironment.framesLength);
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=Math.max(0,Math.floor(finite(lastEnvironment.framesLength,0))-1);
      if(next==null)return;
      event.preventDefault();event.stopPropagation();requestSeek(lastEnvironment,next);
    });
  }

  function render(board,environment){
    const env=environment||{},document=board&&board.ownerDocument;
    if(!board||!document)return false;
    const slotCount=clamp(Math.floor(finite(env.slotCount,0)),0,Math.max(0,Math.floor(finite(env.maxFrames,120))));
    installStyle(document);installNavigation(board);
    const view=viewFor(env);
    const plan=layout(slotCount,metricsFromEnvironment(env),env.shape,{rotation:view.rotation});
    const focusRing=view.focusCurrentRing?ringForIndex(plan,env.current):-1;
    board.replaceChildren();board.dataset.radialTimeline='true';board.dataset.timelineShape=plan.shape;
    board.dataset.timelineRotation=String(plan.rotation);
    if(focusRing>=0)board.dataset.focusRing=String(focusRing);else delete board.dataset.focusRing;
    board.setAttribute('aria-label',`${plan.shape==='circle'?'Circular':'Elliptical'} radial frame timeline`);
    board.setAttribute('role','listbox');board.tabIndex=0;
    board.appendChild(createOrbitSvg(document,plan,env.current,focusRing));
    for(const point of plan.slots)board.appendChild(createSlot(document,point,env,focusRing));
    const active=board.querySelector('.frameSlot.cur');
    if(active)board.setAttribute('aria-activedescendant',active.id);else board.removeAttribute('aria-activedescendant');
    board.appendChild(createNavigation(document,board,plan,env,view,focusRing));
    const badge=document.createElement('div');
    badge.className='frameCapBadge'+(finite(env.framesLength)>=finite(env.maxFrames,120)*.85?' warn':'');
    badge.textContent=`${Math.max(0,Math.floor(finite(env.framesLength,0)))} / ${Math.max(0,Math.floor(finite(env.maxFrames,120)))}`;
    board.appendChild(badge);
    lastPlan=plan;lastBoard=board;lastEnvironment=env;return true;
  }

  function refreshThumbnail(index,data){
    if(!lastBoard)return false;
    const cell=lastBoard.querySelector(`.frameSlot[data-frame="${Math.floor(finite(index,-1))}"]`);
    if(!cell)return false;
    let image=cell.querySelector('.inkframe-radial-thumb');
    if(!image&&data){image=lastBoard.ownerDocument.createElement('div');image.className='inkframe-radial-thumb';cell.prepend(image);}
    if(image&&data)image.style.backgroundImage=`url(${data})`;
    return !!image;
  }

  function focusCurrent(){
    if(!lastBoard||!lastPlan||!lastEnvironment||!canNavigate(lastEnvironment))return false;
    const view=viewFor(lastEnvironment);view.rotation=rotationForFocus(lastPlan,lastEnvironment.current);
    return render(lastBoard,lastEnvironment);
  }

  function toggleRingFocus(){
    if(!lastBoard||!lastEnvironment||!canNavigate(lastEnvironment))return false;
    const view=viewFor(lastEnvironment);view.focusCurrentRing=!view.focusCurrentRing;
    return render(lastBoard,lastEnvironment);
  }

  const api={
    normalizeShape,normalizeAngle,ellipseCircumference,normalizeMetrics,baseRadii,ringCapacity,planRings,layout,
    ringForIndex,rotationForFocus,stepIndex,stateFor,render,refreshThumbnail,focusCurrent,toggleRingFocus,viewSnapshot,
    get lastLayout(){return lastPlan;},projectCanvasWrites:0,undoWrites:0,
  };
  root.InkFrameRadialTimeline=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
