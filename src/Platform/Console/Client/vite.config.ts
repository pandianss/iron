import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    root: 'src/Platform/Console/Client',
    build: {
        outDir: '../../../../dist/console',
        emptyOutDir: true
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000'
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    }
});
