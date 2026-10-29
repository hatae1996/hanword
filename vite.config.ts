import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// 단일 HTML 로 빌드 → 그대로 배포하거나 Tauri 웹뷰에 넣기 쉽다.
export default defineConfig({
  plugins: [viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
