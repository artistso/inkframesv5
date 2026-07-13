// InkFrame — organic radial frame timeline + orbital navigation + hold-aware playback
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

  function timingMap(count,holdAt){
    const totalFrames=Math.max(0,Math.floor(finite(count,0))),holds=[],starts=[];
    let total=0;
    for(let i=0;i<totalFrames;i++){
      starts.push(total);
      const hold=Math.max(1,Math.round(finite(typeof holdAt==='function'?holdAt(i):1,1)));
      holds.push(hold);total+=hold;
    }
    return Object.freeze({
      count:totalFrames,total:Math.max(1,total),
      holds:Object.freeze(holds),starts:Object.freeze(starts),
    });
  }

  function frameCenterFraction(index,timing){
    const map=timing||timingMap(0);
    if(!map.count)return 0;
    const i=Math.max(0,Math.min(map.count-1,Math.floor(finite(index,0))));
    return (map.starts[i]+map.holds[i]/2)/map.total;
  }

  function timePosition(fraction,timing){
    const map=timing||timingMap(0);
    if(!map.count)return Object.freeze({index:-1,nextIndex:-1,local:0,fraction:0});
    const f=clamp(finite(fraction,0),0,1);
    const target=Math.min(map.total-Number.EPSILON,f*map.total);
    let index=map.count-1;
    for(let i=0;i<map.count;i++){
      if(target<map.starts[i]+map.holds[i]){index=i;break;}
    }
    const local=clamp((target-map.starts[index])/map.holds[index],0,1);
    return Object.freeze({index,nextIndex:Math.min(map.count-1,index+1),local,fraction:f});
  }

  function playbackPoint(plan,fraction,count,holdAt){
    const map=timingMap(Math.min(Math.max(0,Math.floor(finite(count,0))),plan&&plan.slots?plan.slots.length:0),holdAt);
    const time=timePosition(fraction,map);
    if(time.index<0)return null;
    const a=plan.slots[time.index],b=plan.slots[time.nextIndex]||a;
    if(a.ring===b.ring){
      const angle=a.angle+normalizeAngle(b.angle-a.angle)*time.local;
      return Object.freeze({
        index:time.index,nextIndex:time.nextIndex,local:time.local,angle,
        x:plan.metrics.centerX+Math.cos(angle)*a.rx,
        y:plan.metrics.centerY+Math.sin(angle)*a.ry,
        ring:a.ring,fraction:time.fraction,
      });
    }
    return Object.freeze({
      index:time.index,nextIndex:time.nextIndex,local:time.local,
      angle:a.angle+normalizeAngle(b.angle-a.angle)*time.local,
      x:a.x+(b.x-a.x)*time.local,y:a.y+(b.y-a.y)*time.local,
      ring:time.local<.5?a.ring:b.ring,fraction:time.fraction,
    });
  }

  function loopSegments(plan,loopIn,loopOut,count){
    const total=Math.min(Math.max(0,Math.floor(finite(count,0))),plan&&plan.slots?plan.slots.length:0);
    if(!total)return Object.freeze([]);
    const lo=Math.max(0,Math.min(total-1,Math.floor(finite(loopIn,0))));
    const hi=Math.max(lo,Math.min(total-1,Math.floor(finite(loopOut,total-1))));
    const groups=[];
    for(const ring of plan.rings){
      const first=Math.max(lo,ring.start),last=Math.min(hi,ring.start+ring.size-1);
      if(first<=last)groups.push(Object.freeze({ring:ring.index,first,last,rx:ring.rx,ry:ring.ry,size:ring.size}));
    }
    return Object.freeze(groups);
  }

  function loopArcPath(plan,segment){
    const first=plan.slots[segment.first],last=plan.slots[segment.last];
    if(!first||!last)return '';
    const half=TAU/Math.max(1,segment.size)*.42;
    const start=first.angle+half,end=last.angle-half;
    const span=(start-end+TAU)%TAU||half*2;
    const sx=plan.metrics.centerX+Math.cos(start)*segment.rx;
    const sy=plan.metrics.centerY+Math.sin(start)*segment.ry;
    const ex=plan.metrics.centerX+Math.cos(end)*segment.rx;
    const ey=plan.metrics.centerY+Math.sin(end)*segment.ry;
    return `M${sx.toFixed(2)},${sy.toFixed(2)} A${segment.rx.toFixed(2)},${segment.ry.toFixed(2)} 0 ${span>Math.PI?1:0} 0 ${ex.toFixed(2)},${ey.toFixed(2)}`;
  }

  function nearestSlotIndex(plan,x,y,count,focusRing){
    const total=Math.min(Math.max(0,Math.floor(finite(count,0))),plan&&plan.slots?plan.slots.length:0);
    let best=-1,bestD=Infinity;
    for(let i=0;i<total;i++){
      const point=plan.slots[i];
      if(focusRing>=0&&point.ring!==focusRing)continue;
      const d=Math.pow(point.x-finite(x),2)+Math.pow(point.y-finite(y),2);
      if(d<bestD){bestD=d;best=i;}
    }
    return best;
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
    const loopGroup=svgElement(document,'g');loopGroup.classList.add('inkframe-radial-loop-group');svg.appendChild(loopGroup);
    const filledThrough=Math.min(plan.slots.length,Math.max(0,Math.floor(finite(current,-1))+1));
    if(filledThrough>1){
      const trail=svgElement(document,'polyline');
      trail.classList.add('inkframe-radial-progress');
      trail.setAttribute('points',plan.slots.slice(0,filledThrough).map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '));
      svg.appendChild(trail);
    }
    const playhead=svgElement(document,'circle');
    playhead.classList.add('inkframe-radial-playhead');
    playhead.setAttribute('r','6.5');playhead.setAttribute('visibility','hidden');svg.appendChild(playhead);
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
  const fallbackView={rotation:0,focusCurrentRing:false,scrubMode:false};
  function viewFor(environment){
    const project=environment&&environment.project;
    if(project&&(typeof project==='object'||typeof project==='function')){
      let view=projectViews.get(project);
      if(!view){view={rotation:0,focusCurrentRing:false,scrubMode:false};projectViews.set(project,view);}
      return view;
    }
    return fallbackView;
  }
  function viewSnapshot(project){
    const view=project&&projectViews.get(project)||fallbackView;
    return Object.freeze({rotation:normalizeAngle(view.rotation),focusCurrentRing:!!view.focusCurrentRing,scrubMode:!!view.scrubMode});
  }

  let styleInstalled=false,lastPlan=null,lastBoard=null,lastEnvironment=null,drag=null;
  let lastPlayback=Object.freeze({fraction:0,current:0,playing:false,loopOn:false,loopIn:0,loopOut:0,fps:12});
  function installStyle(document){
    if(styleInstalled||!document||!document.head)return;
    const style=document.createElement('style');style.dataset.inkframeRadialTimelineStyle='true';
    style.textContent=`
#frameBoard[data-radial-timeline="true"]{inset:0;overflow:visible;isolation:isolate}
#frameBoard[data-radial-timeline="true"]:focus-visible{outline:2px solid rgba(255,255,255,.82);outline-offset:10px;border-radius:32px}
#frameBoard[data-radial-timeline="true"] .inkframe-radial-orbits{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:0;filter:drop-shadow(0 0 8px rgba(247,202,201,.18))}
.inkframe-radial-orbit{fill:none;stroke:rgba(255,240,243,.20);stroke-width:1.25;stroke-dasharray:2.2 5.6;vector-effect:non-scaling-stroke;transition:opacity .18s}
.inkframe-radial-hit{fill:none;stroke:rgba(0,0,0,0);stroke-width:24;pointer-events:stroke;cursor:grab;touch-action:none}
#frameBoard[data-scrub-mode="true"] .inkframe-radial-hit{cursor:ew-resize}
.inkframe-radial-hit:active{cursor:grabbing}
.inkframe-radial-progress{fill:none;stroke:rgba(247,202,201,.58);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 5px rgba(187,0,55,.62))}
.inkframe-radial-loop{fill:none;stroke:rgba(255,255,255,.82);stroke-width:5.2;stroke-linecap:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 6px rgba(187,0,55,.96))}
.inkframe-radial-playhead{fill:#fff;stroke:var(--accent);stroke-width:3;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 7px rgba(255,255,255,.95)) drop-shadow(0 0 13px rgba(187,0,55,.9));transition:r .14s}
#frameBoard[data-timeline-playing="true"] .inkframe-radial-playhead{animation:inkframeRadialPulse .72s ease-in-out infinite alternate}
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
.inkframe-radial-nav{position:absolute;left:50%;top:-58px;transform:translateX(-50%);z-index:8;display:flex;gap:5px;pointer-events:auto;padding:5px;border-radius:999px;background:rgba(10,0,10,.58);border:1px solid rgba(247,202,201,.25);box-shadow:0 7px 20px rgba(10,0,10,.36),inset 0 1px 0 rgba(255,255,255,.16);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.inkframe-radial-nav button{min-width:66px;min-height:32px;padding:6px 9px;border-radius:999px;border:1px solid rgba(247,202,201,.30);background:rgba(255,240,243,.07);color:var(--text);font:800 9px/1 var(--font-ui);letter-spacing:.065em;text-transform:uppercase;touch-action:manipulation}
.inkframe-radial-nav button[aria-pressed="true"]{background:linear-gradient(160deg,var(--accent-deep),var(--accent));border-color:var(--rim)}
#frameBoard[data-radial-timeline="true"] .frameCapBadge{bottom:-48px;z-index:6;background:rgba(10,0,10,.68);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
@keyframes inkframeRadialArrival{from{opacity:0;transform:translate(-50%,-50%) scale(.55)}to{opacity:1}}
@keyframes inkframeRadialPulse{from{r:5.8px}to{r:8px}}
@media (pointer:coarse){.inkframe-radial-nav button{min-width:76px;min-height:40px;font-size:9.5px}.inkframe-radial-hit{stroke-width:32}}
@media (prefers-reduced-motion:reduce){#frameBoard[data-radial-timeline="true"] .frameSlot{animation:none;transition:none}.inkframe-radial-orbit{transition:none}.inkframe-radial-playhead{animation:none!important}}
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

  function requestSeekFraction(env,fraction){
    if(!canNavigate(env))return false;
    if(typeof env.seekFraction==='function'){env.seekFraction(clamp(fraction,0,1));return true;}
    const map=timingMap(env&&env.framesLength,env&&env.holdAt);
    return requestSeek(env,timePosition(fraction,map).index);
  }

  function requestPlaybackToggle(env){
    if(!canNavigate(env)||!env||typeof env.togglePlayback!=='function')return false;
    env.togglePlayback();return true;
  }

  function createNavigation(document,board,plan,env,view,focusRing){
    const nav=document.createElement('div');nav.className='inkframe-radial-nav';nav.setAttribute('role','toolbar');
    nav.setAttribute('aria-label','Radial timeline navigation and playback');

    const play=document.createElement('button');play.type='button';play.className='inkframe-radial-play';
    play.setAttribute('aria-pressed',lastPlayback.playing?'true':'false');
    play.textContent=lastPlayback.playing?'Pause':'Play';play.title='Play or pause the established InkFrame timeline';
    play.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();requestPlaybackToggle(lastEnvironment);});

    const center=document.createElement('button');center.type='button';center.className='inkframe-radial-center';
    center.textContent='Center';center.title='Rotate the current frame to twelve o’clock';
    center.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      if(!canNavigate(lastEnvironment))return;
      view.rotation=rotationForFocus(lastPlan,finite(lastPlayback.current,lastEnvironment&&lastEnvironment.current));
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

    const scrub=document.createElement('button');scrub.type='button';scrub.className='inkframe-radial-scrub';
    scrub.setAttribute('aria-pressed',view.scrubMode?'true':'false');scrub.textContent='Scrub';
    scrub.title=view.scrubMode?'Orbit drag seeks through hold-weighted time':'Orbit drag rotates the timeline';
    scrub.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      if(!canNavigate(lastEnvironment))return;
      view.scrubMode=!view.scrubMode;
      render(lastBoard,lastEnvironment);
    });

    nav.append(play,center,ring,scrub);return nav;
  }

  function boardPoint(board,event,plan){
    const rect=board&&board.getBoundingClientRect?board.getBoundingClientRect():{left:0,top:0};
    return {x:finite(event&&event.clientX)-finite(rect.left),y:finite(event&&event.clientY)-finite(rect.top)};
  }

  function angleAtEvent(board,event,plan){
    const p=boardPoint(board,event,plan);
    return Math.atan2(p.y-plan.metrics.centerY,p.x-plan.metrics.centerX);
  }

  function scrubAtEvent(board,event){
    if(!lastPlan||!lastEnvironment||!canNavigate(lastEnvironment))return false;
    const view=viewFor(lastEnvironment),focusRing=view.focusCurrentRing?ringForIndex(lastPlan,lastPlayback.current):-1;
    const point=boardPoint(board,event,lastPlan);
    const index=nearestSlotIndex(lastPlan,point.x,point.y,lastEnvironment.framesLength,focusRing);
    if(index<0)return false;
    const fraction=frameCenterFraction(index,timingMap(lastEnvironment.framesLength,lastEnvironment.holdAt));
    board.dataset.timelineScrubFrame=String(index);
    return requestSeekFraction(lastEnvironment,fraction);
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
      if(view.scrubMode){
        drag={pointerId:event.pointerId,mode:'scrub'};board.dataset.timelineScrubbing='true';scrubAtEvent(board,event);
      }else{
        drag={pointerId:event.pointerId,mode:'rotate',startAngle:angleAtEvent(board,event,lastPlan),startRotation:view.rotation};
        board.dataset.timelineDragging='true';
      }
    });
    board.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pointerId||!lastPlan)return;
      event.preventDefault();event.stopPropagation();
      if(drag.mode==='scrub'){scrubAtEvent(board,event);return;}
      const view=viewFor(lastEnvironment);
      view.rotation=normalizeAngle(drag.startRotation+angleAtEvent(board,event,lastPlan)-drag.startAngle);
      render(board,lastEnvironment);
    });
    const endDrag=event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      event.preventDefault();event.stopPropagation();
      drag=null;delete board.dataset.timelineDragging;delete board.dataset.timelineScrubbing;delete board.dataset.timelineScrubFrame;
      try{board.releasePointerCapture&&board.releasePointerCapture(event.pointerId);}catch(_){ }
    };
    board.addEventListener('pointerup',endDrag);
    board.addEventListener('pointercancel',endDrag);
    board.addEventListener('keydown',event=>{
      if(!lastEnvironment||!canNavigate(lastEnvironment))return;
      let next=null;
      if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=stepIndex(lastPlayback.current,-1,lastEnvironment.framesLength);
      else if(event.key==='ArrowRight'||event.key==='ArrowDown')next=stepIndex(lastPlayback.current,1,lastEnvironment.framesLength);
      else if(event.key==='PageUp')next=stepIndex(lastPlayback.current,-10,lastEnvironment.framesLength);
      else if(event.key==='PageDown')next=stepIndex(lastPlayback.current,10,lastEnvironment.framesLength);
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=Math.max(0,Math.floor(finite(lastEnvironment.framesLength,0))-1);
      else if(event.key===' '){event.preventDefault();event.stopPropagation();requestPlaybackToggle(lastEnvironment);return;}
      if(next==null)return;
      event.preventDefault();event.stopPropagation();requestSeek(lastEnvironment,next);
    });
  }

  function updateCurrentClasses(board,current){
    const target=Math.floor(finite(current,-1));
    let active=null;
    for(const cell of board.querySelectorAll('.frameSlot.filled')){
      const isCurrent=Number(cell.dataset.frame)===target;
      cell.classList.toggle('cur',isCurrent);
      const selected=cell.classList.contains('sel');
      cell.setAttribute('aria-selected',isCurrent||selected?'true':'false');
      if(isCurrent)active=cell;
    }
    if(active)board.setAttribute('aria-activedescendant',active.id);else board.removeAttribute('aria-activedescendant');
  }

  function updateLoopOverlay(svg,plan,state,count){
    const group=svg&&svg.querySelector('.inkframe-radial-loop-group');
    if(!group)return;
    group.replaceChildren();
    if(!state.loopOn||count<2)return;
    for(const segment of loopSegments(plan,state.loopIn,state.loopOut,count)){
      const path=svgElement(svg.ownerDocument,'path');path.classList.add('inkframe-radial-loop');
      path.dataset.ring=String(segment.ring);path.setAttribute('d',loopArcPath(plan,segment));group.appendChild(path);
    }
  }

  function syncPlayback(state){
    if(!lastBoard||!lastPlan||!lastEnvironment)return false;
    const next=Object.freeze({
      fraction:clamp(state&&state.fraction!=null?state.fraction:lastPlayback.fraction,0,1),
      current:Math.max(0,Math.floor(finite(state&&state.current!=null?state.current:lastPlayback.current,0))),
      playing:!!(state&&state.playing),
      loopOn:!!(state&&state.loopOn),
      loopIn:Math.max(0,Math.floor(finite(state&&state.loopIn,0))),
      loopOut:Math.max(0,Math.floor(finite(state&&state.loopOut,0))),
      fps:Math.max(1,Math.floor(finite(state&&state.fps,12))),
    });
    lastPlayback=next;lastEnvironment.current=next.current;
    const view=viewFor(lastEnvironment),desiredRing=view.focusCurrentRing?ringForIndex(lastPlan,next.current):-1;
    const shownRing=lastBoard.dataset.focusRing==null?-1:Number(lastBoard.dataset.focusRing);
    if(view.focusCurrentRing&&desiredRing!==shownRing)return render(lastBoard,lastEnvironment);
    lastBoard.dataset.timelinePlaying=next.playing?'true':'false';
    lastBoard.dataset.scrubMode=view.scrubMode?'true':'false';
    updateCurrentClasses(lastBoard,next.current);
    const play=lastBoard.querySelector('.inkframe-radial-play');
    if(play){play.textContent=next.playing?'Pause':'Play';play.setAttribute('aria-pressed',next.playing?'true':'false');}
    const svg=lastBoard.querySelector('.inkframe-radial-orbits');
    if(svg){
      updateLoopOverlay(svg,lastPlan,next,lastEnvironment.framesLength);
      const marker=svg.querySelector('.inkframe-radial-playhead');
      const point=playbackPoint(lastPlan,next.fraction,lastEnvironment.framesLength,lastEnvironment.holdAt);
      if(marker&&point){
        marker.setAttribute('cx',point.x.toFixed(2));marker.setAttribute('cy',point.y.toFixed(2));marker.setAttribute('visibility','visible');
        marker.dataset.frame=String(point.index);marker.dataset.local=point.local.toFixed(4);
      }else if(marker)marker.setAttribute('visibility','hidden');
    }
    return true;
  }

  function render(board,environment){
    const env=environment||{},document=board&&board.ownerDocument;
    if(!board||!document)return false;
    const slotCount=clamp(Math.floor(finite(env.slotCount,0)),0,Math.max(0,Math.floor(finite(env.maxFrames,120))));
    installStyle(document);installNavigation(board);
    const view=viewFor(env);
    const plan=layout(slotCount,metricsFromEnvironment(env),env.shape,{rotation:view.rotation});
    const current=Math.floor(finite(env.current,0));
    const focusRing=view.focusCurrentRing?ringForIndex(plan,current):-1;
    lastPlan=plan;lastBoard=board;lastEnvironment=env;
    board.replaceChildren();board.dataset.radialTimeline='true';board.dataset.timelineShape=plan.shape;
    board.dataset.timelineRotation=String(plan.rotation);board.dataset.scrubMode=view.scrubMode?'true':'false';
    if(focusRing>=0)board.dataset.focusRing=String(focusRing);else delete board.dataset.focusRing;
    board.setAttribute('aria-label',`${plan.shape==='circle'?'Circular':'Elliptical'} radial frame timeline`);
    board.setAttribute('role','listbox');board.tabIndex=0;
    board.appendChild(createOrbitSvg(document,plan,current,focusRing));
    for(const point of plan.slots)board.appendChild(createSlot(document,point,env,focusRing));
    const active=board.querySelector('.frameSlot.cur');
    if(active)board.setAttribute('aria-activedescendant',active.id);else board.removeAttribute('aria-activedescendant');
    board.appendChild(createNavigation(document,board,plan,env,view,focusRing));
    const badge=document.createElement('div');
    badge.className='frameCapBadge'+(finite(env.framesLength)>=finite(env.maxFrames,120)*.85?' warn':'');
    badge.textContent=`${Math.max(0,Math.floor(finite(env.framesLength,0)))} / ${Math.max(0,Math.floor(finite(env.maxFrames,120)))}`;
    board.appendChild(badge);
    const map=timingMap(env.framesLength,env.holdAt);
    return syncPlayback({
      fraction:env.playbackFraction!=null?env.playbackFraction:frameCenterFraction(current,map),
      current,playing:env.playing,loopOn:env.loopOn,loopIn:env.loopIn,loopOut:env.loopOut,fps:env.fps,
    });
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
    const view=viewFor(lastEnvironment);view.rotation=rotationForFocus(lastPlan,lastPlayback.current);
    return render(lastBoard,lastEnvironment);
  }

  function toggleRingFocus(){
    if(!lastBoard||!lastEnvironment||!canNavigate(lastEnvironment))return false;
    const view=viewFor(lastEnvironment);view.focusCurrentRing=!view.focusCurrentRing;
    return render(lastBoard,lastEnvironment);
  }

  function toggleScrubMode(){
    if(!lastBoard||!lastEnvironment||!canNavigate(lastEnvironment))return false;
    const view=viewFor(lastEnvironment);view.scrubMode=!view.scrubMode;
    return render(lastBoard,lastEnvironment);
  }

  const api={
    normalizeShape,normalizeAngle,ellipseCircumference,normalizeMetrics,baseRadii,ringCapacity,planRings,layout,
    ringForIndex,rotationForFocus,stepIndex,timingMap,frameCenterFraction,timePosition,playbackPoint,
    loopSegments,loopArcPath,nearestSlotIndex,stateFor,render,refreshThumbnail,focusCurrent,toggleRingFocus,toggleScrubMode,
    syncPlayback,viewSnapshot,get lastLayout(){return lastPlan;},get playbackState(){return lastPlayback;},
    projectCanvasWrites:0,undoWrites:0,
  };
  root.InkFrameRadialTimeline=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
