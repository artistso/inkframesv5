// InkFrame — organic radial frame timeline
'use strict';
(function(root){
  const TAU=Math.PI*2;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  const normalizeShape=value=>value==='circle'?'circle':'square';

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
    const m=normalizeMetrics(metrics),mode=normalizeShape(shape),rings=planRings(count,m,mode,options);
    const slots=[];
    for(const ring of rings){
      const phase=Math.PI/2+(ring.index%2?Math.PI/Math.max(1,ring.size):0);
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
    return Object.freeze({metrics:m,shape:mode,rings,slots:Object.freeze(slots)});
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

  function createOrbitSvg(document,plan,current){
    const svg=svgElement(document,'svg');
    svg.classList.add('inkframe-radial-orbits');
    svg.setAttribute('viewBox',`0 0 ${plan.metrics.width} ${plan.metrics.height}`);
    svg.setAttribute('aria-hidden','true');
    for(const ring of plan.rings){
      const orbit=svgElement(document,'ellipse');
      orbit.classList.add('inkframe-radial-orbit');
      orbit.setAttribute('cx',plan.metrics.centerX);orbit.setAttribute('cy',plan.metrics.centerY);
      orbit.setAttribute('rx',ring.rx);orbit.setAttribute('ry',ring.ry);
      orbit.dataset.ring=String(ring.index);svg.appendChild(orbit);
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

  function createSlot(document,point,env){
    const state=stateFor(point.index,env),cell=document.createElement('div');
    cell.className='frameSlot inkframe-radial-slot';
    cell.style.left=`${point.x}px`;cell.style.top=`${point.y}px`;
    cell.style.setProperty('--timeline-angle',`${point.tangent}rad`);
    cell.style.setProperty('--timeline-order',String(point.index));
    cell.dataset.frame=String(point.index);cell.dataset.ring=String(point.ring);
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
    }else{
      cell.classList.add('empty');
      if(state.next){cell.classList.add('next');cell.textContent='+';}
      cell.title=`Add frame ${point.index+1}`;cell.setAttribute('aria-label',cell.title);
    }
    return cell;
  }

  let styleInstalled=false,lastPlan=null,lastBoard=null;
  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeRadialTimelineStyle='true';
    style.textContent=`
#frameBoard[data-radial-timeline="true"]{inset:0;overflow:visible;isolation:isolate}
#frameBoard[data-radial-timeline="true"] .inkframe-radial-orbits{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:0;filter:drop-shadow(0 0 8px rgba(247,202,201,.18))}
.inkframe-radial-orbit{fill:none;stroke:rgba(255,240,243,.20);stroke-width:1.25;stroke-dasharray:2.2 5.6;vector-effect:non-scaling-stroke}
.inkframe-radial-progress{fill:none;stroke:rgba(247,202,201,.72);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 5px rgba(187,0,55,.72))}
#frameBoard[data-radial-timeline="true"] .frameSlot{z-index:2;width:30px;height:30px;border-radius:50%;overflow:visible;background:rgba(42,0,26,.72);border:1px solid rgba(247,202,201,.42);box-shadow:0 4px 13px rgba(10,0,10,.40),inset 0 1px 0 rgba(255,255,255,.22);font:800 8px/1 var(--font-ui);transition:transform .14s cubic-bezier(.2,.9,.3,1.25),box-shadow .16s,opacity .16s,border-color .16s;animation:inkframeRadialArrival .28s both;animation-delay:calc(min(var(--timeline-order), 18) * 9ms)}
#frameBoard[data-radial-timeline="true"] .frameSlot.filled{background:linear-gradient(160deg,rgba(255,240,243,.22),rgba(42,0,26,.70));}
#frameBoard[data-radial-timeline="true"] .frameSlot.empty{width:24px;height:24px;opacity:.34;background:rgba(42,0,26,.46);border-style:dashed}
#frameBoard[data-radial-timeline="true"] .frameSlot.next{width:30px;height:30px;opacity:.94;font-size:15px;background:linear-gradient(160deg,rgba(247,202,201,.28),rgba(187,0,55,.42));box-shadow:0 0 15px rgba(187,0,55,.38),inset 0 1px 0 rgba(255,255,255,.28)}
#frameBoard[data-radial-timeline="true"] .frameSlot.cur{transform:translate(-50%,-50%) scale(1.34);border-color:rgba(255,255,255,.96);box-shadow:0 0 0 2px rgba(187,0,55,.75),0 0 22px rgba(247,202,201,.72),inset 0 1px 0 #fff;z-index:5}
#frameBoard[data-radial-timeline="true"] .frameSlot.sel{transform:translate(-50%,-50%) scale(1.20);border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.92),0 0 18px var(--accent);z-index:4}
#frameBoard[data-radial-timeline="true"] .frameSlot.cur.sel{transform:translate(-50%,-50%) scale(1.42)}
#frameBoard[data-radial-timeline="true"] .frameSlot.held::after{right:-1px;top:-1px;width:7px;height:7px;border:1px solid rgba(255,255,255,.7)}
.inkframe-radial-thumb{position:absolute;inset:2px;border-radius:50%;background-size:cover;background-position:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.20);overflow:hidden}
.inkframe-radial-thumb::after{content:"";position:absolute;inset:0;border-radius:50%;background:linear-gradient(145deg,rgba(255,255,255,.22),transparent 42%,rgba(42,0,26,.24))}
.inkframe-radial-number{position:absolute;left:50%;bottom:-4px;transform:translate(-50%,50%);min-width:16px;height:16px;padding:0 3px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(10,0,10,.76);border:1px solid rgba(255,255,255,.24);text-shadow:var(--label-shadow);font:800 8px/1 var(--font-ui);z-index:3}
#frameBoard[data-radial-timeline="true"] .frameCapBadge{bottom:-48px;z-index:6;background:rgba(10,0,10,.68);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
@keyframes inkframeRadialArrival{from{opacity:0;transform:translate(-50%,-50%) scale(.55)}to{opacity:1}}
@media (prefers-reduced-motion:reduce){#frameBoard[data-radial-timeline="true"] .frameSlot{animation:none;transition:none}}
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

  function render(board,environment){
    const env=environment||{},document=board&&board.ownerDocument;
    if(!board||!document)return false;
    const slotCount=clamp(Math.floor(finite(env.slotCount,0)),0,Math.max(0,Math.floor(finite(env.maxFrames,120))));
    installStyle(document);
    const plan=layout(slotCount,metricsFromEnvironment(env),env.shape);
    board.replaceChildren();board.dataset.radialTimeline='true';board.dataset.timelineShape=plan.shape;
    board.setAttribute('aria-label',`${plan.shape==='circle'?'Circular':'Elliptical'} radial frame timeline`);
    board.appendChild(createOrbitSvg(document,plan,env.current));
    for(const point of plan.slots)board.appendChild(createSlot(document,point,env));
    const badge=document.createElement('div');
    badge.className='frameCapBadge'+(finite(env.framesLength)>=finite(env.maxFrames,120)*.85?' warn':'');
    badge.textContent=`${Math.max(0,Math.floor(finite(env.framesLength,0)))} / ${Math.max(0,Math.floor(finite(env.maxFrames,120)))}`;
    board.appendChild(badge);
    lastPlan=plan;lastBoard=board;return true;
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

  const api={
    normalizeShape,ellipseCircumference,normalizeMetrics,baseRadii,ringCapacity,planRings,layout,stateFor,
    render,refreshThumbnail,get lastLayout(){return lastPlan;},projectCanvasWrites:0,undoWrites:0,
  };
  root.InkFrameRadialTimeline=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
