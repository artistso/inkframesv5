// InkFrame — Circular Canvas foundation
'use strict';
(function(root){
  const SHAPES=Object.freeze(['square','circle']);
  const normalizeShape=value=>value==='circle'?'circle':'square';
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));

  function circleGeometry(width,height){
    const w=Math.max(1,finite(width,1)),h=Math.max(1,finite(height,1));
    return Object.freeze({cx:w/2,cy:h/2,r:Math.max(.5,Math.min(w,h)/2)});
  }
  function containsPoint(x,y,width,height,shape){
    const w=Math.max(1,finite(width,1)),h=Math.max(1,finite(height,1));
    if(normalizeShape(shape)!=='circle')return finite(x)>=0&&finite(y)>=0&&finite(x)<=w&&finite(y)<=h;
    const c=circleGeometry(w,h),dx=finite(x)-c.cx,dy=finite(y)-c.cy;
    return dx*dx+dy*dy<=c.r*c.r+1e-7;
  }
  function clampPoint(x,y,width,height,shape){
    const w=Math.max(1,finite(width,1)),h=Math.max(1,finite(height,1));
    const px=finite(x),py=finite(y);
    if(normalizeShape(shape)!=='circle')return Object.freeze({x:clamp(px,0,w),y:clamp(py,0,h),inside:px>=0&&py>=0&&px<=w&&py<=h});
    const c=circleGeometry(w,h),dx=px-c.cx,dy=py-c.cy,d=Math.hypot(dx,dy),inside=d<=c.r;
    if(inside||d<1e-9)return Object.freeze({x:d<1e-9?c.cx:px,y:d<1e-9?c.cy:py,inside:true});
    const k=c.r/d;return Object.freeze({x:c.cx+dx*k,y:c.cy+dy*k,inside:false});
  }
  function eventPoint(event,canvas,width,height){
    const rect=canvas&&canvas.getBoundingClientRect?canvas.getBoundingClientRect():{left:0,top:0,width:width||1,height:height||1};
    const rw=finite(rect.width,1)||1,rh=finite(rect.height,1)||1;
    return Object.freeze({
      x:(finite(event&&event.clientX)-finite(rect.left))*Math.max(1,finite(width,1))/rw,
      y:(finite(event&&event.clientY)-finite(rect.top))*Math.max(1,finite(height,1))/rh,
      rect,
    });
  }
  function mapEventPoint(event,canvas,width,height,shape){
    const point=eventPoint(event,canvas,width,height),mapped=clampPoint(point.x,point.y,width,height,shape);
    return Object.freeze({x:mapped.x,y:mapped.y,inside:mapped.inside});
  }
  function acceptsPointerDown(event,canvas,width,height,shape){
    if(normalizeShape(shape)!=='circle')return true;
    const p=eventPoint(event,canvas,width,height);return containsPoint(p.x,p.y,width,height,'circle');
  }
  function boundaryEvent(event,canvas,width,height,shape){
    if(normalizeShape(shape)!=='circle')return null;
    const point=eventPoint(event,canvas,width,height),mapped=clampPoint(point.x,point.y,width,height,'circle');
    if(mapped.inside)return null;
    const rect=point.rect,rw=finite(rect.width,1)||1,rh=finite(rect.height,1)||1;
    const clientX=finite(rect.left)+(mapped.x/Math.max(1,finite(width,1)))*rw;
    const clientY=finite(rect.top)+(mapped.y/Math.max(1,finite(height,1)))*rh;
    const source=event||{};
    return Object.freeze({
      type:'pointerup',pointerId:source.pointerId,pointerType:source.pointerType||'pen',
      clientX,clientY,pressure:finite(source.pressure),tiltX:finite(source.tiltX),tiltY:finite(source.tiltY),
      twist:finite(source.twist),width:finite(source.width),height:finite(source.height),
      altitudeAngle:source.altitudeAngle,azimuthAngle:source.azimuthAngle,
      buttons:0,button:source.button,timeStamp:finite(source.timeStamp,root.performance&&root.performance.now?root.performance.now():Date.now()),
      preventDefault(){try{source.preventDefault&&source.preventDefault();}catch(_){}},
      stopPropagation(){try{source.stopPropagation&&source.stopPropagation();}catch(_){}},
      stopImmediatePropagation(){try{source.stopImmediatePropagation&&source.stopImmediatePropagation();}catch(_){}},
      getCoalescedEvents(){return [];},
    });
  }
  function circlePath(context,width,height){
    const c=circleGeometry(width,height);context.beginPath();context.arc(c.cx,c.cy,c.r,0,Math.PI*2);return c;
  }
  function maskComposite(canvas,width,height,shape){
    if(normalizeShape(shape)!=='circle'||!canvas||!canvas.getContext)return canvas;
    const g=canvas.getContext('2d');if(!g)return canvas;
    g.save();g.globalAlpha=1;g.globalCompositeOperation='destination-in';g.fillStyle='#000';circlePath(g,width||canvas.width,height||canvas.height);g.fill();g.restore();
    g.globalAlpha=1;g.globalCompositeOperation='source-over';return canvas;
  }
  function paintExportPaper(context,width,height,shape,paper){
    if(!context)return false;const w=Math.max(1,finite(width,1)),h=Math.max(1,finite(height,1));
    context.save();context.globalAlpha=1;context.globalCompositeOperation='source-over';context.clearRect(0,0,w,h);
    if(normalizeShape(shape)==='circle'){circlePath(context,w,h);context.clip();}
    context.fillStyle=paper||'#fff0f3';context.fillRect(0,0,w,h);context.restore();return true;
  }
  function displayCircleRadius(canvas){
    if(!canvas)return 0;return Math.max(0,Math.min(finite(canvas.clientWidth),finite(canvas.clientHeight))/2);
  }

  let installed=false,env=null,button=null,rim=null,resizeObserver=null;
  function currentShape(){return normalizeShape(env&&env.getShape?env.getShape():'square');}
  function sync(){
    if(!env||!env.canvas)return false;const shape=currentShape(),canvas=env.canvas,frameGlass=env.frameGlass;
    if(root.document&&root.document.body){root.document.body.dataset.canvasShape=shape;root.document.body.classList.toggle('inkframe-canvas-circle',shape==='circle');}
    if(shape==='circle'){
      const radius=displayCircleRadius(canvas);canvas.style.clipPath=`circle(${radius}px at 50% 50%)`;canvas.style.borderRadius='50%';
    }else{canvas.style.clipPath='';canvas.style.borderRadius='';}
    if(button){button.textContent=shape==='circle'?'◯ Circle':'□ Square';button.setAttribute('aria-pressed',shape==='circle'?'true':'false');button.title=`Canvas shape · ${shape}`;}
    if(rim&&frameGlass){
      const cw=finite(canvas.clientWidth),ch=finite(canvas.clientHeight),d=Math.min(cw,ch);
      rim.hidden=shape!=='circle'||d<=0;
      if(!rim.hidden){rim.style.width=`${d}px`;rim.style.height=`${d}px`;rim.style.left=`${finite(canvas.offsetLeft)+(cw-d)/2}px`;rim.style.top=`${finite(canvas.offsetTop)+(ch-d)/2}px`;}
    }
    return true;
  }
  function toggle(){
    if(!env||!env.setShape)return false;const next=currentShape()==='circle'?'square':'circle';
    const ok=env.setShape(next);if(ok!==false)sync();return ok!==false;
  }
  function install(){
    if(installed)return true;const factory=root.InkFrameCanvasShapeEnvironment;
    env=typeof factory==='function'?factory():null;if(!env||!env.canvas||!env.frameGlass)return false;
    installed=true;
    const style=root.document.createElement('style');style.dataset.inkframeCanvasShapeStyle='true';style.textContent='body.inkframe-canvas-circle #frameGlass{overflow:visible}.inkframe-canvas-shape-toggle{position:absolute;right:18px;top:18px;z-index:18;min-width:92px;min-height:42px;padding:8px 12px;border-radius:999px;border:1px solid rgba(255,240,243,.48);background:rgba(42,0,26,.72);color:#fff0f3;box-shadow:0 8px 24px rgba(20,0,14,.35),inset 0 1px 0 rgba(255,255,255,.2);font:800 10px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;touch-action:manipulation}.inkframe-canvas-shape-rim{position:absolute;z-index:14;pointer-events:none;border-radius:50%;border:2px solid rgba(255,240,243,.78);box-shadow:0 0 0 1px rgba(20,0,14,.5),0 0 34px rgba(247,202,201,.28),inset 0 0 24px rgba(255,255,255,.12)}';
    root.document.head.appendChild(style);
    button=root.document.createElement('button');button.type='button';button.className='inkframe-canvas-shape-toggle';button.addEventListener('click',toggle);
    rim=root.document.createElement('div');rim.className='inkframe-canvas-shape-rim';rim.hidden=true;
    env.frameGlass.append(rim,button);
    if(typeof root.ResizeObserver==='function'){resizeObserver=new root.ResizeObserver(sync);resizeObserver.observe(env.canvas);}
    root.addEventListener&&root.addEventListener('resize',sync);sync();return true;
  }
  function start(){if(!install())root.setTimeout(start,16);}
  const api={SHAPES,normalizeShape,circleGeometry,containsPoint,clampPoint,eventPoint,mapEventPoint,acceptsPointerDown,boundaryEvent,maskComposite,paintExportPaper,displayCircleRadius,install,sync,toggle,currentShape:()=>currentShape(),get installed(){return installed;},projectCanvasWrites:0,undoWrites:0};
  root.InkFrameCanvasShape=api;
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
