# Media

Static assets for the README + Play Store listing.

## Files

| File | What | How it was made |
|---|---|---|
| `hero.png` | 16:9 marketing shot of the Glass Horizon interface | AI-generated concept art |
| `demo.gif` | 6-frame leaping-cat loop, 320×320, ~450 KB | Built by our own `web/gif-encoder.js` from the 4 `demo_f*.png` keyframes |
| `demo_f{1..4}.png` | The four ink-brush keyframes used to build `demo.gif` | AI-generated (each frame conditioned on the previous) |

## Regenerating `demo.gif`

If you tweak the keyframes and want to rebuild the GIF locally:

```bash
# Downscale to raw RGBA using ImageMagick
mkdir -p /tmp/demo
for i in 1 2 3 4; do
  convert media/demo_f${i}.png -resize 320x320 -depth 8 rgba:/tmp/demo/f${i}.rgba
done

# Feed into our own encoder
node - <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const src = readFileSync('web/gif-encoder.js', 'utf8')
  .replace(/if \(typeof self[\s\S]*?\}\s*\}\);\s*\}/, '')
  .replace(/if \(typeof window[\s\S]*?\}\s*$/m, '')
  .replace(/if \(typeof module[\s\S]*?\}\s*$/m, '');
const { GifEncoder } = new Function(src + '\nreturn { GifEncoder };')();
const W = 320, H = 320;
const toArgb = rgba => {
  const N = W*H, out = new Int32Array(N);
  for (let i=0,j=0;i<N;i++,j+=4)
    out[i] = ((rgba[j+3]&0xFF)<<24) | ((rgba[j]&0xFF)<<16) | ((rgba[j+1]&0xFF)<<8) | (rgba[j+2]&0xFF);
  return out;
};
const enc = new GifEncoder(W, H, { loop:true, maxColorsPerFrame:48 });
// [frame, hold-ticks-at-12fps]
const plan = [['f1',3],['f2',2],['f3',4],['f4',2],['f3',2],['f2',2]];
for (const [n,h] of plan)
  enc.addFrame(toArgb(readFileSync(`/tmp/demo/${n}.rgba`)), 8*h);
writeFileSync('media/demo.gif', Buffer.from(enc.finish()));
EOF
```

This exists on purpose: the demo GIF is proof that the GIF exporter shipped
inside the app actually works end-to-end — the same encoder that produces
the app's exports produced this demo.
