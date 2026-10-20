import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];

function start(args, cwd, extraEnv, urlPattern) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...extraEnv, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error(`Startup timed out:\n${output}`)),
      15000,
    );
    function read(chunk) {
      output += chunk.toString();
      const match = output.match(urlPattern);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    }
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code) reject(new Error(`Process exited (${code}):\n${output}`));
    });
  });
}

try {
  const apiUrl = await start(
    ['dist/main.js'],
    join(root, 'apps/api'),
    { PORT: '0', HOST: '127.0.0.1' },
    /http:\/\/127\.0\.0\.1:\d+/,
  );
  const apiResponse = await fetch(`${apiUrl}/api/v1/health`);
  assert.equal(apiResponse.status, 200);
  const unauthorized = await fetch(`${apiUrl}/api/v1/dashboard`);
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
  const health = await apiResponse.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'awesomejm-api');
  assert.match(health.nodeVersion, /^v24\./);

  const require = createRequire(join(root, 'apps/web/package.json'));
  const viteCli = join(
    dirname(require.resolve('vite/package.json')),
    'bin/vite.js',
  );
  const webUrl = await start(
    [viteCli, '--port', '0'],
    join(root, 'apps/web'),
    { API_PROXY_TARGET: apiUrl },
    /http:\/\/127\.0\.0\.1:\d+/,
  );
  const page = await fetch(webUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>AwesomeJM<\/title>/);
  const proxied = await fetch(`${webUrl}/api/v1/health`);
  assert.equal(proxied.status, 200);
  assert.equal((await proxied.json()).service, 'awesomejm-api');
  assert.equal((await fetch(`${webUrl}/api/v1/dashboard`)).status, 401);
  console.info(
    'Smoke passed: Node 24 API, frontend and frontend-to-API proxy, and anonymous access blocked.',
  );
} finally {
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null)
            return resolve();
          child.once('exit', resolve);
        }),
    ),
  );
}
