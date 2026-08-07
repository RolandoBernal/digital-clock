import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

const runtimeEntries = [
  'index.html',
  'index-digital-clock.html',
  'manifest.webmanifest',
  'service-worker.js',
  'favicon-landos-world.svg',
  'favicon.svg',
  'clock-favicon.svg',
  'apple-touch-icon-landos-world-v2.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'css',
  'js',
  'fonts',
  'icons',
  'vendor',
];

function parseArgs(argv) {
  const targetIndex = argv.indexOf('--target');
  const target = targetIndex >= 0 ? argv[targetIndex + 1] : 'all';
  if (!['all', 'web', 'native'].includes(target)) {
    throw new Error(`Unknown build target "${target}". Use all, web, or native.`);
  }
  return { target };
}

async function copyRuntimeFiles(target) {
  const outputDir = path.join(distDir, target);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await Promise.all(runtimeEntries.map((entry) => cp(
    path.join(rootDir, entry),
    path.join(outputDir, entry),
    { recursive: true },
  )));
  if (target === 'native') await writeNativeManifest(outputDir);
  await writeBuildInfo(outputDir, target);
}

async function writeNativeManifest(outputDir) {
  const manifestPath = path.join(outputDir, 'manifest.webmanifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const normalize = (value) => String(value || '').replace(/^\/landos-world\/?/, '');
  manifest.id = './';
  manifest.start_url = './';
  manifest.scope = './';
  manifest.icons = (manifest.icons || []).map((icon) => ({
    ...icon,
    src: normalize(icon.src),
  }));
  manifest.shortcuts = (manifest.shortcuts || []).map((shortcut) => ({
    ...shortcut,
    url: normalize(shortcut.url).replace(/^#/, './#'),
    icons: (shortcut.icons || []).map((icon) => ({
      ...icon,
      src: normalize(icon.src),
    })),
  }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeBuildInfo(outputDir, target) {
  const buildInfo = {
    target,
    generatedAt: new Date().toISOString(),
    source: 'scripts/build-static.mjs',
    notes: [
      'Static runtime bundle for Lando\'s World.',
      'GitHub Pages continues to serve the repository root.',
      'Future Capacitor builds should use dist/native as webDir.',
    ],
  };
  await writeFile(path.join(outputDir, 'BUILD_INFO.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
}

const { target } = parseArgs(process.argv.slice(2));
const targets = target === 'all' ? ['web', 'native'] : [target];
await Promise.all(targets.map(copyRuntimeFiles));

console.log(`Built ${targets.map((item) => `dist/${item}`).join(' and ')}.`);
