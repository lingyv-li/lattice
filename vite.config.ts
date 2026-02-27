/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Custom plugin to copy manifest (with version from package.json) and process icons
const copyManifest = () => {
    return {
        name: 'copy-manifest',
        closeBundle: async () => {
            const pkg = JSON.parse(
                fs.readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
            );
            const manifestPath = resolve(__dirname, 'src/manifest.json');
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            manifest.version = pkg.version;
            fs.writeFileSync(
                resolve(__dirname, 'dist/manifest.json'),
                JSON.stringify(manifest, null, 4)
            );

            await sharp(resolve(__dirname, 'public/icon.svg'))
                .png()
                .resize(128, 128)
                .toFile(resolve(__dirname, 'dist/icon.png'));

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
                sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
                options: resolve(__dirname, 'src/options/index.html'),
                welcome: resolve(__dirname, 'src/welcome/index.html'),
            },
            output: {
                entryFileNames: '[name]/index.js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            }
        },
        outDir: 'dist',
        emptyOutDir: true
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        // Exclude Playwright screenshot tests from the Vitest runner
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/screenshots/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/setupTests.ts',
                '**/*.test.{ts,tsx}',
                '**/__tests__/**'
            ]
        }
    }
});
