// InkFrame Brush Engine V2 — Ghost Trail controls
'use strict';
(function(root){
  const MODE_ID='inkframe-v2-ghost-mode';
  const INTENSITY_ID='inkframe-v2-ghost-intensity';
  const DURATION_ID='inkframe-v2-ghost-duration';
  const WIDTH_ID='inkframe-v2-ghost-width';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
  const adapter=()=>root.InkFrameBrushV2Adapter||null;
  const normalizeMode=value=>value==='comet'||value==='echo'?value:'off';

  function makeRow(labelText,control,output){
    const row=root.document.createElement('label');
    row.className='inkframe-v2-tune-row';
    const label=root.document.createElement('span');
    label.textContent=labelText;
    row.append(label,control,output);
    return row;
  }

  function makeRange(id,min,max,step){
    const input=root.document.createElement('input');
    input.id=id; input.type='range'; input.min=String(min); input.max=String(max); input.step=String(step);
    const output=root.document.createElement('output');
    return {input,output};
  }

  function sync(nodes){
    const api=adapter();
    if(!api||!api.currentTuning)return false;
    const tuning=api.currentTuning()||{};
    const mode=normalizeMode(tuning.ghostMode);
    const active=api.isActive&&api.isActive();
    nodes.mode.value=mode;
    nodes.mode.disabled=!!active;
    nodes.intensity.input.value=String(clamp(tuning.ghostIntensity??65,0,100));
    nodes.duration.input.value=String(clamp(tuning.ghostDurationMs??380,80,1200));
    nodes.width.input.value=String(clamp(tuning.ghostWidthPercent??130,50,250));
    const disabled=!!active||mode==='off';
    nodes.intensity.input.disabled=disabled;
    nodes.duration.input.disabled=disabled;
    nodes.width.input.disabled=disabled;
    nodes.intensity.output.textContent=Math.round(nodes.intensity.input.value)+'%';
    nodes.duration.output.textContent=Math.round(nodes.duration.input.value)+' ms';
    nodes.width.output.textContent=Math.round(nodes.width.input.value)+'%';
    return true;
  }

  function install(){
    if(!root.document)return false;
    const api=adapter();
    const panel=root.document.getElementById('inkframe-v2-tuning');
    if(!api||!panel)return false;
    if(root.document.getElementById(MODE_ID))return true;

    const mode=root.document.createElement('select');
    mode.id=MODE_ID;
    for(const pair of [['off','Off'],['comet','Comet'],['echo','Echo']]){
      const option=root.document.createElement('option'); option.value=pair[0]; option.textContent=pair[1]; mode.appendChild(option);
    }
    const modeOutput=root.document.createElement('output'); modeOutput.textContent='visual';
    const intensity=makeRange(INTENSITY_ID,0,100,1);
    const duration=makeRange(DURATION_ID,80,1200,20);
    const width=makeRange(WIDTH_ID,50,250,5);
    const rows=[
      makeRow('Ghost trail',mode,modeOutput),
      makeRow('Trail intensity',intensity.input,intensity.output),
      makeRow('Trail length',duration.input,duration.output),
      makeRow('Trail width',width.input,width.output),
    ];
    for(let index=rows.length-1;index>=0;index--)panel.insertBefore(rows[index],panel.children[1]||null);
    const nodes={mode,intensity,duration,width};
    mode.addEventListener('change',()=>{api.setTuning({ghostMode:normalizeMode(mode.value)});sync(nodes);});
    intensity.input.addEventListener('input',()=>{api.setTuning({ghostIntensity:clamp(intensity.input.value,0,100)});sync(nodes);});
    duration.input.addEventListener('input',()=>{api.setTuning({ghostDurationMs:clamp(duration.input.value,80,1200)});sync(nodes);});
    width.input.addEventListener('input',()=>{api.setTuning({ghostWidthPercent:clamp(width.input.value,50,250)});sync(nodes);});
    const preset=panel.querySelector('.inkframe-v2-tune-head select');
    if(preset)preset.addEventListener('change',()=>root.setTimeout(()=>sync(nodes),0));
    sync(nodes);
    return true;
  }

  const api={MODE_ID,INTENSITY_ID,DURATION_ID,WIDTH_ID,normalizeMode,sync,install};
  root.InkFrameBrushV2GhostUI=api;
  if(root.document){
    const start=()=>{if(!install())root.setTimeout(install,0);};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
