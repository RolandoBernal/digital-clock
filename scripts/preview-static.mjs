import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ttf', 'font/ttf'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

function parseArgs(argv) {
  const [rootArg] = argv;
  if (!rootArg || rootArg.startsWith('--')) {
    throw new Error('Usage: node scripts/preview-static.mjs <directory> [--host 127.0.0.1] [--port 4173]');
  }
  return {
    rootDir: path.resolve(rootArg),
    host: readOption(argv, '--host', '127.0.0.1'),
    port: Number(readOption(argv, '--port', '4173')),
  };
}

function readOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

async function resolveRequestPath(rootDir, url) {
  const requestUrl = new URL(url, 'http://localhost');
  const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  const requestedPath = path.resolve(rootDir, relativePath || 'index.html');
  if (!requestedPath.startsWith(`${rootDir}${path.sep}`) && requestedPath !== rootDir) return null;
  const stats = await stat(requestedPath);
  return stats.isDirectory() ? path.join(requestedPath, 'index.html') : requestedPath;
}

async function handleRequest(rootDir, request, response) {
  try {
    const filePath = await resolveRequestPath(rootDir, request.url);
    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500);
    response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}

const { rootDir, host, port } = parseArgs(process.argv.slice(2));
const rootStats = await stat(rootDir);
if (!rootStats.isDirectory()) throw new Error(`${rootDir} is not a directory.`);

const server = createServer((request, response) => {
  void handleRequest(rootDir, request, response);
});

server.on('error', (error) => {
  console.error(`Preview server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Serving ${rootDir}`);
  console.log(`Preview URL: http://${host}:${port}/`);
});
