import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// @ts-ignore 项目没装 node 类型，构建时 Vite 在 Node 里跑，这里可以用
import { execSync } from 'node:child_process';

// 版本号：git 短哈希 + 构建时间（诊断面板和旅程设置里显示，确认手机上跑的是不是最新版）
const sha = (() => {
  try {
    // @ts-ignore 同上
    return (process.env.COMMIT_REF || execSync('git rev-parse HEAD').toString()).trim().slice(0, 7);
  } catch {
    return 'dev';
  }
})();
const BUILD = `${sha} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

export default defineConfig({
  build: { target: 'es2020' },
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    VitePWA({
      // 2026-10-19：改成自动更新（以前要点「有新版本」才换，手机上常常一直跑旧版）
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '旅程 Rundown',
        short_name: '旅程 Rundown',
        description: '把 AI 做好的行程变成出行时直接执行的行程面板',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#FFFFFF',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}', 'tex/*.webp'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        clientsClaim: true,
        // 2026-10-19：点手机通知时打开对应页面
        importScripts: ['notify-sw.js'],
        skipWaiting: true,
        // 旅程介绍页的照片（换成 jpg 后不进预缓存，看过一次就离线可用）
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/landing/'),
            handler: 'CacheFirst',
            options: { cacheName: 'landing-media', expiration: { maxEntries: 60 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
} as any);
