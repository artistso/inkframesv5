// InkFrame Brush Engine V2 — deterministic local Brush Coach
'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const round=(v,n=2)=>{const p=10**n;return Math.round((Number(v)||0)*p)/p;};
  const samples=ref=>(Array.isArray(ref&&ref.events)?ref.events:[]).map(e=>e&&e.sample).filter(s=>s&&Number.isFinite(+s.x)&&Number.isFinite(+s.y));
  function angle(a,b,c){
    const x1=b.x-a.x,y1=b.y-a.y,x2=c.x-b.x,y2=c.y-b.y,l1=Math.hypot(x1,y1),l2=Math.hypot(x2,y2);
    if(l1<.75||l2<.75)return 0;
    return Math.acos(clamp((x1*x2+y1*y2)/(l1*l2),-1,1))*180/Math.PI;
  }
  function analyzeReferenceStroke(ref){
    const list=samples(ref);if(list.length<3)return Object.freeze({valid:false,reason:'Draw a longer reference stroke',sampleCount:list.length});
    let distance=0,duration=0,speedArea=0,speedTime=0,maxSpeed=0,slow=0,fast=0,corners=0,severe=0,turns=0;
    let pMin=1,pMax=0,pSum=0,pSq=0,pCount=0;
    for(let i=1;i<list.length;i++){
      const d=Math.hypot(list[i].x-list[i-1].x,list[i].y-list[i-1].y),dt=Math.max(0,(+list[i].timeStamp||0)-(+list[i-1].timeStamp||0));
      distance+=d;duration+=dt;if(dt){const speed=d/dt;speedArea+=speed*dt;speedTime+=dt;maxSpeed=Math.max(maxSpeed,speed);if(speed<.35)slow+=d;if(speed>1.25)fast+=d;}
    }
    for(let i=1;i<list.length-1;i++){const value=angle(list[i-1],list[i],list[i+1]);if(value>=35){corners++;turns+=value;if(value>=80)severe++;}}
    for(const item of list){const p=clamp(item.pressure,0,1);if(!p)continue;pMin=Math.min(pMin,p);pMax=Math.max(pMax,p);pSum+=p;pSq+=p*p;pCount++;}
    const avgSpeed=speedTime?speedArea/speedTime:0,slowRatio=distance?slow/distance:0,fastRatio=distance?fast/distance:0,density=corners/Math.max(1,distance/100),avgPressure=pCount?pSum/pCount:0,dev=Math.sqrt(Math.max(0,pCount?pSq/pCount-avgPressure*avgPressure:0));
    let intent='balanced';if(slowRatio>=.5&&avgSpeed<.55)intent='precision';else if(fastRatio>=.45||avgSpeed>1.15)intent='gesture';else if(density>=1.5||severe>=3)intent='angular';else if(dev>=.16||(pCount?pMax-pMin:0)>=.45)intent='expressive';
    return Object.freeze({valid:true,intent,sampleCount:list.length,distancePx:round(distance,1),durationMs:round(duration,1),averageSpeedPxPerMs:round(avgSpeed,3),maxSpeedPxPerMs:round(maxSpeed,3),slowRatio:round(slowRatio,3),fastRatio:round(fastRatio,3),cornerCount:corners,severeCorners:severe,cornerDensityPer100Px:round(density,2),averageTurnDegrees:round(corners?turns/corners:0,1),averagePressure:round(avgPressure,3),pressureRange:round(pCount?pMax-pMin:0,3),pressureDeviation:round(dev,3)});
  }
  function recommendationFromAnalysis(a,currentValue){
    const current=ns.normalizeTuning?ns.normalizeTuning(currentValue||{}):Object.assign({},currentValue||{});
    if(!a||!a.valid)return Object.freeze({valid:false,label:'No suggestion',reasons:Object.freeze([a&&a.reason||'Draw a reference stroke']),tuning:current,analysis:a});
    const t=Object.assign({},current,{preset:'custom',stabilizerMode:'adaptive',coverageMode:'ribbon',radiusMode:'guarded',contactMode:'strict',cornerMode:'preserve'}),reasons=[];
    if(a.intent==='precision'){t.stabilizerStrength=clamp(135+a.slowRatio*45,120,190);t.cornerStrength=clamp(55+a.cornerDensityPer100Px*10,55,85);t.ghostMode='comet';t.ghostIntensity=55;t.ghostLengthMs=260;reasons.push('Slow-detail movement favors stronger stabilization.');}
    else if(a.intent==='gesture'){t.stabilizerStrength=clamp(35+(1-a.fastRatio)*35,25,70);t.cornerStrength=clamp(65+a.severeCorners*3,65,95);t.ghostMode='echo';t.ghostIntensity=78;t.ghostLengthMs=520;reasons.push('Fast movement favors lower lag.','Echo trail emphasizes gesture direction.');}
    else if(a.intent==='angular'){t.stabilizerStrength=clamp(70+a.slowRatio*45,65,125);t.cornerStrength=clamp(72+a.cornerDensityPer100Px*7,75,100);t.ghostMode='comet';t.ghostIntensity=64;t.ghostLengthMs=320;reasons.push('Frequent heading changes favor stronger corner preservation.');}
    else if(a.intent==='expressive'){t.stabilizerStrength=clamp(75+a.slowRatio*35,70,120);t.cornerStrength=70;t.ghostMode='echo';t.ghostIntensity=72;t.ghostLengthMs=460;reasons.push('Wide pressure variation favors moderate stabilization.');}
    else{t.stabilizerStrength=clamp(85+a.slowRatio*35-a.fastRatio*25,65,125);t.cornerStrength=70;t.ghostMode='comet';t.ghostIntensity=65;t.ghostLengthMs=340;reasons.push('Mixed movement receives a balanced low-latency profile.');}
    const titles={precision:'Precision detail',gesture:'Fast gesture',angular:'Corner-heavy',expressive:'Pressure expressive',balanced:'Balanced'};
    return Object.freeze({valid:true,id:'coach:suggested',kind:'coach',label:`Suggested · ${titles[a.intent]||'Balanced'}`,confidence:round(clamp(.55+Math.min(.25,a.sampleCount/800)+Math.min(.2,a.distancePx/1200),.55,.95),2),reasons:Object.freeze(reasons),tuning:ns.normalizeTuning?ns.normalizeTuning(t):t,analysis:a});
  }
  function analysisChips(a){return !a||!a.valid?Object.freeze([]):Object.freeze([{label:'Intent',value:a.intent},{label:'Speed',value:`${a.averageSpeedPxPerMs} px/ms`},{label:'Corners',value:String(a.cornerCount)},{label:'Pressure',value:`${Math.round(a.pressureRange*100)}% range`}].map(Object.freeze));}
  function install(){
    const replay=root.InkFrameBrushV2ReferenceReplay,preview=root.InkFrameBrushV2PreviewPad,adapter=root.InkFrameBrushV2Adapter;
    if(!root.document||!replay||!replay.installed||!replay.recorder||!preview||!preview.card||!adapter)return false;
    if(root.InkFrameBrushCoach&&root.InkFrameBrushCoach.installed)return true;
    const diff=preview.card.querySelector('.inkframe-v2-reference-diff');if(!diff)return false;
    const style=root.document.createElement('style');style.textContent='.inkframe-v2-coach{margin-top:9px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:rgba(255,255,255,.035)}.inkframe-v2-coach-head{display:flex;justify-content:space-between;gap:8px}.inkframe-v2-coach-head strong{font:760 11px/1.2 system-ui}.inkframe-v2-coach-head span,.inkframe-v2-coach-reason{font:650 9px/1.35 system-ui;opacity:.68}.inkframe-v2-coach-chips,.inkframe-v2-coach-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.inkframe-v2-coach-chip{padding:6px 8px;border:1px solid rgba(255,255,255,.11);border-radius:999px;font:650 9px/1 system-ui}.inkframe-v2-coach-actions button{min-height:38px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.07);color:#fff;padding:7px 10px;font:720 10px/1 system-ui}.inkframe-v2-coach-actions .primary{background:linear-gradient(145deg,#a6005c,#590051);border-color:#ffc6e8}';root.document.head.appendChild(style);
    const panel=root.document.createElement('section');panel.className='inkframe-v2-coach';panel.innerHTML='<div class="inkframe-v2-coach-head"><strong>Brush Coach</strong><span>Draw a reference stroke</span></div><div class="inkframe-v2-coach-chips"></div><div class="inkframe-v2-coach-reason"></div><div class="inkframe-v2-coach-actions"><button class="primary">Save & Compare</button><button>Apply Suggestion</button><button>Save Suggestion</button></div>';diff.insertAdjacentElement('afterend',panel);
    const confidence=panel.querySelector('.inkframe-v2-coach-head span'),chips=panel.querySelector('.inkframe-v2-coach-chips'),reason=panel.querySelector('.inkframe-v2-coach-reason'),buttons=Array.from(panel.querySelectorAll('button'));let suggestion=null;
    const store=()=>root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;
    const name=()=>`Coach · ${String(suggestion&&suggestion.label||'Suggested').replace(/^Suggested · /,'')}`.slice(0,32);
    function refresh(){const a=analyzeReferenceStroke(replay.recorder.snapshot());suggestion=recommendationFromAnalysis(a,adapter.currentTuning());chips.replaceChildren();buttons.forEach(b=>b.disabled=!suggestion.valid);if(!suggestion.valid){confidence.textContent='Draw a reference stroke';reason.textContent='';return suggestion;}confidence.textContent=`${Math.round(suggestion.confidence*100)}% confidence`;for(const chip of analysisChips(a)){const node=root.document.createElement('span');node.className='inkframe-v2-coach-chip';node.textContent=`${chip.label}: ${chip.value}`;chips.appendChild(node);}reason.textContent=suggestion.reasons.join(' ');return suggestion;}
    function save(){const target=store();return suggestion&&suggestion.valid&&target?target.save(name(),suggestion.tuning):null;}
    function compare(){const preset=save();if(!preset||!preview.selectCompare||!preview.selectCompare(`saved:${preset.id}`))return false;preview.setCompareEnabled&&preview.setCompareEnabled(true);replay.replay&&replay.replay();return true;}
    function apply(){if(!suggestion||!suggestion.valid)return false;const ok=adapter.setTuning(suggestion.tuning);if(ok&&root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();return !!ok;}
    buttons[0].addEventListener('click',compare);buttons[1].addEventListener('click',apply);buttons[2].addEventListener('click',save);preview.card.addEventListener('pointerup',()=>root.setTimeout(refresh,0),true);preview.card.addEventListener('pointercancel',()=>root.setTimeout(refresh,0),true);root.setTimeout(refresh,0);
    root.InkFrameBrushCoach=Object.freeze({installed:true,panel,refresh,compare,apply,save,current:()=>suggestion,analyzeReferenceStroke,recommendationFromAnalysis,analysisChips,projectCanvasWrites:0,undoWrites:0});return true;
  }
  const api={analyzeReferenceStroke,recommendationFromAnalysis,analysisChips,install};Object.assign(ns,api);root.InkFrameBrushCoach=api;if(root.document){const start=()=>{if(!install())root.setTimeout(start,16);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
