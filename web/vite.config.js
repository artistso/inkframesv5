import { defineConfig } from 'vite'

// InkFrame web build. Relative base so the APK/AAB wrapper can load assets
// from local files regardless of the install path.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2018',
  },
})
