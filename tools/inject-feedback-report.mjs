// Offline Feedback Report, Tablet Command Deck, and Timeline Workspace postprocessor.
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
      '<script src="tablet-command-deck.js"></script>',
      '<script src="timeline-workspace.js"></script>'
    ),
    'Feedback Report, Tablet Command Deck, and Timeline Workspace runtime scripts');

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
    '  // Tablet-first command bridge. Commands reuse established controls and',
    '  // timeline functions instead of implementing a second editor state model.',
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
    '  function tabletTimelineSnapshot(){',
    '    const selected=selectedSorted().map(i=>i+1);',
    '    const targets=selectedFrames.size?selectedSorted():[cur];',
    '    const holdValues=[...new Set(targets.map(i=>hOf(i)))];',
    '    return Object.freeze({',
    '      frameCount:frames.length,currentFrame:cur+1,selected,targetCount:targets.length,',
    '      hold:holdValues[0]||1,mixedHold:holdValues.length>1,maxFrames:MAX_FRAMES,',
    '      remainingFrames:frameRoom(),loopEnabled:!!loopOn,canInteract:tabletDeckCanInteract(),',
    '    });',
    '  }',
    '  function tabletTimelineSetHold(value){',
    '    const next=Math.max(1,Math.min(8,Math.round(Number(value)||1)));',
    '    const targets=selectedOrCurrent();targets.forEach(i=>holds[i]=next);',
    '    refreshFrames();buildRail();flash(`Hold ${next} · ${targets.length} frame${targets.length===1?\'\':\'s\'}`);',
    '  }',
    '  function tabletTimelineCommand(name,value){',
    '    if(!tabletDeckCanInteract())return false;',
    '    const command=String(name||\'\');let handled=true;',
    '    if(command===\'hold\')tabletTimelineSetHold(value);',
    '    else if(command===\'holdDelta\')adjustHolds(Number(value)<0?-1:1);',
    '    else if(command===\'duplicate\')duplicateFrameSequence();',
    '    else if(command===\'delete\')deleteFrameSelection();',
    '    else if(command===\'selectAll\'){selectedFrames.clear();frames.forEach((_,i)=>selectedFrames.add(i));refreshFrames();flash(`Selected ${frames.length} frames`);}',
    '    else if(command===\'clearSelection\')clearFrameSelection();',
    '    else if(command===\'reverse\')reverseFrameSelection();',
    '    else if(command===\'pingPong\')pingPongSelection();',
    '    else handled=false;',
    '    if(handled)window.dispatchEvent(new Event(\'inkframe:timeline\'));',
    '    return handled;',
    '  }',
    '  window.InkFrameTabletDeckEnvironment=()=>Object.freeze({',
    '    snapshot:feedbackReportSnapshot,canInteract:tabletDeckCanInteract,openMode:tabletDeckOpenMode,',
    '    openBrushLab:()=>{if(!tabletDeckCanInteract())return false;openBrushLab();return true;},',
    '    togglePlayback:()=>{if(!tabletDeckCanInteract())return false;kPlay.click();return true;},',
    '    collapseModes:tabletDeckCollapseModes,timelineSnapshot:tabletTimelineSnapshot,timelineCommand:tabletTimelineCommand,',
    `    notify:message=>flash(String(message||'Tablet Command Deck')),`,
    '  });'
  );
  html=replaceOnce(html,onionEnvironment,feedbackBridge,'Feedback Report, Tablet Command Deck, and Timeline Workspace environment bridge');

  for(const marker of [
    'feedback-report.js',
    'tablet-command-deck.js',
    'timeline-workspace.js',
    'InkFrameFeedbackEnvironment',
    'InkFrameTabletDeckEnvironment',
    'feedbackReportSnapshot',
    'tabletDeckOpenMode',
    'tabletTimelineSnapshot',
    'tabletTimelineCommand',
    'duplicateFrameSequence()',
    'pingPongSelection()',
    'openBrushLab()',
    'kPlay.click()',
    'projectSlot:pi+1',
    'recoveryLastSave',
  ]){
    if(!html.includes(marker))throw new Error(`Feedback/UI injection verification failed: ${marker}`);
  }
  if(html.indexOf('feedback-report.js')>html.indexOf('tablet-command-deck.js'))throw new Error('Tablet Command Deck must load after Feedback Report');
  if(html.indexOf('tablet-command-deck.js')>html.indexOf('timeline-workspace.js'))throw new Error('Timeline Workspace must load after Tablet Command Deck');
  return html;
}
