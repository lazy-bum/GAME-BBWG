#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const releaseRoot = path.join(projectRoot, 'release');
const packageRoot = path.join(releaseRoot, 'package');
const includeData = process.argv.includes('--with-data');
const includeConfig = process.argv.includes('--with-config');

const requiredPaths = ['dist', 'public', 'package.json', 'package-lock.json', '.env.example'];

main();

function main() {
  ensureBuildExists();
  resetDir(releaseRoot);
  fs.mkdirSync(packageRoot, { recursive: true });

  for (const relativePath of requiredPaths) {
    copyIntoPackage(relativePath);
  }

  copyIfExists('.well-known');

  if (includeData) {
    copyIfExists('data');
  }

  if (includeConfig) {
    copyIfExists('config.json');
  }

  writeManifest();
  createTarball();
  printSummary();
}

function ensureBuildExists() {
  const distPath = path.join(projectRoot, 'dist', 'server.js');
  if (!fs.existsSync(distPath)) {
    fail('缺少 dist/server.js，请先执行 npm run build');
  }
}

function resetDir(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyIntoPackage(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    fail(`缺少必需文件: ${relativePath}`);
  }

  const destinationPath = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

function copyIfExists(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const destinationPath = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

function writeManifest() {
  const lines = [
    'BBWG release package',
    '',
    'Start commands:',
    '  npm ci --omit=dev',
    '  node dist/server.js',
    '',
    'Optional modes:',
    '  node dist/server.js --wechat',
    '  node dist/server.js --wechat --force-wechat-login',
    ''
  ];

  if (includeData || includeConfig) {
    lines.push('Included runtime state:');
    if (includeData) {
      lines.push('  data/');
    }
    if (includeConfig) {
      lines.push('  config.json');
    }
    lines.push('');
  }

  fs.writeFileSync(path.join(packageRoot, 'DEPLOY.txt'), `${lines.join('\n')}\n`, 'utf8');
}

function createTarball() {
  const tarballName = 'bbwg-release.tar.gz';
  const tarballPath = path.join(releaseRoot, tarballName);
  const result = spawnSync('tar', ['-czf', tarballPath, '-C', packageRoot, '.'], {
    cwd: projectRoot,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    fail('打包 tar.gz 失败，请确认系统已安装 tar');
  }
}

function printSummary() {
  const included = ['dist/', 'public/', 'package.json', 'package-lock.json', '.env.example'];

  if (fs.existsSync(path.join(projectRoot, '.well-known'))) {
    included.push('.well-known/');
  }

  if (includeData) {
    included.push('data/');
  }

  if (includeConfig) {
    included.push('config.json');
  }

  console.log('发布包已生成:');
  console.log(`  ${path.relative(projectRoot, path.join(releaseRoot, 'bbwg-release.tar.gz'))}`);
  console.log('包含内容:');
  for (const item of included) {
    console.log(`  - ${item}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
