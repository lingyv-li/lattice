import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import fs from 'fs';

import sharp from 'sharp';

// Custom plugin to copy manifest and process icons
const copyManifest = () => {
    return {
        name: 'copy-manifest',
        closeBundle: async () => {
            fs.copyFileSync('src/manifest.json', 'dist/manifest.json');

            await sharp('public/icon.svg')
                .png()
                .resize(128, 128)
                .toFile('dist/icon.png');

            console.log('Copied manifest.json and converted icon.svg to dist/icon.png');
        }
    };
};

export default defineConfig({
    plugins: [react(), tailwindcss(), copyManifest()],
    build: {
        rollupOptions: {
            input: {
                background: resolve(__dirname, 'src/background/index.ts'),
                options: resolve(__dirname, 'src/options/index.html'),
                sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
            },
            output: {
                entryFileNames: '[name]/index.js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            }
        },
        outDir: 'dist',
        emptyOutDir: true
    }
});
