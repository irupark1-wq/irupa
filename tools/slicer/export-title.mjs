import sharp from "sharp";
const REF = "C:/claude_blender/donggeuran/docs/reference/design-20261013-d/";
const OUT = "C:/claude_blender/donggeuran/prototype/assets/brand/";
for (const [file, out] of [["09_title_en.webp", "title-en.png"], ["10_title_ja.webp", "title-ja.png"]]) {
  const { data, info } = await sharp(REF + file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, n = W * H;
  const isBlack = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) <= 34;
  const bg = new Uint8Array(n); const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) { const i = stack.pop(); if (bg[i] || !isBlack(i)) continue; bg[i] = 1; const x = i % W, y = (i / W) | 0; if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W); }
  const out4 = Buffer.from(data); let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i]) { out4[i * 4 + 3] = 0; continue; }
    const x = i % W, y = (i / W) | 0; let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (bg[yy * W + xx]) { edge = true; break; } }
    if (edge) { const mx = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); const a = Math.min(255, Math.round(mx * 1.6)); const k = a / 255; for (let c = 0; c < 3; c++) out4[i * 4 + c] = Math.min(255, Math.round(data[i * 4 + c] / Math.max(k, 0.05))); out4[i * 4 + 3] = a; }
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const pad = 6; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  await sharp(out4, { raw: { width: W, height: H, channels: 4 } }).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png({ compressionLevel: 9 }).toFile(OUT + out);
  const m = await sharp(OUT + out).metadata(); console.log(out, m.width + "x" + m.height);
}
