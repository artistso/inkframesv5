// InkFrame Brush Engine V2 — generated release asset policy
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const temp = mkdtempSync(resolve(tmpdir(), 'inkframe-v2-release-'));
const generated = resolve(temp, 'index.html');

try {
  execFileSync(process.execPath, [
    resolve(root, 'tools/inject-brush-v2-index.mjs'),
    resolve(root, 'web/index.html'),
    generated,
    '--variant=release',
    '--diagnostics=false',
    '--default-engine=v2',
  ], { cwd:root, stdio:'pipe' });

  const html = readFileSync(generated, 'utf8');
  const compareSource=readFileSync(resolve(root,'web/brush-engine-v2/preview-compare.js'),'utf8');
  const radialSource=readFileSync(resolve(root,'web/radial-timeline.js'),'utf8');
  assert.ok(html.includes('INKFRAME_BRUSH_V2_RUNTIME'));
  assert.ok(html.includes('"variant":"release"'));
  assert.ok(html.includes('"diagnostics":false'));
  assert.ok(html.includes('"traceTools":false'));
  assert.ok(html.includes('"defaultBrushEngine":"v2"'));
  assert.ok(html.includes('<script src="canvas-shape.js"></script>'),'release index must load Circular Canvas');
  assert.ok(existsSync(resolve(root,'web/canvas-shape.js')),'missing Circular Canvas runtime');
  assert.ok(html.includes('InkFrameCanvasShapeEnvironment'),'release index must expose the per-project shape bridge');
  assert.ok(html.includes('InkFrameCanvasShape.acceptsPointerDown'),'release index must reject circle-corner starts');
  assert.ok(html.includes('InkFrameCanvasShape.boundaryEvent'),'release index must finish strokes at the circle rim');
  assert.ok(html.includes('InkFrameCanvasShape.maskComposite'),'release index must mask frame composites');
  assert.ok(html.includes("canvasShape:P.canvasShape==='circle'?'circle':'square'"),'release archives must preserve canvas shape');
  assert.ok(html.includes('<script src="radial-timeline.js"></script>'),'release index must load Radial Timeline');
  assert.ok(existsSync(resolve(root,'web/radial-timeline.js')),'missing Radial Timeline runtime');
  assert.ok(existsSync(resolve(root,'tools/inject-radial-timeline.mjs')),'missing Radial Timeline injector');
  assert.ok(html.includes('InkFrameRadialTimeline.render(board'),'release index must delegate frame-board rendering');
  assert.ok(html.includes('InkFrameRadialTimeline.refreshThumbnail(cur,thumb)'),'release index must refresh orbital thumbnails');
  assert.ok(html.includes('InkFrameRadialTimeline.syncPlayback({'),'release index must synchronize the orbital playhead from the established rail');
  assert.ok(html.includes('project:projects[pi]'),'release bridge must isolate navigation view by project');
  assert.ok(html.includes('playing,fps,loopOn,loopIn,loopOut'),'release bridge must expose established playback state');
  assert.ok(html.includes('playbackFraction:frameCenterFrac(cur)'),'release bridge must seed hold-aware orbital playback position');
  assert.ok(html.includes('canNavigate:()=>'),'release bridge must block navigation during active strokes');
  assert.ok(html.includes('seek:i=>'),'release bridge must expose bounded frame seeking');
  assert.ok(html.includes('seekFraction:f=>'),'release bridge must delegate orbital scrubbing to hold-weighted rail seeking');
  assert.ok(html.includes('togglePlayback:()=>'),'release bridge must delegate play/pause to the established animation engine');
  assert.ok(html.includes('fraction:activeFraction,current:cur,playing,loopOn,loopIn,loopOut,fps'),'release rail must publish continuous playback progress');
  assert.ok(radialSource.includes('inkframe-radial-hit'),'Radial Timeline must expose orbit-only drag targets');
  assert.ok(radialSource.includes('inkframe-radial-playhead'),'Radial Timeline must expose the continuous orbital playhead');
  assert.ok(radialSource.includes('inkframe-radial-loop'),'Radial Timeline must expose loop-range arcs');
  assert.ok(radialSource.includes('inkframe-radial-scrub'),'Radial Timeline must expose explicit scrub mode');
  assert.ok(radialSource.includes('function timingMap'),'Radial Timeline must derive progress from frame holds');
  assert.ok(radialSource.includes('function playbackPoint'),'Radial Timeline must project hold-weighted time onto its orbit');
  assert.ok(radialSource.includes('function loopSegments'),'Radial Timeline must split loop ranges across concentric rings');
  assert.ok(radialSource.includes('function syncPlayback'),'Radial Timeline must accept the rail as playback source of truth');
  assert.ok(radialSource.includes('focusCurrent'),'Radial Timeline must expose current-frame centering');
  assert.ok(radialSource.includes('toggleRingFocus'),'Radial Timeline must expose ring focus');
  assert.ok(radialSource.includes('toggleScrubMode'),'Radial Timeline must expose presentation-only scrubbing');
  assert.ok(radialSource.includes("event.key==='ArrowRight'"),'Radial Timeline must expose keyboard stepping');
  assert.ok(radialSource.includes("event.key===' '"),'Radial Timeline must expose keyboard play/pause');
  assert.ok(radialSource.includes('aria-activedescendant'),'Radial Timeline must expose active-frame accessibility state');
  assert.ok(radialSource.includes('const projectViews=new WeakMap()'),'Radial Timeline view state must remain non-persistent and per-project');
  assert.ok(radialSource.includes('projectCanvasWrites:0'),'Radial Timeline must declare project-canvas isolation');
  assert.ok(radialSource.includes('undoWrites:0'),'Radial Timeline must declare artwork-undo isolation');
  for(const script of [
    'stabilizer.js','ghost-trail.js','runtime.js','ghost-runtime.js',
    'stabilizer-ui.js','ghost-ui.js','user-presets.js','lab-ui.js','preset-ui.js','preview-compare.js','preview-pad.js',
  ]){
    assert.ok(html.includes(`<script src="brush-engine-v2/${script}"></script>`),`missing release script ${script}`);
    assert.ok(existsSync(resolve(root,`web/brush-engine-v2/${script}`)),`missing runtime file ${script}`);
  }
  for(const asset of ['preview-replay.js','brush-coach.js','coach-session.js','calibration-report.js','profile-recovery.js','profile-recovery-observer.js','profile-identities.js','identity-mixer.js','brush-match.js','brush-signature.js']){
    assert.ok(existsSync(resolve(root,`web/brush-engine-v2/${asset}`)),`missing dynamic asset ${asset}`);
  }
  assert.ok(compareSource.includes("script.src='brush-engine-v2/preview-replay.js'"),'comparison runtime must load reference replay');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/brush-coach.js'"),'comparison runtime must load Brush Coach');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/coach-session.js'"),'comparison runtime must load Coach Session');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/calibration-report.js'"),'comparison runtime must load Calibration Report');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/profile-recovery.js'"),'comparison runtime must load Profile Recovery');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/profile-recovery-observer.js'"),'comparison runtime must load Profile Recovery Observer');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/profile-identities.js'"),'comparison runtime must load Creative Brush Identities');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/identity-mixer.js'"),'comparison runtime must load Identity Mixer');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/brush-match.js'"),'comparison runtime must load Brush Match');
  assert.ok(compareSource.includes("script.src='brush-engine-v2/brush-signature.js'"),'comparison runtime must load Brush Signature');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadBrushCoach,0)"),'Brush Coach must be scheduled from the reference replay load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadCoachSession,0)"),'Coach Session must be scheduled from the Brush Coach load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadCalibrationReport,0)"),'Calibration Report must be scheduled from the Coach Session load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadProfileRecovery,0)"),'Profile Recovery must be scheduled from the Calibration Report load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadProfileRecoveryObserver,0)"),'Profile Recovery Observer must be scheduled from the recovery load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadProfileIdentities,0)"),'Creative Identities must be scheduled from the observer load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadIdentityMixer,0)"),'Identity Mixer must be scheduled from the identity load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadBrushMatch,0)"),'Brush Match must be scheduled from the mixer load event');
  assert.ok(compareSource.includes("script.addEventListener('load',()=>root.setTimeout(loadBrushSignature,0)"),'Brush Signature must be scheduled from the Brush Match load event');
  assert.ok(compareSource.includes('script[data-inkframe-coach-session]'),'Coach Session loader must suppress duplicates');
  assert.ok(compareSource.includes('script[data-inkframe-calibration-report]'),'Calibration Report loader must suppress duplicates');
  assert.ok(compareSource.includes('script[data-inkframe-profile-recovery]'),'Profile Recovery loader must suppress duplicates');
  assert.ok(compareSource.includes('script[data-inkframe-profile-recovery-observer]'),'Profile Recovery Observer loader must suppress duplicates');
  assert.ok(compareSource.includes('script[data-inkframe-profile-identities]'),'Creative Identity loader must suppress duplicates');
  assert.ok(compareSource.includes('script[data-inkframe-identity-mixer]'),'Identity Mixer loader must suppress duplicates');
  assert.ok(compareSource.includes('script[data-inkframe-brush-match]'),'Brush Match loader must suppress duplicates');
  assert.ok(compareSource.includes('script[data-inkframe-brush-signature]'),'Brush Signature loader must suppress duplicates');
  assert.equal(html.includes('<script src="brush-engine-v2/native.js"></script>'), false);
  assert.ok(html.indexOf('brush-engine-v2/stabilizer.js') < html.indexOf('brush-engine-v2/filters.js'));
  assert.ok(html.indexOf('brush-engine-v2/rasterizer.js') < html.indexOf('brush-engine-v2/ghost-trail.js'));
  assert.ok(html.indexOf('brush-engine-v2/trace.js') < html.indexOf('brush-engine-v2/runtime.js'));
  assert.ok(html.indexOf('brush-engine-v2/tuning.js') < html.indexOf('brush-engine-v2/user-presets.js'));
  assert.ok(html.indexOf('brush-engine-v2/user-presets.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.indexOf('brush-engine-v2/runtime.js') < html.indexOf('brush-engine-v2/adapter.js'));
  assert.ok(html.indexOf('brush-engine-v2/session.js') < html.indexOf('brush-engine-v2/ghost-runtime.js'));
  assert.ok(html.indexOf('brush-engine-v2/ghost-runtime.js') < html.indexOf('brush-engine-v2/input.js'));
  assert.ok(html.indexOf('brush-engine-v2/ghost-ui.js') < html.indexOf('brush-engine-v2/lab-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/lab-ui.js') < html.indexOf('brush-engine-v2/preset-ui.js'));
  assert.ok(html.indexOf('brush-engine-v2/preset-ui.js') < html.indexOf('brush-engine-v2/preview-compare.js'));
  assert.ok(html.indexOf('brush-engine-v2/preview-compare.js') < html.indexOf('brush-engine-v2/preview-pad.js'));
  assert.ok(html.includes('InkFrameBrushV2InputBridge.begin'));
  assert.ok(html.includes('coordinateTransform:inputTransform'));

  console.log('✅ generated Brush V2 production recovery, signature, Circular Canvas, radial navigation, and hold-aware playback policy passed');
} finally {
  rmSync(temp, { recursive:true, force:true });
}

await import('./canvas-shape.test.mjs');
await import('./canvas-shape-autosave.test.mjs');
await import('./canvas-shape-boot.test.mjs');
await import('./radial-timeline.test.mjs');
await import('./radial-timeline-boot.test.mjs');
await import('./android-branding.test.mjs');
