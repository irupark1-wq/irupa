// A1 공간 정합(PO-14): 배치 판정은 화면과 분리된 순수 함수다. 미리보기와 저장이 같은 판정을 쓴다.
// 이동 가능 여부는 장애물만 막는 것으로 계산한다. 폰이 잠시 서 있는 칸은 영구 장애물로 치지 않는다(PO-14 §3).
import { GRID, actorState } from "./life.js";

export const WALL_LIMIT = 30;
export const LAYOUT_OWNER = "local-owner";
// 화면 문구(PO-14 §4)와 1:1. 키는 저장 오류 코드 'layout.<reason>' 으로도 쓴다.
export const LAYOUT_REASONS = ["out_of_bounds", "overlap", "pawn_cell", "path_blocked", "wall_limit", "place_closed", "not_owner", "save_failed", "version_conflict"];

const key = (p) => p.x + "," + p.y;
const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID.width && y < GRID.height;

/** 저장본에서 폰들이 서 있는(또는 첫 tick 에 설 예정인) 칸. 방문 폰 포함. */
export function standingCells(state) {
  const life = state.life,
    list = [...state.pawns, ...(life.guest?.present ? [life.guest] : [])];
  return list.map((p, i) => {
    const a = life.actors[p.id] || actorState(i);
    return { id: p.id, x: a.x, y: a.y };
  });
}

/** 장애물만 막는 4방향 연결 영역. */
function reachableFrom(walls, start) {
  const blocked = new Set(walls.map(key)),
    seen = new Set([key(start)]),
    queue = [start];
  while (queue.length) {
    const p = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const n = { x: p.x + dx, y: p.y + dy },
        k = key(n);
      if (!inside(n.x, n.y) || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

/** 모든 폰과 열린 활동 지점이 한 영역으로 이어져 있는가. 막힌 지점 id 목록을 돌려준다. */
export function connectivity(places, walls, standing) {
  const targets = [...standing.map((s) => ({ ...s, kind: "pawn" })), ...places.filter((p) => !p.blocked).map((p) => ({ id: p.id, x: p.x, y: p.y, kind: "place" }))];
  if (!targets.length) return { ok: true, isolated: [] };
  const wallSet = new Set(walls.map(key)),
    origin = standing[0] || targets[0],
    area = reachableFrom(walls, origin);
  const isolated = targets.filter((t) => wallSet.has(key(t)) || !area.has(key(t))).map((t) => t.id);
  return { ok: isolated.length === 0, isolated };
}

/**
 * 배치 한 건을 판정한다. 상태는 바꾸지 않는다.
 * edit: {kind:'move', id, x, y} | {kind:'wall', x, y}(있으면 치우기, 없으면 놓기) | {kind:'close', id, blocked}
 */
export function evaluateLayout(life, edit, standing) {
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  if (!edit || typeof edit !== "object") return fail("out_of_bounds");
  if (edit.kind === "close") {
    const place = life.places.find((p) => p.id === edit.id);
    if (!place || typeof edit.blocked !== "boolean") return fail("out_of_bounds");
    return { ok: true, action: edit.blocked ? "close" : "open", places: life.places.map((p) => (p.id === edit.id ? { ...p, blocked: edit.blocked } : p)), walls: life.walls };
  }
  if (!inside(edit.x, edit.y)) return fail("out_of_bounds");
  const cell = key(edit),
    onPawn = standing.some((s) => key(s) === cell);
  if (edit.kind === "wall") {
    const index = life.walls.findIndex((w) => key(w) === cell);
    if (index >= 0) return { ok: true, action: "remove_wall", places: life.places, walls: life.walls.filter((_, i) => i !== index) };
    if (life.places.some((p) => key(p) === cell)) return fail("overlap");
    if (onPawn) return fail("pawn_cell");
    if (life.walls.length >= WALL_LIMIT) return fail("wall_limit");
    const walls = [...life.walls, { x: edit.x, y: edit.y }],
      link = connectivity(life.places, walls, standing);
    if (!link.ok) return fail("path_blocked", { isolated: link.isolated });
    return { ok: true, action: "add_wall", places: life.places, walls };
  }
  if (edit.kind === "move") {
    const place = life.places.find((p) => p.id === edit.id);
    if (!place) return fail("out_of_bounds");
    if (key(place) === cell) return { ok: true, action: "same", places: life.places, walls: life.walls };
    if (life.places.some((p) => p.id !== edit.id && key(p) === cell) || life.walls.some((w) => key(w) === cell)) return fail("overlap");
    if (onPawn) return fail("pawn_cell");
    const places = life.places.map((p) => (p.id === edit.id ? { ...p, x: edit.x, y: edit.y } : p)),
      link = connectivity(places, life.walls, standing);
    if (!link.ok) return fail("path_blocked", { isolated: link.isolated });
    return { ok: true, action: "move", places, walls: life.walls };
  }
  return fail("out_of_bounds");
}

/**
 * 장소가 옮겨지거나 닫히면 그 장소에서 하던 활동을 완료 없이 멈춘다(PO-14 §3, A1-03·06).
 * 이동 중인 폰은 옮긴 경우 다음 tick 에 새 경로를 계산하고, 닫힌 경우 지금 멈춘다.
 * 사건·관계 효과는 만들지 않는다. 멈춘 폰 id 목록을 돌려준다.
 */
export function releasePlace(life, placeId, closing) {
  const stopped = [];
  const stop = (id, a) => {
    a.mode = "idle";
    a.goal = null;
    a.partner = null;
    a.until = 0;
    a.cooldown = life.tick + 3;
    a.reason = "장소가 바뀌어 다른 일을 찾아요";
    stopped.push(id);
  };
  for (const [id, a] of Object.entries(life.actors)) {
    if (a.goal?.place !== placeId) continue;
    if (a.mode === "moving" && !closing) continue;
    if (!["moving", "working", "resting", "waiting"].includes(a.mode)) continue;
    const partner = a.partner && life.actors[a.partner];
    stop(id, a);
    if (partner && partner.partner === id) stop(Object.keys(life.actors).find((k) => life.actors[k] === partner), partner);
  }
  return stopped;
}
