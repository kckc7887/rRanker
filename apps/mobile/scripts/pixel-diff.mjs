#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(dirname(fileURLToPath(import.meta.url)));
const WORK_DIR = join(process.env.TEMP ?? '.', 'rranker-pixel-diff');

function usage() {
  console.log(`用法：
  node scripts/pixel-diff.mjs capture <输出.png> [--adb <adb路径>]
  node scripts/pixel-diff.mjs compare <基准.png> <对比.png>

capture  ：通过 adb 截取设备当前屏幕（adb exec-out screencap -p）。
compare  ：逐像素比较两张 PNG（32bpp ARGB），差异像素必须为 0，
          非 0 时退出码为 1 并打印差异统计；图片尺寸不一致直接失败。`);
}

async function capture(pngPath, adbPath) {
  const bin = adbPath ?? 'adb';
  const out = execSync(`"${bin}" exec-out screencap -p`, { encoding: 'buffer', stdio: ['ignore', 'pipe', 'inherit'] });
  writeFileSync(pngPath, out);
  console.log(`已截屏：${pngPath}（${out.length} 字节）`);
}

const PS_DECODE = `param([string]$Png, [string]$Raw, [string]$Meta)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap($Png)
$rect = New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $bmp.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$metaObj = [ordered]@{ width = $bmp.Width; height = $bmp.Height; stride = $stride }
$bmp.Dispose()
[System.IO.File]::WriteAllBytes($Raw, $bytes)
[System.IO.File]::WriteAllText($Meta, ($metaObj | ConvertTo-Json -Compress))
`;

function decodePng(pngPath) {
  const raw = join(WORK_DIR, `${process.pid}-${pngPath.replace(/[^a-zA-Z0-9]/g, '_')}.raw`);
  const meta = `${raw}.json`;
  const ps1 = join(WORK_DIR, `decode-${process.pid}.ps1`);
  mkdirSync(WORK_DIR, { recursive: true });
  writeFileSync(ps1, PS_DECODE);
  execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${JSON.stringify(ps1)} ${JSON.stringify(pngPath)} ${JSON.stringify(raw)} ${JSON.stringify(meta)}`, {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return { raw, meta: JSON.parse(readFileSync(meta, 'utf8')) };
}

function compare(beforePng, afterPng) {
  mkdirSync(WORK_DIR, { recursive: true });
  try {
    const before = decodePng(beforePng);
    const after = decodePng(afterPng);
    if (before.meta.width !== after.meta.width || before.meta.height !== after.meta.height) {
      throw new Error(`尺寸不一致：基准 ${before.meta.width}x${before.meta.height}，对比 ${after.meta.width}x${after.meta.height}`);
    }
    const a = readFileSync(before.raw);
    const b = readFileSync(after.raw);
    const { width, height, stride } = before.meta;
    const rowBytes = width * 4;
    let diff = 0;
    let maxChannelDiff = 0;
    for (let y = 0; y < height; y++) {
      const start = y * stride;
      for (let x = 0; x < rowBytes; x++) {
        const av = a[start + x];
        const bv = b[start + x];
        if (av !== bv) {
          diff++;
          const channel = Math.abs(av - bv);
          if (channel > maxChannelDiff) maxChannelDiff = channel;
        }
      }
    }
    const total = width * height;
    console.log(`差异像素：${diff}/${total}（${(diff / total * 100).toFixed(4)}%），最大通道差 ${maxChannelDiff}`);
    if (diff !== 0) {
      console.log(`基准：${beforePng}`);
      console.log(`对比：${afterPng}`);
      process.exitCode = 1;
    }
  } finally {
    rmSync(WORK_DIR, { recursive: true, force: true });
  }
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'capture') {
    const pngPath = rest[0];
    if (!pngPath) return usage();
    const adbIndex = rest.indexOf('--adb');
    const adbPath = adbIndex >= 0 ? rest[adbIndex + 1] : undefined;
    void capture(pngPath, adbPath);
  } else if (mode === 'compare') {
    const [beforePng, afterPng] = rest;
    if (!beforePng || !afterPng) return usage();
    if (!existsSync(beforePng)) throw new Error(`找不到基准图：${beforePng}`);
    if (!existsSync(afterPng)) throw new Error(`找不到对比图：${afterPng}`);
    compare(beforePng, afterPng);
  } else {
    usage();
  }
}

main();
