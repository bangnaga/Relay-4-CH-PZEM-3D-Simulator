import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Inline plugin to map @babylonjs/core to window.BABYLON loaded from CDN.
// This reduces the final build bundle size from 20MB to under 200KB and speeds up builds from 5 minutes to seconds.
const babylonExternalPlugin = {
  name: 'external-babylon',
  enforce: 'pre' as const, // Run before Vite's built-in node resolution
  resolveId(id: string) {
    if (id === '@babylonjs/core') {
      return id;
    }
    return null;
  },
  load(id: string) {
    if (id === '@babylonjs/core') {
      return `
        const B = window.BABYLON;
        export const Engine = B.Engine;
        export const Scene = B.Scene;
        export const ArcRotateCamera = B.ArcRotateCamera;
        export const Vector3 = B.Vector3;
        export const HemisphericLight = B.HemisphericLight;
        export const PointLight = B.PointLight;
        export const SpotLight = B.SpotLight;
        export const MeshBuilder = B.MeshBuilder;
        export const StandardMaterial = B.StandardMaterial;
        export const Color3 = B.Color3;
        export const GlowLayer = B.GlowLayer;
        export const Mesh = B.Mesh;
        export const TransformNode = B.TransformNode;
        export const Texture = B.Texture;
      `;
    }
    return null;
  }
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), babylonExternalPlugin],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 10000,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
