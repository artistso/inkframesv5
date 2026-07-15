// Offline Feedback Report and Tablet Command Deck postprocessor for generated Android assets.
// The checked-in browser fallback remains unchanged.

import {readFileSync} from 'node:fs';

const block=(...lines)=>lines.join('\n');
const metadata=JSON.parse(readFileSync(new URL('../web/metadata.json',import.meta.url),'utf8'));
const literal=value=>JSON.stringify(String(value==null?'':value));

export function injectFeedbackReport(html,replaceOnce){
  html=replaceOnce(html,
    '<script src="onion-skin-studio.js"></script>',
    block(
      '<script src="onion-skin-studio.js"></script>',
      '<script src="feedback-report.js"></script>',
      '<script src="tablet-command-deck.js"></script>'
    ),
    'Feedback Report and Tablet Command Deck runtime scripts');

  const onionEnvironment=block(
    '  window.InkFrameOnionStudioEnvironment=()=>Object.freeze({',
    '    project:projects[pi],snapshot:onionStudioSnapshot,apply:applyOnionStudioSettings,',
    '    canEdit:()=>{const adapter=window.InkFrameBrushV2Adapter;return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());},',
    `    notify:message=>flash(String(message||'Onion Skin Studio')),`,
    '  });'
  );

  const feedbackBridge=block(
    onionEnvironment,
    '',
    '  // Android-only Feedback Report bridge. It exposes bounded runtime facts',
    '  // and deliberately omits project names, layer names, artwork, and file data.',
    '  function feedbackReportSnapshot(){',
    '    const project=projects[pi]||null,frame=frames[cur]||null;',
    '    const adapter=window.InkFrameBrushV2Adapter,build=window.InkFrameBuild||{};',
    `    const reportHolds=(typeof holds!=='undefined'&&Array.isArray(holds))?holds.slice(0,120):[];`,
    '    return Object.freeze({',
    `      build:{version:${literal(metadata.version)},packageName:${literal(metadata.packageName)},variant:build.variant||'browser',diagnostics:!!build.diagnostics,defaultBrushEngine:build.defaultBrushEngine||'unknown'},`,
    '      projectSlot:pi+1,projectTotal:projects.length,',
    `      canvas:{width:W,height:H,shape:project&&project.canvasShape==='circle'?'circle':'square'},`,
    `      timeline:{frameCount:frames.length,currentFrame:cur+1,fps,holds:reportHolds,playing:!!playing,loopEnabled:typeof loopOn!=='undefined'&&!!loopOn,loopIn:typeof loopIn!=='undefined'?loopIn+1:0,loopOut:typeof loopOut!=='undefined'?loopOut+1:0},`,
    '      layers:{count:frame&&Array.isArray(frame.layers)?frame.layers.length:0,active:frame&&Number.isFinite(Number(frame.active))?Number(frame.active)+1:0},',
    `      brush:{id:brush&&brush.id||'unknown',engine:adapter&&typeof adapter.currentMode==='function'?adapter.currentMode():'original',stylusOnly:!!stylusOnly,barrelMode,activeStroke:!!drawing||!!(adapter&&adapter.isActive&&adapter.isActive())},`,
    '      onion:{enabled:!!onion,depth:onionDepth,pastOpacity:onionPastOpacity,futureOpacity:onionFutureOpacity,tint:onionTint,layerOnly:!!onionLayerOnly},',
    `      recoveryAvailable:!!window.InkFrameAutosave,recoveryLastSave:'not exposed',`,
    '    });',
    '  }',
    '  window.InkFrameFeedbackEnvironment=()=>Object.freeze({',
    '    project:projects[pi],snapshot:feedbackReportSnapshot,',
    '    canOpen:()=>{const adapter=window.InkFrameBrushV2Adapter;return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());},',
    `    notify:message=>flash(String(message||'Feedback Report')),`,
    '  });',
    '',
    '  // Tablet-first command bridge. Commands reuse the established radial nodes,',
    '  // Brush Lab, rail, and playback controls instead of duplicating editor state.',
    '  function tabletDeckCanInteract(){',
    '    const adapter=window.InkFrameBrushV2Adapter;',
    '    return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());',
    '  }',
    '  function tabletDeckNode(target){',
    '    if(target===\'Tools\')return nTools;',
    '    if(target===\'Frames\')return nFrames;',
    '    if(target===\'Layers\')return nLayers;',
    '    if(target===\'Actions\')return nAct;',
    '    return null;',
    '  }',
    '  function tabletDeckOpenMode(target){',
    '    if(!tabletDeckCanInteract())return false;',
    '    const node=tabletDeckNode(String(target||\'\'));if(!node)return false;',
    '    if(!node.classList.contains(\'open\')){',
    '      node.classList.add(\'open\');',
    '      requestAnimationFrame(()=>{if(typeof node._relayout===\'function\')node._relayout();if(typeof firePulse===\'function\')firePulse(node);});',
    '    }',
    '    if(typeof refreshCutsVisibility===\'function\')refreshCutsVisibility();',
    '    if(typeof startWires===\'function\')startWires();',
    '    return true;',
    '  }',
    '  function tabletDeckCollapseModes(){',
    '    if(!tabletDeckCanInteract())return false;',
    '    let changed=false;',
    '    for(const node of document.querySelectorAll(\'.node.open\')){node.classList.remove(\'open\');changed=true;}',
    '    if(typeof refreshCutsVisibility===\'function\')refreshCutsVisibility();',
    '    if(typeof startWires===\'function\')startWires();',
    '    return changed;',
    '  }',
    '  window.InkFrameTabletDeckEnvironment=()=>Object.freeze({',
    '    snapshot:feedbackReportSnapshot,canInteract:tabletDeckCanInteract,openMode:tabletDeckOpenMode,',
    '    openBrushLab:()=>{if(!tabletDeckCanInteract())return false;openBrushLab();return true;},',
    '    togglePlayback:()=>{if(!tabletDeckCanInteract())return false;kPlay.click();return true;},',
    '    collapseModes:tabletDeckCollapseModes,',
    `    notify:message=>flash(String(message||'Tablet Command Deck')),`,
    '  });'
  );
  html=replaceOnce(html,onionEnvironment,feedbackBridge,'Feedback Report and Tablet Command Deck environment bridge');

  for(const marker of [
    'feedback-report.js',
    'tablet-command-deck.js',
    'InkFrameFeedbackEnvironment',
    'InkFrameTabletDeckEnvironment',
    'feedbackReportSnapshot',
    'tabletDeckOpenMode',
    'openBrushLab()',
    'kPlay.click()',
    'projectSlot:pi+1',
    'recoveryLastSave',
  ]){
    if(!html.includes(marker))throw new Error(`Feedback/UI injection verification failed: ${marker}`);
  }
  if(html.indexOf('feedback-report.js')>html.indexOf('tablet-command-deck.js')){
    throw new Error('Tablet Command Deck must load after Feedback Report');
  }
  return html;
}
