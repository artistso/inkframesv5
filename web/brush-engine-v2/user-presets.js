// InkFrame Brush Engine V2 — bounded custom preset library
'use strict';

(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const STORAGE_KEY='inkframe.brushLab.userPresets.v1';
  const SCHEMA=1;
  const MAX_PRESETS=24;
  const MAX_PINNED=4;
  const MAX_NAME=32;

  const clone=value=>JSON.parse(JSON.stringify(value));
  const cleanName=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_NAME);
  const cleanId=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48);

  function tuningPayload(value){
    const normalized=ns.normalizeTuning?ns.normalizeTuning(value||{}):Object.assign({},value||{});
    return Object.assign({},normalized,{preset:'custom'});
  }

  function tuningSignature(value){
    const tuning=tuningPayload(value);
    const ordered={};
    for(const key of Object.keys(tuning).sort())ordered[key]=tuning[key];
    return JSON.stringify(ordered);
  }

  function sanitizePreset(value,index,now){
    const input=value&&typeof value==='object'?value:{};
    const name=cleanName(input.name)||`Preset ${index+1}`;
    const id=cleanId(input.id)||`preset-${index+1}`;
    const createdAt=Number.isFinite(Number(input.createdAt))?Number(input.createdAt):now;
    const updatedAt=Number.isFinite(Number(input.updatedAt))?Number(input.updatedAt):createdAt;
    return {id,name,createdAt,updatedAt,tuning:tuningPayload(input.tuning)};
  }

  function sanitizeLibrary(value,nowValue){
    const now=Number.isFinite(Number(nowValue))?Number(nowValue):Date.now();
    const input=value&&typeof value==='object'?value:{};
    const source=Array.isArray(input.presets)?input.presets:[];
    const seenIds=new Set();
    const seenNames=new Set();
    const presets=[];
    for(let index=0;index<source.length&&presets.length<MAX_PRESETS;index++){
      const item=sanitizePreset(source[index],index,now);
      let id=item.id;
      let suffix=2;
      while(seenIds.has(id))id=`${item.id}-${suffix++}`.slice(0,48);
      let name=item.name;
      suffix=2;
      while(seenNames.has(name.toLowerCase()))name=`${item.name} ${suffix++}`.slice(0,MAX_NAME);
      item.id=id;item.name=name;
      seenIds.add(id);seenNames.add(name.toLowerCase());presets.push(item);
    }
    const validIds=new Set(presets.map(item=>item.id));
    const pinned=[];
    for(const raw of Array.isArray(input.pinned)?input.pinned:[]){
      const id=cleanId(raw);
      if(validIds.has(id)&&!pinned.includes(id)&&pinned.length<MAX_PINNED)pinned.push(id);
    }
    return {schema:SCHEMA,presets,pinned};
  }

  function createUserPresetStore(storage,options){
    const opts=options||{};
    const now=typeof opts.now==='function'?opts.now:()=>Date.now();
    let sequence=0;
    const makeId=typeof opts.makeId==='function'?opts.makeId:()=>`preset-${now()}-${++sequence}`;
    let state=sanitizeLibrary({},now());
    const listeners=new Set();
    try{
      const raw=storage&&storage.getItem(STORAGE_KEY);
      if(raw)state=sanitizeLibrary(JSON.parse(raw),now());
    }catch(_){}

    const persist=()=>{try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}};
    const emit=()=>{for(const listener of listeners){try{listener(snapshot());}catch(_){}}};
    const commit=next=>{state=sanitizeLibrary(next,now());persist();emit();return snapshot();};
    const snapshot=()=>clone(state);
    const find=id=>state.presets.find(item=>item.id===cleanId(id))||null;

    function save(name,tuning,pin){
      const safeName=cleanName(name);
      if(!safeName)throw new Error('Preset name is required');
      const timestamp=now();
      const existing=state.presets.find(item=>item.name.toLowerCase()===safeName.toLowerCase());
      let id;
      let presets;
      if(existing){
        id=existing.id;
        presets=state.presets.map(item=>item.id===id?Object.assign({},item,{name:safeName,updatedAt:timestamp,tuning:tuningPayload(tuning)}):item);
      }else{
        if(state.presets.length>=MAX_PRESETS)throw new Error(`Maximum ${MAX_PRESETS} presets reached`);
        id=cleanId(makeId())||`preset-${timestamp}`;
        presets=state.presets.concat({id,name:safeName,createdAt:timestamp,updatedAt:timestamp,tuning:tuningPayload(tuning)});
      }
      const pinned=state.pinned.slice();
      if(pin&&!pinned.includes(id)){
        if(pinned.length>=MAX_PINNED)pinned.shift();
        pinned.push(id);
      }
      commit({schema:SCHEMA,presets,pinned});
      return clone(find(id));
    }

    function remove(id){
      const key=cleanId(id);
      if(!find(key))return false;
      commit({schema:SCHEMA,presets:state.presets.filter(item=>item.id!==key),pinned:state.pinned.filter(item=>item!==key)});
      return true;
    }

    function rename(id,name){
      const key=cleanId(id);const safeName=cleanName(name);
      if(!safeName||!find(key))return false;
      if(state.presets.some(item=>item.id!==key&&item.name.toLowerCase()===safeName.toLowerCase()))return false;
      commit({schema:SCHEMA,presets:state.presets.map(item=>item.id===key?Object.assign({},item,{name:safeName,updatedAt:now()}):item),pinned:state.pinned});
      return true;
    }

    function togglePin(id){
      const key=cleanId(id);if(!find(key))return false;
      let pinned=state.pinned.slice();
      if(pinned.includes(key))pinned=pinned.filter(item=>item!==key);
      else{if(pinned.length>=MAX_PINNED)pinned.shift();pinned.push(key);}
      commit({schema:SCHEMA,presets:state.presets,pinned});
      return pinned.includes(key);
    }

    function replaceLibrary(value){return commit(value);}
    function importJson(text){return replaceLibrary(JSON.parse(String(text||'')));}
    function exportJson(){return JSON.stringify(snapshot(),null,2);}
    function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener);}

    return {snapshot,find:id=>{const item=find(id);return item?clone(item):null;},save,remove,rename,togglePin,replaceLibrary,importJson,exportJson,subscribe};
  }

  Object.assign(ns,{USER_PRESET_STORAGE_KEY:STORAGE_KEY,USER_PRESET_SCHEMA:SCHEMA,MAX_USER_PRESETS:MAX_PRESETS,MAX_PINNED_PRESETS:MAX_PINNED,cleanUserPresetName:cleanName,tuningPresetSignature:tuningSignature,sanitizeUserPresetLibrary:sanitizeLibrary,createUserPresetStore});
  if(typeof module!=='undefined'&&module.exports)module.exports={STORAGE_KEY,SCHEMA,MAX_PRESETS,MAX_PINNED,MAX_NAME,cleanName,tuningPayload,tuningSignature,sanitizeLibrary,createUserPresetStore};
})(typeof globalThis!=='undefined'?globalThis:this);
