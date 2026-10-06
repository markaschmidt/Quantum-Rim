import { createServer } from 'node:http';
import exchangeHandler from '../api/auth/discord/exchange.js';
import healthHandler from '../api/health.js';
import meHandler from '../api/me.js';
import { sendJson } from './http.js';

const routes = new Map([
  ['/api/auth/discord/exchange', exchangeHandler],
  ['/api/health', healthHandler],
  ['/api/me', meHandler],
]);

export function createDiscordApiServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const handler = routes.get(url.pathname);
    if (!handler) return sendJson(res, 404, { error: 'Not found' });
    return handler(req, res);
  });
}

if (process.argv[1] && new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).pathname.endsWith('/server/devServer.js')) {
  const port = Number(process.env.PORT || 3002);
  const server = createDiscordApiServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Quantum Rim Discord API listening on http://127.0.0.1:${port}`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
