// Onion Skin Studio postprocessor for generated Android assets.
// The checked-in browser fallback retains its established compact Actions controls.

const block=(...lines)=>lines.join('\n');

export function injectOnionSkinStudio(html,replaceOnce){
  html=replaceOnce(html,
    '<script src="creator-statement.js"></script>',
    block('<script src="creator-statement.js"></script>','<script src="onion-skin-studio.js"></script>'),
    'Onion Skin Studio runtime script');

  const stateNeedle=block(
    "  let onionBack='#880057', onionFront='#f7cac9', onionDepth=2;",
    '  let onionPastOpacity=0.34, onionFutureOpacity=0.24, onionTint=0.5, onionLayerOnly=false;',
    "  const tintC=document.createElement('canvas'); let tintG=null;"
  );
  const bridge=block(
    "  let onionBack='#880057', onionFront='#f7cac9', onionDepth=2;",
    '  let onionPastOpacity=0.34, onionFutureOpacity=0.24, onionTint=0.5, onionLayerOnly=false;',
    "  const tintC=document.createElement('canvas'); let tintG=null;",
    '',
    '  // Android-only Onion Skin Studio bridge. It exposes the established onion',
    '  // compositor settings without creating a second renderer or project schema.',
    "  const onionHex=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():null;",
    '  function onionStudioSnapshot(){',
    '    return Object.freeze({',
    '      project:projects[pi],enabled:!!onion,depth:onionDepth,',
    '      pastOpacity:onionPastOpacity,futureOpacity:onionFutureOpacity,tint:onionTint,',
    '      layerOnly:!!onionLayerOnly,pastColor:onionBack,futureColor:onionFront,',
    '    });',
    '  }',
    '  function syncOnionStudioControls(){',
    '    try{',
    "      kOnion.classList.toggle('on',onion);",
    "      onionDepthDial.querySelector('.glyph').textContent=String(onionDepth); if(onionDepthDial._upd)onionDepthDial._upd();",
    "      onionGhostDial.querySelector('.glyph').textContent=String(Math.round(onionPastOpacity*100)); if(onionGhostDial._upd)onionGhostDial._upd();",
    "      onionTintDial.querySelector('.glyph').textContent=String(Math.round(onionTint*100)); if(onionTintDial._upd)onionTintDial._upd();",
    "      kOnionLayer.classList.toggle('on',onionLayerOnly);",
    "      if(nAct&&nAct._kids)for(const kid of nAct._kids.querySelectorAll('.kid')){",
    "        const sub=kid.querySelector('.sub'),input=kid.querySelector('input[type=color]'); if(!sub||!input)continue;",
    "        if(sub.textContent==='Past')input.value=onionBack; else if(sub.textContent==='Future')input.value=onionFront;",
    '      }',
    '    }catch(_){}',
    '  }',
    '  function applyOnionStudioSettings(value){',
    '    const adapter=window.InkFrameBrushV2Adapter;',
    '    if(drawing||(adapter&&adapter.isActive&&adapter.isActive()))return false;',
    '    const input=value&&typeof value===\'object\'?value:{};',
    "    if(typeof input.enabled==='boolean')onion=input.enabled;",
    '    if(Number.isFinite(Number(input.depth)))onionDepth=Math.max(0,Math.min(8,Math.round(Number(input.depth))));',
    '    if(Number.isFinite(Number(input.pastOpacity)))onionPastOpacity=Math.max(.02,Math.min(.85,Number(input.pastOpacity)));',
    '    if(Number.isFinite(Number(input.futureOpacity)))onionFutureOpacity=Math.max(.02,Math.min(.85,Number(input.futureOpacity)));',
    '    if(Number.isFinite(Number(input.tint)))onionTint=Math.max(0,Math.min(1,Number(input.tint)));',
    "    if(typeof input.layerOnly==='boolean')onionLayerOnly=input.layerOnly;",
    '    const past=onionHex(input.pastColor),future=onionHex(input.futureColor); if(past)onionBack=past;if(future)onionFront=future;',
    '    syncOnionStudioControls();savePrefs();render();',
    "    window.dispatchEvent(new CustomEvent('inkframe:onion-settings',{detail:onionStudioSnapshot()}));",
    '    return onionStudioSnapshot();',
    '  }',
    '  window.InkFrameOnionStudioEnvironment=()=>Object.freeze({',
    '    project:projects[pi],snapshot:onionStudioSnapshot,apply:applyOnionStudioSettings,',
    '    canEdit:()=>{const adapter=window.InkFrameBrushV2Adapter;return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());},',
    "    notify:message=>flash(String(message||'Onion Skin Studio')),",
    '  });'
  );
  html=replaceOnce(html,stateNeedle,bridge,'Onion Skin Studio environment bridge');

  for(const marker of [
    'onion-skin-studio.js',
    'InkFrameOnionStudioEnvironment',
    'applyOnionStudioSettings',
    'syncOnionStudioControls',
    "inkframe:onion-settings",
  ]){
    if(!html.includes(marker))throw new Error(`Onion Skin Studio injection verification failed: ${marker}`);
  }
  return html;
}
