import { loadSheet, components, readingOrder } from "./lib.mjs";
const REF = "C:/claude_blender/donggeuran/docs/reference/design-20261013-d/";
const sheets = ["02_visit_log_relation_misc", "03_panel_tabs_icons", "04_furniture_label", "05_bubbles", "06_hud", "07_dock"];
for (const name of sheets) {
  const sheet = await loadSheet(REF + name + ".webp");
  const boxes = components(sheet, { merge: Number(process.argv[2] || 18) });
  const rows = readingOrder(boxes);
  console.log("==", name, sheet.W + "x" + sheet.H, "components:", boxes.length);
  rows.forEach((r, i) => console.log("  row" + i, "cy=" + Math.round(r.cy), r.items.map((b) => `[${b.x0},${b.y0} ${b.w}x${b.h}]`).join(" ")));
}
