/**
 * Nest 11 publishes several packages without `main`/`types` in package.json.
 * TypeScript `nodenext` (and the IDE language service) then fail to resolve
 * `@nestjs/common` etc. even though index.js / index.d.ts exist on disk.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const packages = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/schedule',
  '@nestjs/jwt',
  '@nestjs/passport',
  '@nestjs/cache-manager',
  '@nestjs/testing',
];

for (const name of packages) {
  let pkgPath;
  try {
    pkgPath = require.resolve(`${name}/package.json`);
  } catch {
    continue;
  }

  const dir = pkgPath.slice(0, pkgPath.lastIndexOf('/'));
  if (
    !fs.existsSync(`${dir}/index.js`) ||
    !fs.existsSync(`${dir}/index.d.ts`)
  ) {
    continue;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  let changed = false;
  if (!pkg.main) {
    pkg.main = './index.js';
    changed = true;
  }
  if (!pkg.types && !pkg.typings) {
    pkg.types = './index.d.ts';
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}
