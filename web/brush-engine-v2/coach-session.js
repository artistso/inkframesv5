// InkFrame Brush Engine V2 — deterministic four-stroke Brush Coach session
'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const STEPS=Object.freeze([
    Object.freeze({id:'detail',label:'Detail',hint:'Draw small handwriting or a tight spiral.'}),
    Object.freeze({id:'corners',label:'Corners',hint:'Draw a square, star, or sharp zigzag.'}),
    Object.freeze({id:'gesture',label:'Gesture',hint:'Draw one fast sweeping curve or flick.'}),
    Object.freeze({id:'pressure',label:'Pressure',hint:'Draw from light pressure to heavy pressure.'}),
  ]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const round=v=>Math.round(Number(v)||0);
  const normalize=v=>ns.normalizeTuning?ns.normalizeTuning(v||{}):Object.assign({},v||{});

  function createCoachSession(options){
    const config=options||{},analyze=config.analyze||ns.analyzeReferenceStroke,recommend=config.recommend||ns.recommendationFromAnalysis,current=config.current||(()=>({}));
    const slots=new Map();let selected='detail',revision=0;
    const step=id=>STEPS.find(item=>item.id===id)||null;
    const completed=()=>STEPS.filter(item=>slots.has(item.id)).length;
    function select(id){if(!step(id))return false;selected=id;revision++;return true;}
    function capture(reference){
      const analysis=typeof analyze==='function'?analyze(reference):null;if(!analysis||!analysis.valid)return false;
      slots.set(selected,Object.freeze({reference,analysis}));
      const next=STEPS.find(item=>!slots.has(item.id));if(next)selected=next.id;revision++;return true;
    }
    function remove(id){const ok=slots.delete(id);if(ok){selected=id;revision++;}return ok;}
    function reset(){slots.clear();selected='detail';revision++;return true;}
    function blend(recs,key,weights,fallback){let total=0,value=0;for(const [id,weight] of Object.entries(weights)){const rec=recs[id];if(rec&&Number.isFinite(Number(rec.tuning&&rec.tuning[key]))){value+=Number(rec.tuning[key])*weight;total+=weight;}}return total?value/total:fallback;}
    function suggestion(){
      const count=completed();if(count<STEPS.length)return Object.freeze({valid:false,completed:count,required:STEPS.length,label:`Session · ${count}/4`,reasons:Object.freeze(['Complete all four exercises.']),tuning:normalize(current())});
      const base=normalize(current()),recs={},analyses={};
      for(const item of STEPS){const entry=slots.get(item.id);analyses[item.id]=entry.analysis;recs[item.id]=recommend(entry.analysis,base);}
      const tuning=Object.assign({},base,{preset:'custom',stabilizerMode:'adaptive',cornerMode:'preserve',coverageMode:'ribbon',radiusMode:'guarded',contactMode:'strict'});
      tuning.stabilizerStrength=clamp(round(blend(recs,'stabilizerStrength',{detail:.48,gesture:.28,corners:.14,pressure:.10},100)),25,200);
      tuning.cornerStrength=clamp(round(blend(recs,'cornerStrength',{corners:.55,gesture:.20,detail:.15,pressure:.10},70)),0,100);
      tuning.ghostIntensity=clamp(round(blend(recs,'ghostIntensity',{gesture:.45,pressure:.30,detail:.15,corners:.10},65)),0,100);
      tuning.ghostLengthMs=clamp(round(blend(recs,'ghostLengthMs',{gesture:.50,pressure:.25,detail:.15,corners:.10},360)),80,1200);
      tuning.ghostMode=(analyses.gesture.intent==='gesture'||analyses.pressure.intent==='expressive')?'echo':'comet';
      const confidence=clamp(.72+STEPS.reduce((sum,item)=>sum+(Number(recs[item.id].confidence)||.55),0)/20,.72,.96);
      const reasons=Object.freeze([
        `Detail sample sets stabilization near ${tuning.stabilizerStrength}%.`,
        `Corner sample sets corner response near ${tuning.cornerStrength}%.`,
        `${tuning.ghostMode==='echo'?'Echo':'Comet'} trail reflects gesture and pressure samples.`,
        'Ribbon coverage, guarded width, and strict contact remain enabled.',
      ]);
      return Object.freeze({valid:true,id:'coach:session',kind:'coach-session',label:'Suggested · Complete session',completed:4,required:4,confidence,analyses:Object.freeze(analyses),reasons,tuning:normalize(tuning)});
    }
    function snapshot(){return Object.freeze({selected,completed:completed(),required:4,revision,steps:Object.freeze(STEPS.map(item=>Object.freeze({id:item.id,label:item.label,hint:item.hint,complete:slots.has(item.id),analysis:slots.get(item.id)?.analysis||null}))),suggestion:suggestion()});}
    return Object.freeze({select,capture,remove,reset,suggestion,snapshot,get selected(){return selected;}});
  }

  function install(){
    const coach=root.InkFrameBrushCoach,replay=root.InkFrameBrushV2ReferenceReplay,preview=root.InkFrameBrushV2PreviewPad,adapter=root.InkFrameBrushV2Adapter;
    if(!root.document||!coach||!coach.installed||!coach.panel||!replay||!replay.recorder||!preview||!preview.card||!adapter)return false;
    if(root.InkFrameBrushCoachSession&&root.InkFrameBrushCoachSession.installed)return true;
    const model=createCoachSession({current:()=>adapter.currentTuning()});
    const details=root.document.createElement('details');details.className='inkframe-v2-coach-session';details.innerHTML='<summary>Coach Session · 0/4</summary><div class="inkframe-v2-coach-session-steps"></div><p class="inkframe-v2-coach-session-hint"></p><p class="inkframe-v2-coach-session-result"></p><div class="inkframe-v2-coach-session-actions"><button class="primary">Save & Compare Session</button><button>Apply Session</button><button>Save Session</button><button>Reset</button></div>';
    const style=root.document.createElement('style');style.textContent='.inkframe-v2-coach-session{margin-top:9px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}.inkframe-v2-coach-session summary{cursor:pointer;font:760 10px/1.2 system-ui}.inkframe-v2-coach-session-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px}.inkframe-v2-coach-session-steps button,.inkframe-v2-coach-session-actions button{min-height:38px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;padding:7px;font:700 9px/1.15 system-ui}.inkframe-v2-coach-session-steps button.active{border-color:#ffc6e8;background:rgba(166,0,92,.4)}.inkframe-v2-coach-session-steps button.complete:after{content:" ✓"}.inkframe-v2-coach-session-hint,.inkframe-v2-coach-session-result{font:650 9px/1.35 system-ui;opacity:.7}.inkframe-v2-coach-session-actions{display:flex;flex-wrap:wrap;gap:6px}.inkframe-v2-coach-session-actions .primary{background:linear-gradient(145deg,#a6005c,#590051)}@media(max-width:760px){.inkframe-v2-coach-session-steps{grid-template-columns:repeat(2,minmax(0,1fr))}}';root.document.head.appendChild(style);coach.panel.appendChild(details);
    const summary=details.querySelector('summary'),stepsNode=details.querySelector('.inkframe-v2-coach-session-steps'),hint=details.querySelector('.inkframe-v2-coach-session-hint'),result=details.querySelector('.inkframe-v2-coach-session-result'),actions=Array.from(details.querySelectorAll('.inkframe-v2-coach-session-actions button'));let lastReferenceId=0;
    const store=()=>root.InkFrameBrushV2PresetUI&&root.InkFrameBrushV2PresetUI.store;
    function render(){const state=model.snapshot();summary.textContent=`Coach Session · ${state.completed}/4`;stepsNode.replaceChildren();for(const item of state.steps){const button=root.document.createElement('button');button.type='button';button.textContent=item.label;button.classList.toggle('active',item.id===state.selected);button.classList.toggle('complete',item.complete);button.addEventListener('click',()=>{model.select(item.id);render();});stepsNode.appendChild(button);}const active=state.steps.find(item=>item.id===state.selected);hint.textContent=active?active.hint:'';actions.slice(0,3).forEach(button=>button.disabled=!state.suggestion.valid);result.textContent=state.suggestion.valid?`${Math.round(state.suggestion.confidence*100)}% confidence · ${state.suggestion.reasons.join(' ')}`:'Complete all four exercises to create a session profile.';return state;}
    function save(){const suggestion=model.suggestion(),target=store();return suggestion.valid&&target?target.save('Coach · Complete Session',suggestion.tuning):null;}
    function compare(){const preset=save();if(!preset||!preview.selectCompare||!preview.selectCompare(`saved:${preset.id}`))return false;preview.setCompareEnabled&&preview.setCompareEnabled(true);replay.replay&&replay.replay();return true;}
    function apply(){const suggestion=model.suggestion();if(!suggestion.valid)return false;const ok=adapter.setTuning(suggestion.tuning);if(ok&&root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();return !!ok;}
    function captureLatest(){if(!details.open)return false;const reference=replay.recorder.snapshot();if(!reference||reference.id===lastReferenceId)return false;lastReferenceId=reference.id;const ok=model.capture(reference);render();return ok;}
    actions[0].addEventListener('click',compare);actions[1].addEventListener('click',apply);actions[2].addEventListener('click',save);actions[3].addEventListener('click',()=>{model.reset();lastReferenceId=0;render();});preview.card.addEventListener('pointerup',()=>root.setTimeout(captureLatest,0),true);render();
    root.InkFrameBrushCoachSession=Object.freeze({installed:true,details,model,render,captureLatest,compare,apply,save,projectCanvasWrites:0,undoWrites:0});return true;
  }
  const api={COACH_SESSION_STEPS:STEPS,createCoachSession,install};Object.assign(ns,api);root.InkFrameBrushCoachSession=api;if(root.document){const start=()=>{if(!install())root.setTimeout(start,16);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
