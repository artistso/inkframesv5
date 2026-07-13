// InkFrame Brush Engine V2 — custom preset Quick Access UI
'use strict';

(function(root){
  const ns=root.InkFrameBrushV2||(root.InkFrameBrushV2={});
  const api=()=>root.InkFrameBrushV2Adapter||null;
  const safeStorage=()=>{try{return root.localStorage||null;}catch(_){return null;}};
  let installed=false;
  let store=null;

  function install(){
    if(installed||!root.document||!ns.createUserPresetStore)return installed;
    const adapter=api();
    const lab=root.document.getElementById('inkframe-v2-tuning');
    const stabilizer=lab&&lab.querySelector('[data-lab-section="stabilizer"] .inkframe-v2-lab-primary');
    if(!adapter||!lab||!stabilizer)return false;
    installed=true;
    store=ns.createUserPresetStore(safeStorage());

    const style=root.document.createElement('style');
    style.textContent=`
      .inkframe-v2-user-presets{margin:0 0 16px;padding:13px;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:rgba(255,255,255,.035)}
      .inkframe-v2-user-presets-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .inkframe-v2-user-presets-head strong{font-size:13px;letter-spacing:.025em}
      .inkframe-v2-user-presets-active{font:650 10px/1 system-ui,sans-serif;opacity:.68;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .inkframe-v2-preset-quick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}
      .inkframe-v2-preset-quick button{min-height:46px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.055);color:#fff;padding:8px;font:720 10px/1.15 system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis}
      .inkframe-v2-preset-quick button.active{background:linear-gradient(145deg,#bb0037,#69004e);border-color:#ffd0dc}
      .inkframe-v2-preset-quick button:disabled{opacity:.34}
      .inkframe-v2-preset-save{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .inkframe-v2-preset-save input{min-height:42px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:#2b1325;color:#fff;padding:7px 10px;font:650 11px/1 system-ui,sans-serif}
      .inkframe-v2-preset-save button,.inkframe-v2-preset-manage button{min-height:42px;border:1px solid rgba(255,255,255,.17);border-radius:11px;background:rgba(255,255,255,.075);color:#fff;padding:8px 11px;font:720 10px/1.1 system-ui,sans-serif}
      .inkframe-v2-preset-library{margin-top:10px;border:1px solid rgba(255,255,255,.09);border-radius:12px;overflow:hidden}
      .inkframe-v2-preset-library>summary{list-style:none;cursor:pointer;min-height:44px;padding:12px 13px;display:flex;align-items:center;justify-content:space-between;font:730 11px/1 system-ui,sans-serif}
      .inkframe-v2-preset-library>summary::-webkit-details-marker{display:none}
      .inkframe-v2-preset-library>summary::after{content:'+';font-size:18px;opacity:.7}
      .inkframe-v2-preset-library[open]>summary::after{content:'−'}
      .inkframe-v2-preset-manage{padding:0 8px 8px}
      .inkframe-v2-preset-item{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,auto);gap:6px;align-items:center;padding:7px;border-radius:10px;background:rgba(255,255,255,.035)}
      .inkframe-v2-preset-item+.inkframe-v2-preset-item{margin-top:6px}
      .inkframe-v2-preset-item-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 11px/1.2 system-ui,sans-serif}
      .inkframe-v2-preset-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}
      .inkframe-v2-preset-empty{padding:12px;text-align:center;opacity:.55;font:600 10px/1.4 system-ui,sans-serif}
      @media(max-width:760px){.inkframe-v2-preset-quick{grid-template-columns:repeat(2,minmax(0,1fr))}.inkframe-v2-preset-item{grid-template-columns:minmax(0,1fr) repeat(2,auto)}.inkframe-v2-preset-item button:last-child{grid-column:2/4}}
    `;
    root.document.head.appendChild(style);

    const card=root.document.createElement('section');card.className='inkframe-v2-user-presets';
    const head=root.document.createElement('div');head.className='inkframe-v2-user-presets-head';
    const title=root.document.createElement('strong');title.textContent='My Presets';
    const active=root.document.createElement('span');active.className='inkframe-v2-user-presets-active';active.textContent='No saved preset active';
    head.append(title,active);
    const quick=root.document.createElement('div');quick.className='inkframe-v2-preset-quick';
    const save=root.document.createElement('div');save.className='inkframe-v2-preset-save';
    const name=root.document.createElement('input');name.type='text';name.maxLength=32;name.placeholder='Preset name';name.autocomplete='off';
    const saveButton=root.document.createElement('button');saveButton.type='button';saveButton.textContent='Save Current';
    save.append(name,saveButton);
    const library=root.document.createElement('details');library.className='inkframe-v2-preset-library';
    const librarySummary=root.document.createElement('summary');librarySummary.textContent='Manage presets';
    const manage=root.document.createElement('div');manage.className='inkframe-v2-preset-manage';library.append(librarySummary,manage);
    card.append(head,quick,save,library);stabilizer.prepend(card);

    const inputFile=root.document.createElement('input');inputFile.type='file';inputFile.accept='.json,application/json';inputFile.hidden=true;card.appendChild(inputFile);

    const applyPreset=preset=>{
      if(!preset||adapter.isActive&&adapter.isActive())return false;
      const result=adapter.setTuning(preset.tuning);
      if(result){render();if(root.InkFrameBrushV2LabUI&&root.InkFrameBrushV2LabUI.updateSummaries)root.InkFrameBrushV2LabUI.updateSummaries();}
      return result;
    };

    function activePreset(state){
      const signature=ns.tuningPresetSignature(adapter.currentTuning());
      return state.presets.find(item=>ns.tuningPresetSignature(item.tuning)===signature)||null;
    }

    function button(label,handler,titleText){
      const node=root.document.createElement('button');node.type='button';node.textContent=label;if(titleText)node.title=titleText;node.addEventListener('click',handler);return node;
    }

    function render(){
      const state=store.snapshot();const current=activePreset(state);
      active.textContent=current?`Active · ${current.name}`:'No saved preset active';
      quick.replaceChildren();
      for(let index=0;index<4;index++){
        const id=state.pinned[index];const preset=id&&state.presets.find(item=>item.id===id);
        const node=button(preset?preset.name:'Empty slot',()=>preset&&applyPreset(preset),preset?`Apply ${preset.name}`:'Pin a preset from Manage presets');
        node.disabled=!preset;node.classList.toggle('active',!!current&&!!preset&&current.id===preset.id);quick.appendChild(node);
      }
      manage.replaceChildren();
      if(!state.presets.length){const empty=root.document.createElement('div');empty.className='inkframe-v2-preset-empty';empty.textContent='Save the current brush setup to create your first preset.';manage.appendChild(empty);}
      for(const preset of state.presets){
        const row=root.document.createElement('div');row.className='inkframe-v2-preset-item';
        const label=root.document.createElement('span');label.className='inkframe-v2-preset-item-name';label.textContent=preset.name;label.title=preset.name;
        const apply=button('Apply',()=>applyPreset(preset));
        const pin=button(state.pinned.includes(preset.id)?'Unpin':'Pin',()=>{store.togglePin(preset.id);});
        const more=button('Edit',()=>{
          const next=typeof root.prompt==='function'?root.prompt('Rename preset',preset.name):preset.name;
          if(next!=null&&!store.rename(preset.id,next)&&typeof root.alert==='function')root.alert('That preset name is unavailable.');
        });
        const remove=button('Delete',()=>{if(typeof root.confirm!=='function'||root.confirm(`Delete “${preset.name}”?`))store.remove(preset.id);});
        row.append(label,apply,pin,more,remove);manage.appendChild(row);
      }
      const tools=root.document.createElement('div');tools.className='inkframe-v2-preset-tools';
      tools.append(
        button('Import presets',()=>inputFile.click()),
        button('Export presets',()=>{
          if(typeof root.Blob!=='function')return;
          const blob=new root.Blob([store.exportJson()],{type:'application/json'});const url=root.URL.createObjectURL(blob);const anchor=root.document.createElement('a');anchor.href=url;anchor.download='inkframe-brush-presets.json';anchor.style.display='none';root.document.body.appendChild(anchor);anchor.click();anchor.remove();root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);
        })
      );
      manage.appendChild(tools);
    }

    saveButton.addEventListener('click',()=>{
      try{const preset=store.save(name.value,adapter.currentTuning(),true);name.value='';render();applyPreset(preset);}catch(error){if(typeof root.alert==='function')root.alert(String(error&&error.message||error));}
    });
    name.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveButton.click();}});
    inputFile.addEventListener('change',()=>{
      const file=inputFile.files&&inputFile.files[0];inputFile.value='';if(!file||typeof root.FileReader!=='function')return;
      const reader=new root.FileReader();reader.onload=()=>{try{store.importJson(String(reader.result||''));}catch(error){if(typeof root.alert==='function')root.alert(`Preset import failed: ${error&&error.message||error}`);}};reader.readAsText(file);
    });
    store.subscribe(render);
    lab.addEventListener('input',()=>root.setTimeout(render,0),true);
    lab.addEventListener('change',()=>root.setTimeout(render,0),true);
    lab.addEventListener('click',()=>root.setTimeout(render,0),true);
    render();

    root.InkFrameBrushV2PresetUI={installed:true,store,render,applyPreset};
    return true;
  }

  const publicApi={install,get store(){return store;}};
  root.InkFrameBrushV2PresetUI=publicApi;
  if(root.document){const start=()=>{if(!install())root.setTimeout(start,0);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
  if(typeof module!=='undefined'&&module.exports)module.exports=publicApi;
})(typeof globalThis!=='undefined'?globalThis:this);
