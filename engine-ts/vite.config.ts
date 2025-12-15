import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';
import fs from 'fs';

export default defineConfig({
    plugins: [
        wasm(),
        topLevelAwait(),
        {
            name: 'serve-game-data',
            configureServer(server) {
                // Middleware to serve ../game-data at /game-data
                server.middlewares.use('/game-data', (req, res, next) => {
                    // Resolve the absolute path to the sibling 'game-data' folder
                    const gameDataRoot = path.resolve(__dirname, '../game-data');
                    const requestUrl = req.url || '';

                    // Remove leading slash if present to join correctly
                    const sanitizedUrl = requestUrl.startsWith('/') ? requestUrl.slice(1) : requestUrl;
                    const filePath = path.join(gameDataRoot, sanitizedUrl);

                    // Check if file exists
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                        // Simple MIME type handling
                        if (filePath.endsWith('.json')) {
                            res.setHeader('Content-Type', 'application/json');
                        }

                        const content = fs.readFileSync(filePath, 'utf-8');
                        res.end(content);
                        return;
                    }

                    next();
                });
            }
        }
    ],
    server: {
        port: 3000,
        fs: {
            // Allow serving files from the project root (one level up)
            allow: ['..']
        }
    }
});