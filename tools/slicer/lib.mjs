import sharp from "sharp";

/* 흰 배경 시트를 읽어 배경(가장자리에서 이어진 흰색)을 투명으로 만들고 RGBA 버퍼를 돌려준다 */
export async function loadSheet(file, { bgMin = 228, satMax = 22 } = {}) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width,
    H = info.height,
    n = W * H;
  // 이미 투명 배경이면(모서리 alpha 0) 그대로 쓴다
  if (data[3] === 0 && data[(W - 1) * 4 + 3] === 0 && data[((H - 1) * W) * 4 + 3] === 0) {
    const bg = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] === 0) bg[i] = 1;
    return { data: Buffer.from(data), W, H, bg, alreadyTransparent: true };
  }
  const isWhite = (i) => {
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2];
    const mn = Math.min(r, g, b),
      mx = Math.max(r, g, b);
    return mn >= bgMin && mx - mn <= satMax;
  };
  // flood fill from borders
  const bg = new Uint8Array(n);
  const stack = [];
  for (let x = 0; x < W; x++) {
    stack.push(x, (H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    stack.push(y * W, y * W + W - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !isWhite(i)) continue;
    bg[i] = 1;
    const x = i % W,
      y = (i / W) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }
  // alpha: bg -> 0; edge pixels (touching bg) -> partial by whiteness, un-premultiply
  const out = Buffer.from(data);
  for (let i = 0; i < n; i++) {
    if (bg[i]) {
      out[i * 4 + 3] = 0;
      continue;
    }
    const x = i % W,
      y = (i / W) | 0;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (bg[yy * W + xx]) {
          edge = true;
          break;
        }
      }
    if (!edge) continue;
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2];
    const mn = Math.min(r, g, b);
    let a = Math.min(255, Math.round((255 - mn) * 1.5));
    if (a < 12) a = 0;
    if (a > 0 && a < 255) {
      const k = a / 255;
      out[i * 4] = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - k)) / k)));
      out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((g - 255 * (1 - k)) / k)));
      out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - k)) / k)));
    }
    out[i * 4 + 3] = a;
  }
  return { data: out, W, H, bg };
}

/* 연결 성분(8방향)을 찾고, 가까운 것끼리(merge px) 합쳐 bbox 목록을 돌려준다 */
export function components({ data, W, H }, { merge = 18, minArea = 400 } = {}) {
  const n = W * H;
  const seen = new Uint8Array(n);
  const boxes = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || data[i * 4 + 3] < (Number(process.env.ATH) || 40)) continue;
    let minX = W,
      minY = H,
      maxX = 0,
      maxY = 0,
      area = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % W,
        y = (j / W) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const k = yy * W + xx;
          if (!seen[k] && data[k * 4 + 3] >= (Number(process.env.ATH) || 40)) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    boxes.push({ x0: minX, y0: minY, x1: maxX, y1: maxY, area });
  }
  // merge nearby boxes
  let changed = true;
  while (changed) {
    changed = false;
    for (let a = 0; a < boxes.length && !changed; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a],
          B = boxes[b];
        if (A.x0 - merge <= B.x1 && B.x0 - merge <= A.x1 && A.y0 - merge <= B.y1 && B.y0 - merge <= A.y1) {
          boxes[a] = { x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1), area: A.area + B.area };
          boxes.splice(b, 1);
          changed = true;
          break;
        }
      }
  }
  return boxes.filter((b) => b.area >= minArea).map((b) => ({ ...b, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 }));
}

/* 행(row)으로 묶어 읽는 순서(위→아래, 왼→오른쪽)로 정렬 */
export function readingOrder(boxes, rowGap = 40) {
  const sorted = [...boxes].sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const b of sorted) {
    const row = rows.find((r) => Math.abs(r.cy - b.cy) < Math.max(rowGap, Math.min(r.h, b.h) * 0.5));
    if (row) {
      row.items.push(b);
      row.cy = (row.cy * (row.items.length - 1) + b.cy) / row.items.length;
      row.h = Math.max(row.h, b.h);
    } else rows.push({ cy: b.cy, h: b.h, items: [b] });
  }
  rows.sort((a, b) => a.cy - b.cy);
  for (const r of rows) r.items.sort((a, b) => a.cx - b.cx);
  return rows;
}

/* bbox 를 잘라 정사각(또는 주어진 비율) 캔버스 가운데에 놓고 PNG 저장 */
export async function exportBox(sheet, box, outFile, { size, pad = 0.06, square = true, maxSize } = {}) {
  const { data, W, H } = sheet;
  const crop = sharp(data, { raw: { width: W, height: H, channels: 4 } }).extract({ left: box.x0, top: box.y0, width: box.w, height: box.h });
  const buf = await crop.png().toBuffer();
  let side = Math.max(box.w, box.h);
  const padPx = Math.round(side * pad);
  let cw = square ? side + padPx * 2 : box.w + padPx * 2,
    ch = square ? side + padPx * 2 : box.h + padPx * 2;
  let img = sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: buf, left: Math.round((cw - box.w) / 2), top: Math.round((ch - box.h) / 2) },
  ]);
  let pngBuf = await img.png().toBuffer();
  if (size) pngBuf = await sharp(pngBuf).resize(size.w, size.h, { fit: "inside", withoutEnlargement: false }).png().toBuffer();
  else if (maxSize) pngBuf = await sharp(pngBuf).resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  await sharp(pngBuf).png({ compressionLevel: 9 }).toFile(outFile);
  const meta = await sharp(outFile).metadata();
  return { file: outFile, w: meta.width, h: meta.height };
}
