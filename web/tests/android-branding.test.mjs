import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..','..');
const app=resolve(root,'app');

function text(path){return readFileSync(resolve(root,path),'utf8');}
function decode(path){
  const encoded=text(path).replace(/\s+/g,'');
  return Buffer.from(encoded,'base64');
}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
function webpDimensions(bytes){
  assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF','missing RIFF header');
  assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP','missing WEBP header');
  const chunk=bytes.subarray(12,16).toString('ascii');
  if(chunk==='VP8 '){
    assert.deepEqual(Array.from(bytes.subarray(23,26)),[0x9d,0x01,0x2a],'invalid VP8 key-frame signature');
    return {
      width:bytes.readUInt16LE(26)&0x3fff,
      height:bytes.readUInt16LE(28)&0x3fff,
      chunk,
    };
  }
  if(chunk==='VP8X'){
    return {
      width:1+bytes.readUIntLE(24,3),
      height:1+bytes.readUIntLE(27,3),
      chunk,
    };
  }
  throw new Error(`unsupported WebP chunk ${JSON.stringify(chunk)}`);
}

const assets=[
  {
    path:'app/src/main/branding/glass_horizon_icon.webp.b64',
    output:'mipmap-xxxhdpi/ic_launcher_glass_horizon.webp',
    sha:'265ec40a596d912a4372c75690e1d2911fa5513c916022119569f4986c789ad4',
    size:11234,width:512,height:512,
  },
  {
    path:'app/src/main/branding/glass_horizon_splash.webp.b64',
    output:'drawable-nodpi/inkframe_splash.webp',
    sha:'15fe71cfac141bcd1b8121c3aa257f11f3d527dc55027bef3f2ba35b58655327',
    size:11344,width:512,height:917,
  },
];

for(const asset of assets){
  const bytes=decode(asset.path);
  assert.equal(bytes.length,asset.size,`${asset.path} byte size drifted`);
  assert.equal(sha256(bytes),asset.sha,`${asset.path} digest drifted`);
  const dimensions=webpDimensions(bytes);
  assert.equal(dimensions.width,asset.width,`${asset.path} width drifted`);
  assert.equal(dimensions.height,asset.height,`${asset.path} height drifted`);
}

const gradle=text('app/build.gradle.kts');
for(const asset of assets){
  assert.ok(gradle.includes(asset.path.split('/').at(-1)),`Gradle missing ${asset.path}`);
  assert.ok(gradle.includes(asset.output),`Gradle missing ${asset.output}`);
  assert.ok(gradle.includes(asset.sha),`Gradle missing digest for ${asset.path}`);
}
assert.ok(gradle.includes('generateBrandingResources'),'branding generator task missing');
assert.ok(gradle.includes('res.srcDir(generatedBrandingResDir)'),'generated branding resources not mounted');
assert.ok(gradle.includes('MessageDigest.getInstance("SHA-256")'),'branding digest verification missing');
assert.ok(gradle.includes('String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP"'),'branding WebP verification missing');

const manifest=text('app/src/main/AndroidManifest.xml');
assert.ok(manifest.includes('android:name=".SplashActivity"'),'SplashActivity missing from manifest');
assert.ok(manifest.includes('android:name=".MainActivity"'),'MainActivity missing from manifest');
assert.ok(manifest.includes('android:icon="@mipmap/ic_launcher_glass_horizon"'),'Glass Horizon launcher icon resource missing');
assert.ok(manifest.includes('android:roundIcon="@mipmap/ic_launcher_glass_horizon"'),'Glass Horizon round icon resource missing');
assert.equal(manifest.includes('android:excludeFromRecents="true"'),false,'splash must not remove the studio task from Recents');
assert.match(manifest,/android:name="\.MainActivity"[\s\S]*?android:exported="false"/,'MainActivity must remain internal');
assert.match(manifest,/android:name="\.SplashActivity"[\s\S]*?android:exported="true"/,'SplashActivity must own the exported launcher entry');
assert.equal((manifest.match(/android\.intent\.action\.MAIN/g)||[]).length,1,'exactly one activity must own MAIN');
assert.equal((manifest.match(/android\.intent\.category\.LAUNCHER/g)||[]).length,1,'exactly one activity must own LAUNCHER');
assert.match(manifest,/android:name="\.SplashActivity"[\s\S]*?android\.intent\.action\.MAIN[\s\S]*?android\.intent\.category\.LAUNCHER/,'SplashActivity must own launcher intent');

const splash=text('app/src/main/kotlin/com/inkframe/studio/SplashActivity.kt');
assert.ok(splash.includes('R.drawable.inkframe_splash'),'native splash drawable missing');
assert.ok(splash.includes('ImageView.ScaleType.CENTER_CROP'),'portrait splash must use non-distorting center crop');
assert.ok(splash.includes('Intent(this, MainActivity::class.java)'),'splash must hand off to MainActivity');
assert.ok(splash.includes('const val DISPLAY_MS = 650L'),'splash display timing drifted');
assert.ok(splash.includes('const val FADE_IN_MS = 140L'),'splash fade-in timing drifted');
assert.ok(splash.includes('const val FADE_OUT_MS = 180L'),'splash fade-out timing drifted');
assert.ok(splash.includes('if (studioLaunched || isFinishing || isDestroyed) return'),'double-launch guard missing');

const themes=text('app/src/main/res/values/themes.xml');
assert.ok(themes.includes('name="Theme.InkFrame.Splash"'),'pre-Android 12 splash theme missing');
assert.ok(themes.includes('<item name="android:windowFullscreen">true</item>'),'fullscreen splash policy missing');
const themes31=text('app/src/main/res/values-v31/themes.xml');
assert.ok(themes31.includes('android:windowSplashScreenAnimatedIcon'),'Android 12 system splash icon missing');
assert.ok(themes31.includes('@mipmap/ic_launcher_glass_horizon'),'Android 12 system splash must use Glass Horizon artwork');
assert.ok(themes31.includes('android:windowSplashScreenBackground'),'Android 12 splash background missing');

assert.equal(app.endsWith('/app')||app.endsWith('\\app'),true);
console.log('✅ Glass Horizon launcher bytes, native splash, manifest routing, and Android 12 policy passed');

await import('./creator-statement.test.mjs');
