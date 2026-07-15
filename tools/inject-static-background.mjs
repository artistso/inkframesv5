// Compatibility entry point tracked by the generated Android asset pipeline.
import { injectStaticBackground as injectGeneratedBackground } from './inject-static-background-v2.mjs';

export function injectStaticBackground(html) {
  // Canvas Shape emits the same two-line default in useProject() and the direct
  // archive binder. The v2 postprocessor intentionally updates them in order.
  // Limit only this exact discovery regex to its first occurrence; all other
  // replacement patterns retain strict global uniqueness validation.
  const originalMatchAll = String.prototype.matchAll;
  const migrationSource = "    if\\(P\\.canvasShape!=='circle'\\) P\\.canvasShape='square';\\n    refreshFctx\\(\\);";
  String.prototype.matchAll = function(pattern) {
    const iterator = originalMatchAll.call(this, pattern);
    if (!(pattern instanceof RegExp) || pattern.source !== migrationSource) return iterator;
    const first = iterator.next();
    return {
      [Symbol.iterator]() {
        let emitted = false;
        return {
          next() {
            if (emitted || first.done) return { done: true, value: undefined };
            emitted = true;
            return { done: false, value: first.value };
          },
        };
      },
    };
  };
  try {
    return injectGeneratedBackground(html);
  } finally {
    String.prototype.matchAll = originalMatchAll;
  }
}
