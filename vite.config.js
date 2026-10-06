import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { FRAME_ANCESTORS_CSP } from './server/discordAuth.js'

// Multi-page: cinematic space landing (index.html) + the R3F simulator
// (simulation.html). Vendor chunks are split for faster first paint.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = Number(env.PORT || 3002)
  const activityHeaders = {
    'Content-Security-Policy': FRAME_ANCESTORS_CSP,
    'X-Content-Type-Options': 'nosniff',
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      headers: activityHeaders,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
    preview: {
      host: '0.0.0.0',
      headers: activityHeaders,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          simulation: resolve(__dirname, 'simulation.html'),
        },
        output: {
          manualChunks: {
            'discord-sdk': ['@discord/embedded-app-sdk'],
            'three-core':   ['three'],
            'r3f':          ['@react-three/fiber', '@react-three/drei'],
            'postfx':       ['@react-three/postprocessing', 'postprocessing'],
            'state':        ['zustand'],
            'react-vendor': ['react', 'react-dom'],
          },
        },
      },
    },
  }
})
