import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadSheet, components, readingOrder, exportBox } from "./lib.mjs";
process.env.ATH = "160";
const REF = "C:/claude_blender/donggeuran/docs/reference/design-20261013-d/";
const OUT = "C:/claude_blender/donggeuran/prototype/assets/";
const ensure = (f) => fs.mkdirSync(path.dirname(f), { recursive: true });
const results = [];
async function save(sheet, box, rel, opts = {}) {
  const file = OUT + rel;
  ensure(file);
  const r = await exportBox(sheet, box, file, opts);
  results.push(rel + " " + r.w + "x" + r.h);
}
const union = (...bs) => {
  const x0 = Math.min(...bs.map((b) => b.x0)),
    y0 = Math.min(...bs.map((b) => b.y0)),
    x1 = Math.max(...bs.map((b) => b.x1)),
    y1 = Math.max(...bs.map((b) => b.y1));
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const box = (x0, y0, w, h) => ({ x0, y0, x1: x0 + w - 1, y1: y0 + h - 1, w, h });
async function rowsOf(name, merge = 6) {
  const sheet = await loadSheet(REF + name + ".webp");
  return { sheet, rows: readingOrder(components(sheet, { merge })).map((r) => r.items) };
}

/* 02: 방문 머리 그림 / 기록 8 / 관계 3 / 기타 아이콘 */
{
  const { sheet, rows } = await rowsOf("02_visit_log_relation_misc");
  await save(sheet, rows[0][0], "ui/visit-header.png", { square: false, pad: 0.02 });
  const r1 = rows[1];
  const logNames = ["move", "completed", "declined", "blocked", "accepted", "cancelled"];
  for (let i = 0; i < 6; i++) await save(sheet, r1[i], "log/" + logNames[i] + ".png");
  await save(sheet, union(...r1.slice(6, 10)), "log/limited.png");
  await save(sheet, r1[10], "log/activity.png");
  const r2 = rows[2];
  await save(sheet, r2[0], "relation/affection.png");
  await save(sheet, r2[1], "relation/trust.png");
  await save(sheet, union(...r2.slice(2)), "relation/conflict.png");
  const r3 = rows[3];
  const misc = ["door", "exit", "link-off", "refresh", "cloud-up", "folder", "compare"];
  for (let i = 0; i < 7; i++) await save(sheet, r3[i], "ui/icon/" + misc[i] + ".png");
  await save(sheet, box(1190, 762, 142, 135), "ui/icon/hammer.png");
  await save(sheet, r3[8], "ui/icon/gear.png");
}
/* 03: 패널 / 탭 알약 / 링 / 탭·필요·동작 아이콘 */
{
  const { sheet, rows } = await rowsOf("03_panel_tabs_icons");
  await save(sheet, rows[0][0], "ui/tab-on.png", { square: false, pad: 0.02 });
  await save(sheet, rows[0][1], "ui/tab-off.png", { square: false, pad: 0.02 });
  await save(sheet, rows[1][0], "ui/panel.png", { square: false, pad: 0.01 });
  await save(sheet, rows[1][1], "ui/avatar-ring.png");
  for (const [i, n] of ["tab-heart", "tab-chat", "tab-book"].entries()) await save(sheet, rows[1][2 + i], "ui/icon/" + n + ".png");
  for (const [i, n] of ["rest", "activity", "social"].entries()) await save(sheet, rows[2][i], "needs/" + n + ".png");
  for (const [i, n] of ["wand", "book-open", "edit", "close"].entries()) await save(sheet, rows[3][i], "ui/icon/" + n + ".png");
}
/* 04: 매트 3 / 화분 상자 / 이름표 */
{
  const { sheet, rows } = await rowsOf("04_furniture_label");
  for (const [i, n] of ["social", "rest", "work"].entries()) await save(sheet, rows[0][i], "furniture/" + n + ".png", { square: false, pad: 0.03 });
  await save(sheet, rows[1][0], "furniture/wall.png", { square: false, pad: 0.03 });
  await save(sheet, rows[1][1], "ui/label.png", { square: false, pad: 0.02 });
}
/* 05: 빈 말풍선 / 행동 말풍선 8 */
{
  const { sheet, rows } = await rowsOf("05_bubbles");
  await save(sheet, rows[0][0], "ui/bubble.png", { square: false, pad: 0.02 });
  const names = ["idle", "moving", "working", "resting", "talking", "assisting", "repairing", "waiting"];
  const all = [...rows[1], ...rows[2]];
  for (let i = 0; i < 8; i++) await save(sheet, all[i], "bubbles/" + names[i] + ".png");
}
/* 06: 제목 명판 / 빈 명판 / 해·달·일시정지·재생 */
{
  const { sheet, rows } = await rowsOf("06_hud");
  await save(sheet, rows[0][0], "brand/title.png", { square: false, pad: 0.02 });
  await save(sheet, rows[1][0], "ui/hud/plate.png", { square: false, pad: 0.02 });
  for (const [i, n] of ["sun", "moon", "pause", "play"].entries()) await save(sheet, rows[2][i], "ui/hud/" + n + ".png");
}
/* 07: 타일 2 / 나무 판 / 독 아이콘 7 */
{
  const { sheet, rows } = await rowsOf("07_dock");
  await save(sheet, rows[0][0], "ui/dock/tile.png");
  await save(sheet, rows[0][1], "ui/dock/tile-primary.png");
  await save(sheet, rows[0][2], "ui/dock/bar.png", { square: false, pad: 0.02 });
  for (const [i, n] of ["pawns", "journal", "relation", "create", "arrange", "visit", "more"].entries()) await save(sheet, rows[1][i], "ui/dock/" + n + ".png");
}
/* 배경 2장: webp → png */
ensure(OUT + "background/x");
await sharp(REF + "01_bg_landscape.webp").png({ compressionLevel: 9 }).toFile(OUT + "background/room-landscape.png");
await sharp(REF + "08_bg_portrait.webp").png({ compressionLevel: 9 }).toFile(OUT + "background/room-portrait.png");
results.push("background/room-landscape.png", "background/room-portrait.png");
console.log(results.join("\n"));
