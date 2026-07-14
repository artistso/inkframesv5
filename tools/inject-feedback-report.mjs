// Offline Feedback Report postprocessor for generated Android assets.
// The checked-in browser fallback remains unchanged.

import {readFileSync} from 'node:fs';

const block=(...lines)=>lines.join('\n');
const metadata=JSON.parse(readFileSync(new URL('../web/metadata.json',import.meta.url),'utf8'));
const literal=value=>JSON.stringify(String(value==null?'':value));

export function injectFeedbackReport(html,replaceOnce){
  html=replaceOnce(html,
    '<script src="onion-skin-studio.js"></script>',
    block('<script src="onion-skin-studio.js"></script>','<script src="feedback-report.js"></script>'),
    'Feedback Report runtime script');

  const onionEnvironment=block(
    '  window.InkFrameOnionStudioEnvironment=()=>Object.freeze({',
    '    project:projects[pi],snapshot:onionStudioSnapshot,apply:applyOnionStudioSettings,',
    '    canEdit:()=>{const adapter=window.InkFrameBrushV2Adapter;return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());},',
    "    notify:message=>flash(String(message||'Onion Skin Studio')),",
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
    "    const reportHolds=(typeof holds!=='undefined'&&Array.isArray(holds))?holds.slice(0,120):[];",
    '    return Object.freeze({',
    `      build:{version:${literal(metadata.version)},packageName:${literal(metadata.packageName)},variant:build.variant||'browser',diagnostics:!!build.diagnostics,defaultBrushEngine:build.defaultBrushEngine||'unknown'},`,
    '      projectSlot:pi+1,projectTotal:projects.length,',
    "      canvas:{width:W,height:H,shape:project&&project.canvasShape==='circle'?'circle':'square'},",
    "      timeline:{frameCount:frames.length,currentFrame:cur+1,fps,holds:reportHolds,playing:!!playing,loopEnabled:typeof loopOn!=='undefined'&&!!loopOn,loopIn:typeof loopIn!=='undefined'?loopIn+1:0,loopOut:typeof loopOut!=='undefined'?loopOut+1:0},",
    '      layers:{count:frame&&Array.isArray(frame.layers)?frame.layers.length:0,active:frame&&Number.isFinite(Number(frame.active))?Number(frame.active)+1:0},',
    "      brush:{id:brush&&brush.id||'unknown',engine:adapter&&typeof adapter.currentMode==='function'?adapter.currentMode():'original',stylusOnly:!!stylusOnly,barrelMode,activeStroke:!!drawing||!!(adapter&&adapter.isActive&&adapter.isActive())},",
    '      onion:{enabled:!!onion,depth:onionDepth,pastOpacity:onionPastOpacity,futureOpacity:onionFutureOpacity,tint:onionTint,layerOnly:!!onionLayerOnly},',
    "      recoveryAvailable:!!window.InkFrameAutosave,recoveryLastSave:'not exposed',",
    '    });',
    '  }',
    '  window.InkFrameFeedbackEnvironment=()=>Object.freeze({',
    '    project:projects[pi],snapshot:feedbackReportSnapshot,',
    '    canOpen:()=>{const adapter=window.InkFrameBrushV2Adapter;return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());},',
    "    notify:message=>flash(String(message||'Feedback Report')),",
    '  });'
  );
  html=replaceOnce(html,onionEnvironment,feedbackBridge,'Feedback Report environment bridge');

  for(const marker of [
    'feedback-report.js',
    'InkFrameFeedbackEnvironment',
    'feedbackReportSnapshot',
    'projectSlot:pi+1',
    'recoveryLastSave',
  ]){
    if(!html.includes(marker))throw new Error(`Feedback Report injection verification failed: ${marker}`);
  }
  return html;
}
