'use strict';
(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const adapter=root.InkFrameBrushV2Adapter;
  if(!adapter||!ns.createBrushEngine||!ns.createGhostTrailSession||adapter.__ghostTrailInstalled)return;
  const createEngine=ns.createBrushEngine;
  const begin=adapter.begin,move=adapter.move,end=adapter.end;
  let session=null,pending=null,emitted=0,started=0,finished=0,aborted=0;

  function dispose(value,kind,clear){
    if(!value)return false;
    try{if(clear&&value.clear)value.clear();if(value.end)value.end();}catch(_){}
    if(kind==='aborted')aborted++;else finished++;
    return true;
  }
  function finishSession(kind,clear){
    const value=session;session=null;
    return dispose(value,kind,clear);
  }
  function finishPending(kind,clear){
    const value=pending;pending=null;
    return dispose(value,kind,clear);
  }
  function finish(kind,clear){
    return session?finishSession(kind,clear):finishPending(kind,clear);
  }

  ns.createBrushEngine=function(options){
    const input=options||{},upstream=input.onDab;
    return createEngine(Object.assign({},input,{onDab(dab){
      if(typeof upstream==='function')upstream(dab);
      const active=session||pending;
      if(active&&active.push)emitted+=active.push([dab]);
    }}));
  };
  ns.createBrushEngine.__ghostTrailWrapped=true;
  ns.createBrushEngine.__original=createEngine;

  adapter.begin=function(event,env){
    const activeBefore=!!(adapter.isActive&&adapter.isActive());
    if(!activeBefore)finishSession('aborted',true);
    finishPending('aborted',true);

    const tuning=adapter.currentTuning?adapter.currentTuning():{};
    const options=ns.tuningGhostOptions?ns.tuningGhostOptions(tuning):{mode:'off'};
    pending=ns.createGhostTrailSession(env&&env.canvas,options,{color:env&&env.color,brushId:env&&env.brushId});
    started++;

    const handled=begin.call(adapter,event,env);
    const activeAfter=!!(handled&&adapter.isActive&&adapter.isActive());
    if(activeAfter){
      // A session-continuity wrapper may have ended the old physical stroke
      // during begin(). Its end wrapper must consume only `session`, leaving the
      // new `pending` trail available for the replacement stroke.
      if(session)finishSession('aborted',true);
      session=pending;
      pending=null;
    }else{
      finishPending('aborted',true);
      if(session&&adapter.isActive&&!adapter.isActive())finishSession('aborted',true);
    }
    return handled;
  };

  adapter.move=function(event){
    const handled=move.call(adapter,event);
    if(session&&adapter.isActive&&!adapter.isActive())finishSession('aborted',true);
    return handled;
  };

  adapter.end=function(event){
    const handled=end.call(adapter,event);
    finish('finished',false);
    return handled;
  };

  adapter.ghostTrailStats=()=>Object.freeze({
    installed:true,
    active:!!(session||pending),
    emittedDabs:emitted,
    sessionsStarted:started,
    sessionsFinished:finished,
    sessionsAborted:aborted,
  });
  adapter.__ghostTrailInstalled=true;
  if(typeof module!=='undefined'&&module.exports)module.exports={stats:adapter.ghostTrailStats,finish};
})(typeof globalThis!=='undefined'?globalThis:this);
