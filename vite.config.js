import { defineConfig } from 'vite';

export default defineConfig({
    // Base path for GitHub Pages deployment. 
    // If your repo is at github.com/username/repo, set this to '/repo/'
    base: '/3D',
    build: {
        outDir: 'dist',
    },
    server: {
        open: true,
    }
});
