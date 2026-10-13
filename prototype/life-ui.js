import { actorsFor, GRID, roomOf, roomSpace } from "./life.js";
import { t as T, tLife } from "./i18n.js";
import { memoryView } from "./store.js";
import { memoryText } from "./relation-text.js";
import { speechTurns, toneOf, lineFor } from "./dialogue.js";
const $ = (id) => document.getElementById(id);
const SLOTS = ["back_hair", "base", "eyes_pair", "mouth", "front_hair", "frame_accessory"];
const MODE = {
  idle: { text: T("주변을 살펴봐요"), icon: "i-sparkle" },
  moving: { text: T("이동하고 있어요"), icon: "i-steps" },
  working: { text: T("만들고 있어요"), icon: "i-hammer" },
  resting: { text: T("쉬고 있어요"), icon: "i-zzz" },
  talking: { text: T("대화하고 있어요"), icon: "i-chat" },
  listening: { text: T("이야기를 듣고 있어요"), icon: "i-chat" },
  assisting: { text: T("함께 만들고 있어요"), icon: "i-hammer" },
  repairing: { text: T("함께 문제를 보완해요"), icon: "i-wrench" },
  repairListening: { text: T("보완 기록을 확인해요"), icon: "i-book" },
  waiting: { text: T("잠깐 기다려요"), icon: "i-clock" },
  recording: { text: T("작업 결과를 적고 있어요"), icon: "i-book" },
  reading: { text: T("기록판을 읽고 있어요"), icon: "i-book" },
  correcting: { text: T("기록을 다시 확인해요"), icon: "i-wrench" },
  checking: { text: T("기록 확인을 부탁해요"), icon: "i-chat" },
};
const A = "./assets/";
// DES-11: reading·recording 은 폰이 실제로 기록판을 읽거나 적는 동안에만(관계창 열람·기술 저장에는 쓰지 않음)
const BUBBLE_KEY = { listening: "talking", repairListening: "repairing", correcting: "repairing", checking: "talking" };
const pic = (src, className) => {
  const i = document.createElement("img");
  i.src = src;
  i.alt = "";
  i.draggable = false;
  if (className) i.className = className;
  return i;
};
const LOG_ICON = { move: "i-steps", completed: "i-check", declined: "i-x", blocked: "i-block", accepted: "i-chat", cancelled: "i-refresh", limited: "i-eye-off", activity: "i-sparkle" };
const AXIS_NAMES = { fairness_sensitivity: T("공정성 민감도"), closeness_orientation: T("친밀 지향"), risk_aversion: T("위험 회피") };
const TOPIC = { conversation: T("이야기를 나눴어요"), help: T("도움을 주고받았어요"), credit_attribution: T("공로를 확인했어요") };
/* 방향별 빈 방 배경과 12×8 이동 바닥 사각형(DES-04 asset-manifest 의 walkableFloorRect, 픽셀 → 비율).
   가구는 그림에 없고 칸 위에 따로 놓는다. 파일이 없으면 temp(기존 그림)로 대체한다. */
const floorRect = (iw, ih, x, y, w, h) => ({ x: x / iw, y: y / ih, w: w / iw, h: h / ih });
const BACKGROUNDS = {
  // DES-06: 벽 장식이 들어간 배경. 이동 바닥 사각형은 빈 방과 픽셀 단위로 같다. lights = 빛나는 곳 중심(그림 픽셀, 밤 조명 효과 위치)
  // view = 카메라가 함께 보여 주려는 구역(바닥 + 창·시계·액자가 있는 벽). 바닥은 항상 전부, 벽은 가능한 만큼
  portrait: { src: "./assets/background/room-portrait-decorated.png", floor: floorRect(941, 1672, 140, 660, 660, 840), view: floorRect(941, 1672, 120, 300, 700, 1200), lights: [{ x: 470, y: 425, r: 150 }, { x: 470, y: 175, r: 110 }] },
  landscape: { src: "./assets/background/room-landscape-decorated.png", floor: floorRect(1672, 941, 138, 560, 1392, 304), view: floorRect(1672, 941, 130, 140, 1410, 724), lights: [{ x: 440, y: 300, r: 190 }, { x: 836, y: 238, r: 120 }] },
  temp: { src: "./assets/game1-cozy-room-v1.png", floor: { x: 0.07, y: 0.38, w: 0.86, h: 0.55 } },
  // 아늑한 방(PO-ROOM-001): 이전 배경. 이동 바닥은 침대·책장·책상 아래 열린 마루(장식은 바닥 칸 밖). 김디자인 검수 전 초안
  cozy_portrait: { src: "./assets/legacy-room/background-room-portrait.png", floor: floorRect(941, 1672, 70, 450, 810, 610), view: floorRect(941, 1672, 0, 60, 941, 1140), lights: [{ x: 200, y: 272, r: 120 }, { x: 718, y: 160, r: 110 }] },
  cozy_landscape: { src: "./assets/legacy-room/background-room-landscape.png", floor: floorRect(1672, 941, 330, 375, 1190, 385), view: floorRect(1672, 941, 0, 0, 1672, 860), lights: [{ x: 350, y: 182, r: 130 }, { x: 1100, y: 30, r: 120 }] },
};
const ROOM_NAME = { living: T("생활방"), cozy: T("아늑한 방") };
const MOVE_TEXT = {
  ok: T("여기로 옮길 수 있어요."),
  fixed_decor: T("그림 속 장식 자리라 설 수 없어요."),
  overlap: T("여기는 다른 물건이 있어요. 다른 칸을 골라 주세요."),
  pawn_cell: T("다른 폰이 있는 칸이에요. 다른 칸을 골라 주세요."),
  path_blocked: T("여기서는 길이 막혀요. 다른 칸을 골라 주세요."),
  out_of_bounds: T("방 안을 골라 주세요."),
  same_room: T("이미 이 방에 있어요."),
  not_own_pawn: T("내 폰만 옮길 수 있어요."),
  no_room: T("폰이 설 자리가 없어요. 빈칸과 통로를 만들어 주세요."),
  failed: T("옮기지 못했어요. 원래 방과 자리는 그대로예요. 다시 시도해 주세요."),
};

/* 가구 조각: 160×192 로 자른 사본, 바닥 접점 앵커 (80,180), 명목 바닥폭 138px (DES-04 D2) */
const FURNITURE = { w: 160, h: 192, ax: 80, ay: 180, foot: 138 };
/* PO-14 §4 안내 문구. 키 = layout.js 판정 이유 */
const LAYOUT_TEXT = {
  ok: T("여기에 놓을 수 있어요."),
  remove: T("이 장애물을 치울 수 있어요."),
  same: T("지금 있는 자리예요."),
  out_of_bounds: T("방 안에 놓아 주세요."),
  overlap: T("여기는 다른 물건이 있어요. 다른 칸을 골라 주세요."),
  pawn_cell: T("폰이 있는 칸이에요. 다른 칸을 골라 주세요."),
  path_blocked: T("길이 막혀요. 폰이 지나갈 칸을 남겨 주세요."),
  wall_limit: T("장애물은 30칸까지 놓을 수 있어요. 다른 장애물을 먼저 지워 주세요."),
  fixed_decor: T("그림 속 장식 자리라 쓸 수 없어요."),
  place_closed: T("이 장소는 지금 닫혀 있어요."),
  not_owner: T("이 월드는 주인만 배치를 바꿀 수 있어요."),
  save_failed: T("배치를 저장하지 못했어요. 다시 시도하거나 취소해 주세요."),
  version_conflict: T("배치가 다른 곳에서 바뀌었어요. 최신 배치를 확인해 주세요."),
};
const LAYOUT_ICON = { ok: "place-ok", remove: "place-ok", same: "place-ok", out_of_bounds: "place-overlap", overlap: "place-overlap", pawn_cell: "place-overlap", path_blocked: "place-blocked", wall_limit: "place-blocked" };
/* 로컬 시험용 시점: ?viewer=visitor 이면 방문자 시점(A1-11). 온라인 권한 검증이 아니다. */
const VIEWER = new URLSearchParams(location.search).get("viewer") === "visitor" ? "local-visitor-owner" : "local-owner";
const DRAFT_KEY = "game1-layout-draft";
const node = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};
const icon = (name, className) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  if (className) s.setAttribute("class", className);
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "#" + name);
  s.append(u);
  return s;
};
const gbtn = (label, iconName, className = "") => {
  const b = node("button", "gbtn " + className);
  b.type = "button";
  if (iconName) b.append(icon(iconName));
  b.append(node("span", "", label));
  return b;
};
/* 생활 tick(초) → 게임 내 시각. 1 tick = 1분, 08:00 시작 */
function clockOf(tick) {
  const minutes = 8 * 60 + tick;
  const day = Math.floor(minutes / 1440) + 1,
    h = Math.floor(minutes / 60) % 24,
    m = minutes % 60;
  return { text: String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"), day, h, night: h < 6 || h >= 19, tod: h < 6 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : h < 19 ? "dusk" : "night" };
}
const isMobile = () => (document.getElementById("scene")?.clientWidth || innerWidth) <= 820;

export function mountLifeUI({ store, paint, image, edit, notify, openRelations, showWorld, closeSheets }) {
  let selected = null,
    speed = 1,
    rendering = false,
    faulted = false,
    layout = false,
    tool = null, // 'game1-rest' | 'game1-work' | 'game1-social' | 'wall'
    draft = null, // 확정 전 미리보기 {tool,x,y,version,verdict,error}
    hover = null,
    tab = "now",
    showAllLogs = false,
    detailOpen = !isMobile(),
    viewRoom = "living", // 지금 보고 있는 방(보기 전환은 폰을 옮기지 않는다)
    moveDraft = null; // 폰 옮기기 진행 중 {pawnId, room, x, y, verdict}
  let lastReserve = "";
  const pawnViews = new Map(); // 폰 id → 계속 쓰는 화면 요소
  const cache = new Map(),
    previousPositions = new Map();
  let lastSeq = null;
  /* 관계가 바뀐 순간을 숫자가 아니라 장면 위 이펙트로 보여 준다 */
  function spawnEffects(state) {
    const logs = state.life.logs;
    const seqOf = (l) => Number(String(l.id).split("-").pop());
    if (lastSeq === null) {
      lastSeq = logs.length ? seqOf(logs.at(-1)) : 0;
      return;
    }
    for (const l of logs) {
      if (seqOf(l) <= lastSeq) continue;
      const changes = (l.changes || []).filter((c) => state.pawns.some((p) => p.id === c.from));
      for (const c of changes) {
        const el = [...$("lifeActors").children].find((b) => b.dataset.id === c.from);
        if (!el) continue;
        const fx = node("span", "fx" + (c.affection + c.trust > 0 ? "" : " cool"));
        fx.append(pic(A + "relation/affection.png"), node("span", "", (c.affection + c.trust > 0 ? "+" : "") + (c.affection || c.trust)));
        fx.style.left = el.style.left;
        fx.style.top = "calc(" + el.style.top + " - " + getComputedStyle(stage).getPropertyValue("--pawn") + ")";
        stage.append(fx);
        setTimeout(() => fx.remove(), 1700);
      }
    }
    lastSeq = logs.length ? Math.max(lastSeq, seqOf(logs.at(-1))) : lastSeq;
  }

  /* ───────── 대화 말풍선 (PO-REQ-001 §3) ─────────
     저장이 확정된 생활 기록에서만 만든다. 처음 그릴 때까지의 기록은 말하지 않는다(새로고침·정정으로 지난 대화를 다시 말하지 않음).
     표시 시간은 실제 시간(생활 속도와 분리), 폰마다 대기열 최대 2개, 다른 말풍선과 겹치면 한 칸 위로. */
  let speechSeq = null;
  const speechQueue = new Map();
  const speechOn = () => {
    try {
      return localStorage.getItem("game1-speech") !== "off";
    } catch {
      return true;
    }
  };
  function speakerTone(state, speaker, listener) {
    const p = state.pawns.find((x) => x.id === speaker);
    if (!p || !state.pawns.some((x) => x.id === listener)) return "plain"; // 방문 폰이 끼면 관계 정보 없이 일반 말투
    try {
      return toneOf(p.trait.axis_values, store.projection(speaker, listener).scores);
    } catch {
      return "plain";
    }
  }
  const spoken = (state, log, turn) => T(lineFor(turn.situation, speakerTone(state, turn.speaker, turn.listener), log.id + "|" + turn.speaker));
  function queueSpeech(state) {
    const logs = state.life.logs,
      seqOf = (l) => Number(String(l.id).split("-").pop());
    if (speechSeq === null) {
      speechSeq = logs.length ? seqOf(logs.at(-1)) : 0;
      return;
    }
    const now = performance.now();
    for (const l of logs) {
      const seq = seqOf(l);
      if (seq <= speechSeq) continue;
      speechSeq = Math.max(speechSeq, seq);
      if (!speechOn() || document.hidden) continue;
      speechTurns(l).forEach((turn, i) => {
        const q = speechQueue.get(turn.speaker) || [];
        q.push({ text: spoken(state, l, turn), at: now + i * 700 });
        while (q.length > 2) q.shift();
        speechQueue.set(turn.speaker, q);
      });
    }
    pumpSpeech();
  }
  function pumpSpeech() {
    const now = performance.now();
    for (const [id, q] of speechQueue) {
      const v = pawnViews.get(id);
      if (!v) {
        speechQueue.delete(id);
        continue;
      }
      if ((v.speechUntil && now < v.speechUntil) || v.speech?.classList.contains("held")) continue;
      const next = q[0];
      if (!next) continue;
      if (next.at > now) {
        setTimeout(pumpSpeech, next.at - now + 10);
        continue;
      }
      q.shift();
      showSpeech(v, next.text);
    }
  }
  function placeSpeech(v) {
    if (!v.speech) return;
    v.speech.style.transition = v.el.style.transition;
    v.speech.style.left = v.el.style.left;
    v.speech.style.top = v.el.style.top;
  }
  function showSpeech(v, text) {
    v.speech?.remove();
    const b = node("span", "speech", text);
    b.setAttribute("role", "button");
    b.tabIndex = 0;
    b.title = T("누르면 읽는 동안 생활을 멈춰요");
    b.onclick = (e) => {
      e.stopPropagation();
      clearTimeout(v.speechTimer);
      b.classList.add("held"); // 읽는 동안 멈춘 말풍선은 ▶ 로 다시 시작할 때까지 남긴다
      if (store.life().paused) return;
      try {
        store.lifePause(crypto.randomUUID(), true);
      } catch {}
      notify(T("읽는 동안 멈췄어요. ▶ 를 누르면 다시 시작해요."));
      render();
    };
    speechLayer.append(b);
    v.speech = b;
    placeSpeech(v);
    const dur = Math.min(4500, Math.max(2200, 1800 + 70 * text.length));
    v.speechUntil = performance.now() + dur;
    requestAnimationFrame(() => {
      const r = b.getBoundingClientRect(),
        sc = scene.getBoundingClientRect();
      for (const o of speechLayer.children) {
        if (o === b) continue;
        const q = o.getBoundingClientRect();
        if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) {
          b.classList.add("lift");
          break;
        }
      }
      const dx = r.left < sc.left + 4 ? sc.left + 4 - r.left : r.right > sc.right - 4 ? sc.right - 4 - r.right : 0;
      if (dx) b.style.setProperty("--nudge", Math.round(dx) + "px");
    });
    v.speechTimer = setTimeout(() => hideSpeech(v, b), dur);
  }
  function hideSpeech(v, b) {
    {
      if (v.speech !== b) return;
      b.classList.add("out");
      setTimeout(() => {
        if (v.speech === b) {
          b.remove();
          v.speech = null;
        }
        pumpSpeech();
      }, 260);
    }
  }
  function releaseHeldSpeech() {
    for (const v of pawnViews.values())
      if (v.speech?.classList.contains("held")) {
        const b = v.speech;
        b.classList.remove("held");
        v.speechTimer = setTimeout(() => hideSpeech(v, b), 1200);
      }
  }

  /* ───────── 카메라: 바닥 영역이 화면에 들어오도록 배경을 배치 ───────── */
  const art = $("sceneArt"),
    scene = $("scene"),
    stage = $("lifeStage");
  const speechLayer = node("div", "speech-layer");
  speechLayer.setAttribute("aria-live", "polite");
  stage.append(speechLayer);
  const missing = new Set();
  art.addEventListener("error", () => {
    missing.add(art.dataset.key);
    art.dataset.key = "";
    frameScene();
  });
  art.addEventListener("load", () => frameScene());
  function frameScene() {
    const W = scene.clientWidth,
      H = scene.clientHeight;
    if (!W || !H) return;
    const orientation = W > H ? "landscape" : "portrait";
    scene.dataset.orientation = orientation;
    const key = viewRoom === "cozy" ? "cozy_" + orientation : missing.has(orientation) ? "temp" : orientation,
      bg = BACKGROUNDS[key],
      FLOOR = bg.floor;
    if (art.dataset.key !== key) {
      art.dataset.key = key;
      art.src = bg.src;
      $("sceneBlur").src = bg.src;
      const page = document.querySelector(".page-blur");
      if (page) page.src = bg.src;
      return; // load/error 뒤에 다시 들어온다
    }
    if (!art.complete || !art.naturalWidth) return;
    const iw = art.naturalWidth,
      ih = art.naturalHeight;
    art.style.width = iw + "px";
    art.style.height = ih + "px";
    /* 바닥 12×8 전체가 HUD 와 독(배치 중이면 트레이) 사이에 들어오는 가장 큰 배율.
       바닥이 잘리지 않는 것이 먼저, 배경이 화면을 덮는 것은 그다음이다. */
    const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dock-h")) || 96,
      hudTop = Math.max(64, Math.round(document.querySelector(".hud-top").getBoundingClientRect().bottom - scene.getBoundingClientRect().top + 6)); // 좁은 화면에서 방 전환이 두 번째 줄로 내려가면 그만큼 비운다
    let right = 0,
      bottom = dock + 28;
    // 배치 트레이·폰 상세 패널이 떠 있으면 그 자리를 비켜서 바닥 전체가 보이게 한다
    for (const panel of [$("arrangePanel"), $("pawnDetails"), $("roomMovePanel")]) {
      if (panel.hidden || !panel.offsetParent) continue;
      if (panel.offsetWidth < W * 0.6) right = Math.max(right, W - panel.offsetLeft + 8);
      else bottom = Math.max(bottom, H - panel.offsetTop + 8);
    }
    const availW = Math.max(120, W - right - 16),
      availH = Math.max(120, H - hudTop - bottom),
      VIEW = bg.view || FLOOR,
      floorFit = Math.min(availW / (FLOOR.w * iw), availH / (FLOOR.h * ih), 1.25),
      // 벽 장식까지 보이게: 바닥+벽 구역이 HUD 아래가 아니라 화면 위끝~독 사이에 들어오는 배율. 바닥만 맞춘 배율보다 최대 15% 작게까지
      viewFit = Math.min(availW / (VIEW.w * iw), (H - bottom) / (VIEW.h * ih), 1.25),
      // 단, 바닥 한 줄이 16px 아래로 작아지면(폰 가로) 벽보다 바닥 조작을 우선한다
      scale = Math.max(Math.min(floorFit, viewFit), floorFit * 0.85, Math.min(floorFit, (16 * GRID.height) / (FLOOR.h * ih)));
    const imgW = iw * scale,
      imgH = ih * scale,
      clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    let left = (W - right) / 2 - (FLOOR.x + FLOOR.w / 2) * imgW;
    if (imgW >= W) left = clamp(left, W - imgW, 0);
    left = clamp(left, 8 - FLOOR.x * imgW, W - right - 8 - (FLOOR.x + FLOOR.w) * imgW);
    const viewH = VIEW.h * imgH,
      wanted = Math.min(0, (H - bottom - viewH) / 2 - VIEW.y * imgH),
      top = clamp(wanted, hudTop - FLOOR.y * imgH, H - bottom - (FLOOR.y + FLOOR.h) * imgH);
    scene.classList.toggle("diorama", imgW < W - 40 || top > 4 || top + imgH < H - dock);
    art.style.transform = "translate(" + left + "px," + top + "px) scale(" + scale + ")";
    // 밤 조명: 그림 속 창·조명 위치에 맞춘다(배경과 같은 변환). 광원 정보가 없는 배경은 CSS 기본 위치
    document.querySelectorAll(".glow").forEach((g, i) => {
      const L = bg.lights?.[i];
      g.classList.toggle("anchored", !!L);
      if (!L) return;
      const d = L.r * 2 * scale;
      g.style.left = left + L.x * scale - d / 2 + "px";
      g.style.top = top + L.y * scale - d / 2 + "px";
      g.style.width = g.style.height = d + "px";
    });
    stage.style.left = left + FLOOR.x * imgW + "px";
    stage.style.top = top + FLOOR.y * imgH + "px";
    stage.style.width = FLOOR.w * imgW + "px";
    stage.style.height = FLOOR.h * imgH + "px";
    // 폰 크기: 칸 너비의 1.8배, 단 행 높이의 3.2배를 넘지 않게(납작한 가로 바닥에서 위 행 폰이 HUD 를 덮지 않게). 48~132px
    const cell = (FLOOR.w * imgW) / GRID.width,
      row = (FLOOR.h * imgH) / GRID.height,
      pawn = Math.round(Math.max(48, Math.min(132, cell * 1.8, row * 3.2)));
    stage.style.setProperty("--pawn", pawn + "px");
    // 가구 표시 배율: 바닥폭 138px 을 칸 너비에 맞추되, 폰보다 지나치게 작아지지 않게(충돌은 1칸 그대로)
    stage.style.setProperty("--fs", (Math.max(cell, pawn * 0.8) / FURNITURE.foot).toFixed(4));
    stage.dataset.cell = cell.toFixed(1);
    stage.dataset.row = row.toFixed(1);
    stage.classList.toggle("compact", row < 24);
    for (const v of pawnViews.values()) v.pos = null;
  }
  new ResizeObserver(frameScene).observe(scene);
  frameScene();

  /* ───────── 연출(fx) ───────── */
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motes = $("motes");
  for (let i = 0; i < 14; i++) {
    const m = node("span", "mote");
    m.style.left = 8 + Math.random() * 84 + "%";
    m.style.top = 20 + Math.random() * 60 + "%";
    m.style.setProperty("--d", 7 + Math.random() * 7 + "s");
    m.style.setProperty("--delay", -Math.random() * 10 + "s");
    m.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
    m.style.setProperty("--dy", -(60 + Math.random() * 80).toFixed(0) + "px");
    motes.append(m);
  }
  const pct = (x, y) => [((x + 0.5) / GRID.width) * 100 + "%", ((y + 0.5) / GRID.height) * 100 + "%"];
  function floatAt(x, y, cls, content, opts = {}) {
    if (reduced()) return;
    const f = node("span", "float " + cls);
    if (content instanceof Node) f.append(content);
    else f.textContent = content;
    const [l, t] = pct(x, y);
    f.style.left = "calc(" + l + " + " + (opts.dx || 0) + "px)";
    f.style.top = "calc(" + t + " - " + getComputedStyle(stage).getPropertyValue("--pawn") + " * " + (opts.up ?? 0.9) + ")";
    f.style.setProperty("--dx", (Math.random() * 40 - 20).toFixed(0) + "px");
    f.style.setProperty("--d", (opts.d || 1.8) + "s");
    stage.append(f);
    setTimeout(() => f.remove(), (opts.d || 1.8) * 1000 + 100);
  }
  function puffAt(x, y) {
    if (reduced()) return;
    for (let i = 0; i < 2; i++) {
      const p = node("span", "puff");
      const [l, t] = pct(x, y);
      p.style.left = "calc(" + l + " + " + (Math.random() * 16 - 8).toFixed(0) + "px)";
      p.style.top = "calc(" + t + " - 6px)";
      p.style.setProperty("--dx", (i ? 12 : -12) + "px");
      stage.append(p);
      setTimeout(() => p.remove(), 800);
    }
  }
  let shownDay = null,
    lastClockText = "",
    unreadLogs = false,
    lastLogCount = null;
  const prevModes = new Map();
  function dayBanner(day) {
    if (reduced()) return;
    const b = node("div", "day-banner");
    b.append(node("b", "", T("Day {n}", { n: day })), node("small", "", T("새로운 하루가 시작됐어요")));
    scene.append(b);
    setTimeout(() => b.remove(), 2700);
  }
  $("openJournal").addEventListener("click", () => {
    unreadLogs = false;
    $("openJournal").querySelector(".dot")?.remove();
  });
  document.querySelectorAll(".dock-btn").forEach((b) =>
    b.addEventListener("click", () => {
      b.classList.remove("bump");
      void b.offsetWidth;
      b.classList.add("bump");
    }),
  );

  async function artwork(pawn) {
    const key = pawn.id + "-" + (pawn.appearance_version || 0);
    if (cache.has(key)) return cache.get(key);
    const imgs = {};
    for (const s of SLOTS) imgs[s] = await image(pawn.appearance?.layers[s] || "./assets/six_layers/" + s + "_neutral.png");
    const art = {
      imgs,
      transforms: pawn.appearance?.transforms || Object.fromEntries(SLOTS.map((s) => [s, { x: 0, y: 0, rotation: 0, scale: 1, visible: true }])),
    };
    cache.set(key, art);
    return art;
  }
  const face = async (pawn, size, className) => {
    const c = node("canvas", className);
    c.width = c.height = size;
    c.setAttribute("aria-label", pawn.name + (pawn.local_double ? T(" · 방문 폰") : ""));
    const art = await artwork(pawn);
    paint(c, art.imgs, art.transforms);
    return c;
  };
  const allOf = (s) => [...s.pawns, ...(s.life.guest ? [s.life.guest] : [])];
  const actorName = (s, id) => T(allOf(s).find((p) => p.id === id)?.name || T("폰"));
  const modeOf = (a) => MODE[a?.mode] || MODE.idle;

  /* 최근 6tick 안의 거절(대상 폰 쪽)·길막(이동하던 폰 쪽)을 말풍선으로. 관계 효과와 무관한 표시다. */
  const SIGN_TEXT = { declined: T("지금은 혼자 있고 싶어요"), blocked: T("길이 막혔어요") };
  function recentSign(life, id) {
    for (let i = life.logs.length - 1; i >= 0; i--) {
      const l = life.logs[i];
      if (life.tick - l.tick > 6) break;
      // DES-10/12: 거절 아이콘(혼자 있고 싶음)은 공개된 사유가 정말 그것일 때만. 다른 거절은 아이콘 없이 대사·일지 글로만 보인다
      if (l.kind === "declined" && l.target === id && String(l.text).startsWith("잠깐 혼자 있고 싶어요")) return "declined";
      if (l.kind === "blocked" && l.actor === id) return "blocked";
    }
    return null;
  }

  /* ───────── 공간: 가구·장애물·배치 미리보기 (A1) ───────── */
  const cellPos = (el, x, y) => {
    el.style.left = ((x + 0.5) / GRID.width) * 100 + "%";
    el.style.top = ((y + 0.5) / GRID.height) * 100 + "%";
    el.style.zIndex = 4 + y; // 앵커(바닥 접점) y 로 가림 순서
  };
  /* 가구 그림(사용자 결정 2026-10-13): 예전 버전의 러그·매트·작업대·화분 상자를 다시 쓴다(assets/legacy-room).
     flat = 바닥에 깔리는 것(러그·매트) → 폰이 그 위에 올라서 보인다. 판정은 그대로 1칸 */
  const FURNITURE_ART = { rest: { src: "legacy-room/furniture-rest.png", flat: true }, social: { src: "legacy-room/furniture-social.png", flat: true }, work: { src: "legacy-room/furniture-work.png" }, wall: { src: "legacy-room/furniture-wall.png" } };
  const furnitureSrc = (kind) => A + (FURNITURE_ART[kind] || FURNITURE_ART.rest).src;
  const furnitureArt = (kind, cls = "") => pic(furnitureSrc(kind), "stage-art " + (FURNITURE_ART[kind]?.flat ? "flat " : "") + cls);
  function unreachablePlaces(life) {
    const standing = Object.values(life.actors);
    if (!standing.length) return new Set();
    return new Set(isolatedOf(life, standing));
  }
  function isolatedOf(life, standing) {
    const walls = new Set(life.walls.map((w) => w.x + "," + w.y)),
      seen = new Set([standing[0].x + "," + standing[0].y]),
      queue = [standing[0]];
    while (queue.length) {
      const p = queue.shift();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const n = { x: p.x + dx, y: p.y + dy },
          k = n.x + "," + n.y;
        if (n.x < 0 || n.y < 0 || n.x >= GRID.width || n.y >= GRID.height || walls.has(k) || seen.has(k)) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    return life.places.filter((p) => !p.blocked && !seen.has(p.x + "," + p.y)).map((p) => p.id);
  }
  function renderSpace(life) {
    const root = $("lifePlaces");
    root.replaceChildren();
    const moving = draft && draft.tool !== "wall" ? draft.tool : null,
      isolated = unreachablePlaces(life);
    for (const p of life.places) {
      const b = node("button", "life-place " + p.kind + (p.blocked ? " blocked" : "") + (layout && tool === p.id ? " selected" : "") + (moving === p.id && draft.verdict?.ok && draft.verdict.action === "move" ? " moving-from" : ""));
      b.type = "button";
      b.append(furnitureArt(p.kind), node("span", "label", T(p.label)));
      if (p.blocked) b.append(node("span", "state-chip", T("닫힘")));
      else if (isolated.has(p.id)) {
        const chip = node("span", "state-chip blocked");
        chip.append(pic(A + "ui/icon/place-blocked.png"), node("span", "", T("길 막힘")));
        b.append(chip);
      }
      cellPos(b, p.x, p.y);
      b.title = T(p.label) + (p.blocked ? " · " + LAYOUT_TEXT.place_closed : isolated.has(p.id) ? " · " + T("길 막힘") : "");
      b.setAttribute("aria-label", b.title);
      // 가구는 배치 모드(독의 "배치")에서만 누를 수 있다. 평소에는 폰을 누르려다 가구가 눌리지 않게 한다
      b.tabIndex = layout ? 0 : -1;
      b.onclick = () => {
        if (!layout) return;
        chooseTool(p.id);
      };
      root.append(b);
    }
    for (const w of life.walls) {
      const removing = draft?.tool === "wall" && draft.verdict?.action === "remove_wall" && draft.x === w.x && draft.y === w.y;
      const b = node("button", "life-wall" + (removing ? " removing" : ""));
      b.type = "button";
      b.append(furnitureArt("wall"));
      b.setAttribute("aria-label", T("장애물 ") + w.x + "," + w.y);
      b.tabIndex = layout ? 0 : -1;
      cellPos(b, w.x, w.y);
      b.onclick = () => {
        if (!layout) return;
        tool = "wall";
        previewAt("wall", w.x, w.y, true);
      };
      root.append(b);
    }
    const show = draft || (hover && tool ? { tool, ...hover, verdict: store.previewLayout(editOf(tool, hover.x, hover.y)) } : null);
    if (!layout || !show) return;
    const v = show.verdict,
      state = show.error ? show.error : v.ok ? (v.action === "remove_wall" ? "remove" : v.action === "same" ? "same" : "ok") : v.reason,
      good = !show.error && v.ok;
    const outline = node("i", "cell-preview " + (good ? "ok" : "bad"));
    cellPos(outline, show.x, show.y);
    outline.style.zIndex = 30;
    root.append(outline);
    if (show.tool !== "wall" && good && v.action === "move") {
      const ghost = node("span", "life-place ghost");
      ghost.append(furnitureArt(life.places.find((p) => p.id === show.tool).kind));
      cellPos(ghost, show.x, show.y);
      root.append(ghost);
    } else if (show.tool === "wall" && good && v.action === "add_wall") {
      const ghost = node("span", "life-wall ghost");
      ghost.append(furnitureArt("wall"));
      cellPos(ghost, show.x, show.y);
      root.append(ghost);
    }
    const badge = pic(A + "ui/icon/" + (LAYOUT_ICON[state] || "place-blocked") + ".png", "cell-badge");
    cellPos(badge, show.x, show.y);
    badge.style.zIndex = 31;
    root.append(badge);
  }

  /* ───────── 장면 ───────── */
  let rerender = false;
  async function render() {
    if (rendering) {
      rerender = true; // 그리는 도중 들어온 요청은 버리지 않고 끝난 뒤 한 번 더 그린다
      return;
    }
    rendering = true;
    try {
      const state = store.read(),
        sp = roomSpace(state.life, viewRoom),
        life = { ...state.life, places: sp.places, walls: sp.userWalls }, // 보고 있는 방의 가구·장애물(고정 장식은 그림에 있음)
        everyone = actorsFor(state),
        all = everyone.filter((p) => roomOf(state.life.actors[p.id]) === viewRoom);
      // 방 전환 버튼: 방별 폰 수·빈 방 안내
      const counts = { living: 0, cozy: 0 };
      for (const p of everyone) counts[roomOf(state.life.actors[p.id])]++;
      $("roomCountLiving").textContent = counts.living;
      $("roomCountCozy").textContent = counts.cozy;
      document.querySelectorAll("#roomSwitch [data-room]").forEach((b) => {
        b.classList.toggle("on", b.dataset.room === viewRoom);
        b.setAttribute("aria-pressed", String(b.dataset.room === viewRoom));
      });
      $("roomEmpty").hidden = counts[viewRoom] > 0 || layout || !!moveDraft;
      selected ??= state.pawns[0]?.id;
      const clock = clockOf(life.tick);
      if (clock.text !== lastClockText) {
        $("lifeClock").textContent = clock.text;
        $("lifeClock").classList.remove("tick");
        void $("lifeClock").offsetWidth;
        $("lifeClock").classList.add("tick");
        lastClockText = clock.text;
      }
      scene.dataset.tod = clock.tod;
      if (shownDay !== null && clock.day !== shownDay) dayBanner(clock.day);
      shownDay = clock.day;
      if (lastLogCount !== null && life.logs.length !== lastLogCount && $("sheet-journal").hidden && !unreadLogs) {
        unreadLogs = true;
        if (!$("openJournal").querySelector(".dot")) $("openJournal").append(node("i", "dot"));
      }
      lastLogCount = life.logs.length;
      $("lifeDay").textContent = "Day " + clock.day;
      $("clockIcon").src = A + "ui/hud/" + (clock.night ? "moon" : "sun") + ".png";
      $("lifeClock").parentElement.title = T("생활 ") + life.tick + T("초 · ") + (life.paused ? T("일시정지") : T("자율 생활 중"));
      const pause = $("pauseLife");
      pause.classList.toggle("paused", life.paused);
      pause.firstElementChild.src = A + "ui/hud/" + (life.paused ? "play" : "pause") + ".png";
      pause.setAttribute("aria-label", life.paused ? T("생활 재개") : T("일시정지"));
      pause.title = life.paused ? T("생활 재개") : T("일시정지");
      stage.classList.toggle("life-paused", life.paused); // 일시정지 중에는 폰 걷기·통통 움직임도 멈춘다
      stage.classList.toggle("placing", layout);
      stage.classList.toggle("tool", layout && !!tool);
      $("arrangePanel").hidden = !layout;
      $("arrangeLife").classList.toggle("on", layout);
      pause.disabled = layout;
      renderSpace(life);
      /* 폰은 한 번 만든 요소를 계속 쓴다(매 tick 새로 만들면 숨쉬기·말풍선 애니메이션이 매번 처음부터 다시 시작해 어색하다).
         한 tick 에 최대 한 칸만 움직이므로, tick 간격과 같은 시간 동안 일정한 속도로 이어 걷게 한다. */
      const reducedMotion = reduced(),
        stepMs = Math.round(1000 / speed),
        now = performance.now(),
        alive = new Set();
      stage.style.setProperty("--step", stepMs + "ms");
      for (const p of all) {
        alive.add(p.id);
        const a = life.actors[p.id] || { x: 3 + state.pawns.indexOf(p) * 2, y: 6, mode: "idle" },
          art = await artwork(p),
          artKey = p.id + "-" + (p.appearance_version || 0);
        let v = pawnViews.get(p.id);
        if (!v) {
          const el = node("button", "life-pawn");
          el.type = "button";
          el.dataset.id = p.id;
          const say = node("span", "say"),
            canvas = node("canvas"),
            name = node("span", "name");
          canvas.width = canvas.height = 160;
          el.append(say, canvas, name);
          el.onclick = () => {
            selected = p.id;
            detailOpen = true;
            if (layout) toggleLayout(false);
            else render();
          };
          $("lifeActors").append(el);
          v = { el, say, canvas, name, bubble: null, bubbleKey: "", artKey: "", pos: null, mode: null, landUntil: 0, lean: 0 };
          pawnViews.set(p.id, v);
        }
        if (v.artKey !== artKey) {
          paint(v.canvas, art.imgs, art.transforms);
          v.artKey = artKey;
        }
        // 위치: 한 칸 이동이면 tick 간격 동안 직선 등속, 그보다 크게 바뀌면(입장·복구·배치) 바로 옮긴다
        const prev = v.pos,
          moved = !!prev && (prev.x !== a.x || prev.y !== a.y),
          step = !!prev && Math.abs(prev.x - a.x) + Math.abs(prev.y - a.y) === 1;
        v.el.style.transition = reducedMotion ? "none" : !step ? "transform 250ms ease" : "left " + stepMs + "ms linear, top " + stepMs + "ms linear, transform 250ms ease";
        v.el.style.left = ((a.x + 0.5) / GRID.width) * 100 + "%";
        v.el.style.top = ((a.y + 0.5) / GRID.height) * 100 + "%";
        if (moved) v.lean = a.x > prev.x ? 1 : a.x < prev.x ? -1 : v.lean; // 옆으로 걸을 때만 기울기 방향을 바꾼다
        v.el.style.setProperty("--lean", (a.mode === "moving" && !life.paused ? v.lean * 6 : 0) + "deg");
        // 가구 칸에서 활동 중이면 가구 바로 뒤(한 단계 낮은 z)로, 조금 위로 올려 가구가 보이게 한다
        const placeHere = life.places.find((q) => q.x === a.x && q.y === a.y),
          atPlace = !!placeHere,
          onRug = !!FURNITURE_ART[placeHere?.kind]?.flat; // 러그·매트 위에서는 폰이 그림 앞에
        // 아래로 걸어갈 때는 도착 행 기준, 위로 걸어갈 때는 출발 행 기준으로 앞뒤를 정해 가구를 뚫고 지나가 보이지 않게 한다
        const row = prev && step ? Math.max(prev.y, a.y) : a.y;
        v.el.style.zIndex = atPlace && !onRug ? 3 + a.y : onRug ? 5 + a.y : 4 + row;
        // 멈춰 선 순간에만 착지 눌림 한 번, 걷기 시작·멈춤에만 먼지(매 칸마다 일지 않게)
        if (v.mode === "moving" && a.mode !== "moving") {
          v.landUntil = now + 450;
          puffAt(a.x, a.y);
        }
        if (v.mode !== null && v.mode !== "moving" && a.mode === "moving" && prev) puffAt(prev.x, prev.y);
        v.el.className = "life-pawn " + a.mode + (p.local_double ? " visitor" : "") + (p.id === selected ? " chosen" : "") + (atPlace ? " at-place" : "") + (now < v.landUntil ? " land" : "");
        if (now < v.landUntil) setTimeout(() => v.el.classList.remove("land"), v.landUntil - now + 20);
        // 말풍선: 바뀔 때만 새로 붙여 '뽁' 등장 효과가 한 번만 나오게
        const recent = a.mode === "idle" ? recentSign(life, p.id) : null,
          bubbleKey = recent || BUBBLE_KEY[a.mode] || (MODE[a.mode] ? a.mode : "idle");
        if (bubbleKey !== v.bubbleKey) {
          const bubble = pic(A + "bubbles/" + bubbleKey + ".png", "bubble " + (recent || a.mode));
          if (v.bubble) v.bubble.replaceWith(bubble);
          else v.say.after(bubble);
          v.bubble = bubble;
          v.bubbleKey = bubbleKey;
        }
        v.bubble.title = recent ? SIGN_TEXT[recent] : modeOf(a).text;
        if (v.say.textContent !== modeOf(a).text) v.say.textContent = modeOf(a).text;
        if (v.name.textContent !== T(p.name)) v.name.textContent = T(p.name);
        v.el.setAttribute("aria-label", T(p.name) + " · " + modeOf(a).text + T(" · 상세 보기"));
        v.pos = { x: a.x, y: a.y };
        v.mode = a.mode;
        placeSpeech(v);
        if (!life.paused && !document.hidden) {
          // 그리기 횟수가 속도만큼 늘었으니 확률을 나눠 초당 빈도는 그대로
          const r = Math.random() * speed;
          if (a.mode === "resting" && r < 0.35) floatAt(a.x, a.y, "zz", "z", { dx: 18, up: 1.05, d: 2.2 });
          else if ((a.mode === "talking" || a.mode === "listening") && r < 0.3) floatAt(a.x, a.y, "note", r < 0.15 ? "♪" : pic(A + "relation/affection.png"), { dx: -14, up: 1.1 });
          else if ((a.mode === "working" || a.mode === "assisting" || a.mode === "repairing") && r < 0.28) floatAt(a.x, a.y, "spark", "✦", { dx: 16, up: 0.8, d: 1.3 });
        }
      }
      for (const [id, v] of pawnViews)
        if (!alive.has(id)) {
          v.speech?.remove();
          v.el.remove();
          pawnViews.delete(id);
        }
      spawnEffects(state);
      if (!life.paused) releaseHeldSpeech();
      queueSpeech(state);
      await renderDetails(state, everyone);
      const reserve = $("pawnDetails").hidden + "|" + $("arrangePanel").hidden + "|" + $("roomMovePanel").hidden + "|" + viewRoom;
      if (reserve !== lastReserve) {
        lastReserve = reserve;
        frameScene();
      }
      renderLogs(state);
      await renderChange(state);
      await renderRelationList(state, everyone);
      await renderVisit(state, everyone);
    } finally {
      rendering = false;
      if (rerender) {
        rerender = false;
        render();
      }
    }
  }

  /* ───────── 폰 상세 패널 ───────── */
  function selectPawn(id) {
    selected = id;
    detailOpen = true;
    render();
  }
  async function renderDetails(state, all) {
    const root = $("pawnDetails");
    root.replaceChildren();
    const p = all.find((p) => p.id === selected) || state.pawns[0];
    root.hidden = !p || !detailOpen || layout || !!moveDraft;
    if (root.hidden) return;
    selected = p.id;
    const a = state.life.actors[p.id],
      mode = a ? modeOf(a) : { text: T("새 공간을 둘러보고 있어요"), icon: "i-sparkle" };

    const top = node("div", "detail-top");
    const title = node("div");
    title.append(node("h3", "", T(p.name)), node("small", "", p.local_double ? T("방문 폰 · 로컬 테스트") : T("내 폰")));
    const close = node("button", "close");
    close.type = "button";
    close.setAttribute("aria-label", T("상세 닫기"));
    close.append(pic(A + "ui/icon/close.png"));
    close.onclick = () => {
      detailOpen = false;
      render();
    };
    const avatar = node("span", "avatar");
    avatar.append(await face(p, 160), pic(A + "ui/avatar-ring.png"));
    top.append(avatar, title, close);
    root.append(top);

    if (all.length > 1) {
      const sw = node("div", "switcher");
      sw.append(node("span", "lbl", T("다른 폰으로 전환")));
      for (const q of all) {
        const b = node("button", q.id === p.id ? "on" : "");
        b.type = "button";
        b.title = T(q.name);
        b.setAttribute("aria-label", T(q.name) + T(T(" 보기")));
        b.append(await face(q, 96));
        b.onclick = () => selectPawn(q.id);
        sw.append(b);
      }
      root.append(sw);
    }

    const tabs = node("div", "tabs");
    tabs.setAttribute("role", "tablist");
    const list = p.local_double
      ? [["now", T("현재 상태"), "tab-heart"]]
      : [["now", T("현재 상태"), "tab-heart"], ["rel", T("관계 요약"), "tab-chat"], ["mem", T("기억"), "tab-book"]];
    if (!list.some(([k]) => k === tab)) tab = "now";
    for (const [k, label, ic] of list) {
      const b = node("button", k === tab ? "on" : "");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(k === tab));
      b.append(pic(A + "ui/icon/" + ic + ".png"), node("span", "", label));
      b.onclick = () => {
        tab = k;
        render();
      };
      tabs.append(b);
    }
    root.append(tabs);

    const body = node("div", "tab-body");
    if (tab === "now") {
      const now = node("div", "block");
      now.append(node("h4", "", T("현재 행동")));
      const row = node("div", "now");
      const ico = pic(A + "bubbles/" + (a ? BUBBLE_KEY[a.mode] || (MODE[a.mode] ? a.mode : "idle") : "idle") + ".png", "ico");
      const txt = node("div");
      txt.append(node("strong", "", mode.text + "."));
      if (a && a.until > state.life.tick && Number.isFinite(a.started)) {
        const total = Math.max(1, a.until - a.started),
          done = Math.min(total, state.life.tick - a.started);
        const bar = node("div", "bar sky");
        const fill = node("i");
        fill.style.width = (done / total) * 100 + "%";
        bar.append(fill);
        txt.append(bar, node("small", "", T(T("남은 시간 {n}초"), { n: a.until - state.life.tick })));
      } else if (a && a.mode !== "idle" && !p.local_double && a.reason) txt.append(node("small", "", tLife(a.reason)));
      row.append(ico, txt);
      now.append(row);
      body.append(now);
      if (!p.local_double) {
        const needs = node("div", "block");
        needs.append(node("h4", "", T("필요")));
        const rest = 100 - (a?.tired ?? 0),
          feel = [];
        if (rest < 35) feel.push(T("많이 피곤해요"));
        else if (rest < 60) feel.push(T("조금 쉬고 싶어요"));
        if ((a?.social ?? 0) > 70) feel.push(T("누군가와 이야기하고 싶어요"));
        if ((a?.activity ?? 0) > 70) feel.push(T("손을 움직이고 싶어요"));
        needs.append(node("p", "need-sum", feel.length ? feel.join(", ") + "." : T("지금은 마음이 편안해요.")));
        const grid = node("div", "needs");
        for (const [label, value, tone, key] of [
          [T("휴식"), 100 - (a?.tired ?? 0), "pink", "rest"],
          [T("활동"), a?.activity ?? 0, "sky", "activity"],
          [T("사회"), a?.social ?? 0, "mint", "social"],
        ]) {
          const r = node("div", "need");
          const bar = node("div", "bar " + tone);
          const fill = node("i");
          fill.style.width = Math.max(0, Math.min(100, value)) + "%";
          bar.append(fill);
          r.append(pic(A + "needs/" + key + ".png"), node("span", "", label), bar, node("b", "", Math.round(value) + "%"));
          grid.append(r);
        }
        needs.append(grid);
        body.append(needs);
        const actions = node("div", "detail-actions");
        const editButton = gbtn(T("얼굴·성격 꾸미기"), null);
        editButton.prepend(pic(A + "ui/icon/wand.png"));
        editButton.onclick = () => edit(p);
        const other = all.find((q) => q.id !== p.id);
        const relButton = gbtn(T("관계·기억 자세히"), null);
        relButton.prepend(pic(A + "ui/icon/book-open.png"));
        relButton.disabled = !other;
        relButton.onclick = () => other && openRelations(p.id, other.id);
        // 다른 방으로 옮기기(PO-ROOM-001 §2): 내 폰만. 방문 폰은 옮기지 않는다
        const here = roomOf(state.life.actors[p.id]),
          there = here === "cozy" ? "living" : "cozy",
          moveButton = gbtn(T("{room}으로 옮기기", { room: ROOM_NAME[there] }), null);
        moveButton.prepend(pic(A + "ui/icon/place-ok.png"));
        moveButton.onclick = () => startRoomMove(p.id, there);
        actions.append(editButton, relButton, moveButton);
        if (here !== viewRoom) {
          const go = gbtn(T("{room} 보기", { room: ROOM_NAME[here] }), null);
          go.onclick = () => setViewRoom(here);
          actions.append(go);
        }
        body.append(actions);
        const traitBlock = node("div", "block");
        traitBlock.append(node("h4", "", T("성격")));
        const trows = node("div", "trait-rows");
        for (const [axis, value] of Object.entries(p.trait.axis_values)) {
          const r = node("div", "trait-row");
          const lvl = node("span", "lvl");
          const n = value === "high" ? 3 : value === "medium" ? 2 : 1;
          for (let i = 1; i <= 3; i++) lvl.append(node("i", i <= n ? "on" : ""));
          r.append(node("span", "", AXIS_NAMES[axis] || axis), lvl);
          trows.append(r);
        }
        traitBlock.append(trows);
        body.append(traitBlock);
      } else body.append(node("p", "hint note", T("로컬 방문 폰이에요. 공개된 현재 행동만 볼 수 있고 외형·성격·비공개 관계는 수정하거나 조회하지 않아요.")));
    } else if (tab === "rel") {
      const block = node("div", "block");
      block.append(node("h4", "", T("본인 방향 관계")));
      const others = all.filter((q) => q.id !== p.id);
      if (!others.length) block.append(node("p", "empty", T("아직 함께 지내는 폰이 없어요.")));
      for (const q of others) block.append(await relRow(state, p, q));
      body.append(block);
    } else if (tab === "mem") {
      const block = node("div", "block");
      block.append(node("h4", "", T("확인된 기억")));
      const rows = state.memories.filter((m) => m.from === p.id && m.known).slice(-8).reverse();
      if (!rows.length) block.append(node("p", "empty", T("아직 남은 기억이 없어요. 함께 지내면 차곡차곡 쌓여요.")));
      for (const m of rows) {
        const r = node("div", "mem-row");
        const t = node("div");
        // PO-15 §5: 사실 / 해석 / 사유 / 해결을 따로 보여 준다(해당 없는 항목은 생략)
        const mt = memoryText(memoryView(m), (id) => actorName(state, id));
        t.append(node("span", "mem-fact", mt.fact), node("small", "mem-interp", mt.interpretation));
        if (mt.reason) t.append(node("small", "mem-reason", mt.reason));
        if (mt.resolution) t.append(node("small", "mem-resolution", mt.resolution));
        r.append(icon("i-book"), t);
        block.append(r);
      }
      body.append(block);
    } else if (tab === "trait") {
      const block = node("div", "block");
      block.append(node("h4", "", T("성격 세 축")));
      const rows = node("div", "trait-rows");
      for (const [axis, value] of Object.entries(p.trait.axis_values)) {
        const r = node("div", "trait-row");
        const lvl = node("span", "lvl");
        const n = value === "high" ? 3 : value === "medium" ? 2 : 1;
        for (let i = 1; i <= 3; i++) lvl.append(node("i", i <= n ? "on" : ""));
        r.append(node("span", "", AXIS_NAMES[axis] || axis), lvl);
        rows.append(r);
      }
      block.append(rows);
      body.append(block, node("p", "hint", T("행동 경향의 참고값이에요. 실제 선택은 상황·기억·관계에 따라 달라집니다.")));
    } else if (tab === "info") {
      const block = node("div", "block");
      const kv = node("dl", "kv");
      for (const [k, v] of [
        [T("이름"), p.name],
        [T("폰 ID"), p.id],
        [T("외형 버전"), String(p.appearance_version ?? 1)],
        [T("현재 칸"), a ? a.x + ", " + a.y : "-"],
        [T("생활 시간"), state.life.tick + T("초")],
      ])
        kv.append(node("dt", "", k), node("dd", "", v));
      block.append(kv);
      body.append(block);
    }
    root.append(body);
  }
  async function relRow(state, p, q) {
    const dto = store.projection(p.id, q.id);
    const r = node("div", "rel-row");
    const t = node("div");
    t.append(node("strong", "", T(q.name) + (q.local_double ? T(" · 방문") : "")), node("small", "", dto.tags.length ? dto.tags.map((t) => t.label).join(" · ") : T("아직 설명이 확정되지 않았어요")));
    const mini = node("div", "mini");
    const chip = (cls, key, text) => {
      const s = node("span", cls);
      s.append(pic(A + "relation/" + key + ".png"), document.createTextNode(text));
      return s;
    };
    mini.append(chip("aff", "affection", T("애정 ") + dto.scores.affection), chip("tru", "trust", T("신뢰 ") + dto.scores.trust));
    if (dto.scores.conflict) mini.append(chip("con", "conflict", T("갈등 ") + dto.scores.conflict));
    r.append(await face(q, 96), t, mini);
    r.onclick = () => openRelations(p.id, q.id);
    return r;
  }

  /* ───────── 기록 팝업 ───────── */
  const expandedLogs = new Set();
  function renderLogs(state) {
    const root = $("lifeLog");
    root.replaceChildren();
    const raw = state.life.logs.slice(showAllLogs ? -120 : -15).reverse(),
      pairOf = (l) => [l.actor, l.target].sort().join("|"),
      rows = [];
    // 반복된 중립 대화(점수 변화 없음)는 한 줄로 묶어 "몇 번" 으로 보여 준다. 실패·하락처럼 보이지 않게 생활 문장으로.
    for (const l of raw) {
      const prev = rows.at(-1);
      // 묶음 경계(DES-07): 날짜·상대가 바뀌거나 사이에 다른 일(작업·정정·실패 등)이 끼면 새 줄. 저장 실패 시에는 생활이 멈춰 새 기록이 없다.
      if (l.kind === "neutral" && prev?.kind === "neutral" && pairOf(prev) === pairOf(l) && clockOf(prev.tick).day === clockOf(l.tick).day) {
        prev.repeat = (prev.repeat || 1) + 1;
        prev.members.push(l);
      } else rows.push({ ...l, members: [l] });
    }
    let lastDay = null;
    for (const entry of rows) {
      const day = clockOf(entry.tick).day;
      if (day !== lastDay) {
        root.append(node("li", "log-day", "Day " + day));
        lastDay = day;
      }
      const li = node("li", "log-row " + entry.kind);
      const t = node("time", "", clockOf(entry.tick).text);
      t.title = entry.tick + T("초");
      const ico = pic(A + "log/" + (LOG_ICON[entry.kind] ? entry.kind : "activity") + ".png", "ico");
      const txt = node("div");
      txt.append(node("strong", "", actorName(state, entry.actor) + " · " + tLife(entry.text)));
      const subs = [];
      if (entry.target) subs.push(T(T("{name}와(과) 함께"), { name: actorName(state, entry.target) }));
      if (entry.repeat > 1) subs.push(T("오늘 {n}번", { n: entry.repeat }));
      const turn = speechTurns(entry)[0];
      if (turn) subs.push("“" + spoken(state, entry, turn) + "”");
      for (const c of (entry.changes || []).filter((c) => state.pawns.some((p) => p.id === c.from)))
        subs.push(actorName(state, c.from) + "→" + actorName(state, c.to) + T(" 애정 +") + c.affection + T(" · 신뢰 +") + c.trust);
      if (subs.length) {
        const s = node("small", "", subs.join(" · "));
        if (entry.changes?.length) s.classList.add("delta");
        txt.append(s);
      }
      li.append(t, ico, txt);
      root.append(li);
      if (entry.repeat > 1) {
        // 펼치기/접기: 묶인 대화의 시각과 실제 대사를 하나씩 본다(새 판정·새 기록 없음)
        const open = expandedLogs.has(entry.id),
          more = node("button", "log-more", open ? T("접기") : T("펼치기"));
        more.type = "button";
        more.setAttribute("aria-expanded", String(open));
        more.onclick = () => {
          if (open) expandedLogs.delete(entry.id);
          else expandedLogs.add(entry.id);
          renderLogs(store.read());
        };
        txt.append(more);
        if (open)
          for (const m of entry.members) {
            const turn = speechTurns(m)[0],
              sub = node("li", "log-row log-sub neutral");
            sub.append(node("time", "", clockOf(m.tick).text), node("span"), node("small", "", turn ? "“" + spoken(state, m, turn) + "”" : tLife(m.text)));
            root.append(sub);
          }
      }
    }
    if (!rows.length) root.append(node("li", "empty", T("작은 하루의 첫 기록을 기다리고 있어요.")));
    $("allLifeLogs").textContent = showAllLogs ? T("최근 기록만") : T("전체 기록");
    $("allLifeLogs").setAttribute("aria-pressed", String(showAllLogs));
    const selectedPawn = state.pawns.find((p) => p.id === selected);
    const memory = selectedPawn ? state.memories.filter((m) => m.from === selectedPawn.id && m.known).at(-1) : null;
    $("recentMemory").textContent = memory
      ? T(T("{name}의 최근 기억 · {text}"), { name: T(selectedPawn.name), text: (memory.description ? tLife(memory.description) : TOPIC[memory.topic] || T(T("확인한 사건이 있어요"))) + " · " + (memory.reason_known ? T(T("사유 확인")) : T(T("사유 미상"))) })
      : T("지금까지의 하루가 차곡차곡 기록돼요.");
  }
  $("allLifeLogs").onclick = () => {
    showAllLogs = !showAllLogs;
    renderLogs(store.read());
  };

  /* ───────── 관계 팝업 ───────── */
  async function renderChange(state) {
    const root = $("relationChange");
    root.replaceChildren();
    const entry = state.life.logs.findLast((l) => l.changes?.some((c) => state.pawns.some((p) => p.id === c.from)));
    if (!entry) {
      root.append(node("p", "empty", T("아직 관계 변화가 없어요. 폰들이 함께 지내면 자연스럽게 생겨요.")));
      return;
    }
    const c = entry.changes.find((c) => state.pawns.some((p) => p.id === c.from));
    const from = allOf(state).find((p) => p.id === c.from),
      to = allOf(state).find((p) => p.id === c.to);
    if (!from || !to) return;
    const head = node("div", "change-head");
    const arrow = node("span", "arrow");
    arrow.append(pic(A + "relation/affection.png"));
    head.append(await face(from, 128), arrow, await face(to, 128));
    const positive = c.affection + c.trust > 0;
    root.append(head, node("p", "change-text", T(from.name) + " → " + T(to.name) + " · " + (positive ? T("조금 더 친해졌어요") : T("변화가 있었어요")) + " · " + clockOf(entry.tick).text));
    const rows = node("div", "change-rows");
    for (const [label, v] of [[T("친밀"), c.affection], [T("신뢰"), c.trust]]) {
      const r = node("div", "change-row");
      r.append(pic(A + "relation/" + (label === T("친밀") ? "affection" : "trust") + ".png"), node("span", "", label), node("span", "v " + (v > 0 ? "up" : v < 0 ? "down" : "flat"), (v > 0 ? "+" : "") + v), node("span", v > 0 ? "up" : v < 0 ? "down" : "flat", v > 0 ? "▲" : v < 0 ? "▼" : "–"));
      rows.append(r);
    }
    root.append(rows);
  }
  async function renderRelationList(state, all) {
    const root = $("relationList");
    root.replaceChildren();
    root.append(node("h4", "", T("내 폰이 느끼는 관계")));
    let any = false;
    for (const p of state.pawns)
      for (const q of all)
        if (q.id !== p.id) {
          const row = await relRow(state, p, q);
          row.querySelector("strong").textContent = T(p.name) + " → " + T(q.name) + (q.local_double ? T(" · 방문") : "");
          root.append(row);
          any = true;
        }
    if (!any) root.append(node("p", "empty", T("폰이 둘 이상이면 서로의 관계가 생겨요.")));
  }

  /* ───────── 방문 팝업 ───────── */
  async function renderVisit(state, all) {
    const life = state.life,
      guest = life.guest;
    $("visitorPortraits").replaceChildren();
    if (guest?.present) $("visitorPortraits").append(await face(guest, 160));
    else $("visitorPortraits").append(node("span", "ghost"));
    const allowed = life.host_access && life.owner_scopes.activity_participation && life.owner_scopes.light_auto_events;
    const together = !!guest?.present && guest.connected && allowed && ["talking", "listening", "assisting", "repairing", "repairListening", "working"].includes(life.actors[guest.id]?.mode);
    for (const li of $("visitDots").children)
      li.classList.toggle("on", li.dataset.k === "enter" ? !!guest?.present : li.dataset.k === "together" ? together : !!guest && !guest.present);
    $("hostAccess").checked = life.host_access;
    $("guestActivity").checked = life.owner_scopes.activity_participation;
    $("guestLight").checked = life.owner_scopes.light_auto_events;
    $("visitorState").textContent = !allowed
      ? T("허용 범위 밖이라 방문 활동을 진행하지 않아요.")
      : !guest?.present
        ? T("아직 방문 중인 폰이 없어요. 루미를 초대해 보세요.")
        : guest.connected
          ? T("루미가 같은 공간에서 함께 머무는 중이에요.")
          : T("루미의 연결이 잠시 끊겼어요. 행동을 멈추고 자리를 비워요.");
    $("visitEnter").disabled = !!guest?.present;
    for (const id of ["visitLeave", "visitDisconnect", "visitReconnect"]) $(id).disabled = !guest?.present;
  }

  /* ───────── 폰 목록 팝업 ───────── */
  async function renderList() {
    const state = store.read(),
      root = $("pawnGrid");
    root.replaceChildren();
    if (!state.pawns.length) root.append(node("p", "empty", T("아직 폰이 없어요. 새 폰을 만들어 보세요.")));
    for (const p of state.pawns) {
      const tile = node("div", "pawn-tile");
      const a = state.life.actors[p.id];
      tile.append(await face(p, 240), node("strong", "", T(p.name)), node("small", "", a ? modeOf(a).text : T("새 공간을 둘러보고 있어요")));
      const row = node("div", "chips");
      const see = gbtn(T("보기"), "i-face", "gbtn-sm gbtn-blue");
      see.onclick = () => {
        selected = p.id;
        detailOpen = true;
        closeSheets();
        showWorld();
      };
      const ed = gbtn(T("꾸미기"), "i-brush", "gbtn-sm");
      ed.onclick = () => edit(p);
      row.append(see, ed);
      tile.append(row);
      root.append(tile);
    }
  }

  /* ───────── 배치 조작 (A1 · PO-14 §3): 고르기 → 미리보기 → 놓기/취소 ───────── */
  const editOf = (t, x, y) => (t === "wall" ? { kind: "wall", x, y, room: viewRoom } : { kind: "move", id: t, x, y, room: viewRoom });
  const reasonOf = (e) => {
    const m = String(e?.message || "");
    if (m.startsWith("layout.")) return m.slice(7);
    if (m === "save.version_conflict") return "version_conflict";
    return "save_failed";
  };
  function saveDraftForReload() {
    try {
      if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ tool: draft.tool, x: draft.x, y: draft.y }));
    } catch {}
  }
  function startLayout(placeId) {
    if (VIEWER !== "local-owner") {
      notify(LAYOUT_TEXT.not_owner);
      return;
    }
    layout = true;
    if (!store.life().paused) {
      try {
        store.lifePause(crypto.randomUUID(), true);
      } catch {
        faulted = true;
      }
    }
    notify(T("배치하는 동안 생활을 멈춰요. 끝낸 뒤 ▶ 를 눌러 다시 시작해 주세요."));
    // 바닥 한 줄이 24px 보다 낮으면(폰 가로 등) 칸 판을 펼쳐 둔다. 사용자가 접으면 그대로 둔다
    if (stage.classList.contains("compact")) $("boardWrap").open = true;
    chooseTool(placeId || null);
  }
  function endLayout() {
    layout = false;
    $("boardFloat").hidden = true;
    tool = null;
    draft = null;
    hover = null;
    render().then(frameScene);
    notify(T("배치를 마쳤어요. ▶ 를 누르면 생활이 다시 시작돼요."));
  }
  function toggleLayout(force) {
    const next = typeof force === "boolean" ? force : !layout;
    if (next && !layout) startLayout();
    else if (!next && layout) endLayout();
  }
  function chooseTool(t) {
    tool = t;
    draft = null;
    hover = null;
    syncPanel();
    render().then(frameScene);
  }
  function previewAt(t, x, y, pin) {
    const verdict = store.previewLayout(editOf(t, x, y));
    if (pin) draft = { tool: t, x, y, version: store.layoutVersion(viewRoom), verdict, error: null };
    else hover = { x, y };
    syncPanel();
    render();
  }
  function syncPanel() {
    const life = store.life(),
      place = roomSpace(life, viewRoom).places.find((p) => p.id === tool);
    document.querySelectorAll("#placeTray [data-place]").forEach((b) => {
      const on = roomPlaceId(b.dataset.place) === tool;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    $("placeBlockedRow").hidden = !place;
    if (place) $("placeBlocked").checked = place.blocked;
    $("arrangeHint").textContent = !tool
      ? T("옮길 가구나 장애물을 고른 뒤 바닥 칸을 누르세요. 놓기 전에 미리 보여 드려요.")
      : tool === "wall"
        ? T("장애물을 놓을 칸이나 치울 장애물을 누르세요.")
        : T("{name}을(를) 옮길 칸을 누르세요.", { name: T(place.label) }) + (place.blocked ? " " + LAYOUT_TEXT.place_closed : "");
    renderBoard();
    const show = draft;
    $("arrangePreview").hidden = !show;
    $("previewConfirm").disabled = !show || !!(!show.error && !show.verdict.ok) || show.verdict?.action === "same";
    $("previewCancel").disabled = !show;
    $("previewConfirm").querySelector("span").textContent = show?.error === "save_failed" ? T("다시 시도") : show?.error === "version_conflict" ? T("최신 배치 보기") : show?.verdict?.action === "remove_wall" ? T("치우기") : T("여기에 놓기");
    if (!show) return;
    const v = show.verdict,
      state = show.error || (v.ok ? (v.action === "remove_wall" ? "remove" : v.action === "same" ? "same" : "ok") : v.reason);
    $("previewIcon").src = A + "ui/icon/" + (LAYOUT_ICON[state] || "place-blocked") + ".png";
    $("previewText").textContent = LAYOUT_TEXT[state] || LAYOUT_TEXT.save_failed;
    $("arrangePreview").className = "arrange-preview " + (!show.error && v.ok ? "ok" : "bad");
  }
  /* 칸 판(PO-DEC-005, A1-10): 폰 가로처럼 바닥 칸이 작아 손가락으로 고르기 어려울 때 쓰는 큰 판.
     칸 하나를 누르는 것은 바닥 칸을 누르는 것과 같다(같은 미리보기·같은 판정·같은 확정). 판 자체는 아무것도 저장하지 않는다. */
  const BOARD_IMG = { rest: "rest", work: "work", social: "social" };
  /** 폰 가로(낮은 가로 화면)에서 배치 중이면 칸 판을 패널 밖 바닥 자리(#boardFloat)로 옮겨 크게 띄운다.
      게임 틀 왼쪽 끝 ~ 패널 사이에 가운데 맞추고 칸 크기를 24~32px 로 정한다. 그 밖에는 패널 안(칸 판으로 고르기)으로 돌려놓는다. */
  $("scene")?.addEventListener("scroll", (e) => {
    e.currentTarget.scrollTop = 0;
    e.currentTarget.scrollLeft = 0;
  });
  const SHORT_LANDSCAPE = window.matchMedia("(orientation: landscape) and (max-height: 520px)");
  function placeBoard(board) {
    const float = $("boardFloat"),
      floating = layout && SHORT_LANDSCAPE.matches;
    float.hidden = !floating;
    if (!floating) {
      if (board.parentElement !== $("boardWrap")) $("boardWrap").insertBefore(board, $("boardWrap").querySelector(".board-legend"));
      board.style.removeProperty("--cell");
      float.style.left = "";
      return;
    }
    if (board.parentElement !== float) float.append(board);
    const game = $("game").getBoundingClientRect(),
      panel = $("arrangePanel").getBoundingClientRect(),
      room = panel.left - 8 - (game.left + 8),
      cell = Math.max(24, Math.min(32, Math.floor((room - 6 - 11) / 12))),
      width = cell * 12 + 11 + 6;
    board.style.setProperty("--cell", cell + "px");
    float.style.left = Math.round(8 + Math.max(0, (room - width) / 2)) + "px";
  }
  window.addEventListener("resize", () => layout && renderBoard());
  SHORT_LANDSCAPE.addEventListener?.("change", () => layout && renderBoard());
  function renderBoard() {
    const board = $("cellBoard");
    if (!board) return;
    const life = store.life(),
      sp = roomSpace(life, viewRoom),
      walls = new Set(sp.walls.map((w) => w.x + "," + w.y)), // 고정 장식 칸도 막힌 칸으로 보여 준다
      places = new Map(sp.places.map((p) => [p.x + "," + p.y, p])),
      pawns = new Set(Object.values(life.actors).filter((a) => roomOf(a) === viewRoom).map((a) => a.x + "," + a.y));
    if (board.childElementCount !== GRID.width * GRID.height) {
      board.replaceChildren();
      for (let y = 0; y < GRID.height; y++)
        for (let x = 0; x < GRID.width; x++) {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.x = x;
          b.dataset.y = y;
          b.onclick = () => {
            if (!tool) return notify(T("먼저 옮길 가구나 장애물을 골라 주세요."));
            previewAt(tool, x, y, true);
          };
          board.append(b);
        }
    }
    placeBoard(board);
    for (const b of board.children) {
      const x = Number(b.dataset.x),
        y = Number(b.dataset.y),
        k = x + "," + y,
        place = places.get(k),
        pick = draft && draft.x === x && draft.y === y;
      b.className = "cell" + (place ? " place" + (place.blocked ? " closed" : "") : "") + (walls.has(k) ? " wall" : "") + (pawns.has(k) ? " pawn" : "") + (pick ? (draft.error || !draft.verdict.ok ? " pick bad" : " pick ok") : "") + (place && place.id === tool ? " current" : "");
      const what = place ? T(place.label) : walls.has(k) ? T("장애물") : pawns.has(k) ? T("폰") : T("빈 칸");
      b.setAttribute("aria-label", T("가로 {x}, 세로 {y}", { x, y }) + " · " + what);
      b.setAttribute("aria-pressed", String(!!pick));
      const want = place ? BOARD_IMG[place.kind] || "rest" : walls.has(k) ? "wall" : null;
      if ((b.dataset.img || null) !== want) {
        b.replaceChildren();
        if (want) b.append(pic(furnitureSrc(want)));
        if (want) b.dataset.img = want;
        else delete b.dataset.img;
      }
    }
  }
  function confirmDraft() {
    if (!draft) return;
    if (draft.error === "version_conflict") {
      saveDraftForReload();
      location.reload();
      return;
    }
    try {
      const result = store.applyLayout(draft.commandId || (draft.commandId = crypto.randomUUID()), editOf(draft.tool, draft.x, draft.y), draft.version, VIEWER);
      draft = null;
      hover = null;
      notify(result.action === "remove_wall" ? T("장애물을 치웠어요.") : T("배치를 바꿨어요. 생활을 다시 시작하면 폰들이 새 길을 찾아요."));
    } catch (e) {
      const reason = reasonOf(e);
      if (["save_failed", "version_conflict"].includes(reason)) draft.error = reason;
      else {
        // 그사이 상태가 바뀌어 판정이 달라졌다: 최신 판정으로 다시 보여 준다(저장은 하지 않았다)
        draft.verdict = store.previewLayout(editOf(draft.tool, draft.x, draft.y));
        draft.version = store.layoutVersion(viewRoom);
        draft.commandId = null;
        if (reason === "not_owner") notify(LAYOUT_TEXT.not_owner);
      }
    }
    syncPanel();
    render();
  }
  // 트레이 타일은 가구 종류(생활방 id)로 표시돼 있다. 아늑한 방에서는 같은 종류의 그 방 가구 id 로 바꿔 쓴다
  const roomPlaceId = (base) => {
    if (base === "wall" || viewRoom === "living") return base;
    const kind = base.replace("game1-", "");
    return roomSpace(store.life(), viewRoom).places.find((p) => p.kind === kind)?.id || base;
  };
  document.querySelectorAll("#placeTray [data-place]").forEach((b) => (b.onclick = () => {
    const id = roomPlaceId(b.dataset.place);
    chooseTool(tool === id ? null : id);
  }));
  $("previewConfirm").onclick = confirmDraft;
  $("previewCancel").onclick = () => {
    draft = null;
    syncPanel();
    render();
  };
  $("placeApply").onclick = () => {
    if (!tool) return notify(T("먼저 옮길 가구나 장애물을 골라 주세요."));
    previewAt(tool, Number($("placeX").value), Number($("placeY").value), true);
  };
  $("placeBlocked").onchange = () => {
    const place = store.life().places.find((p) => p.id === tool);
    if (!place) return;
    try {
      store.applyLayout(crypto.randomUUID(), { kind: "close", id: place.id, blocked: $("placeBlocked").checked, room: viewRoom }, store.layoutVersion(viewRoom), VIEWER);
      notify($("placeBlocked").checked ? LAYOUT_TEXT.place_closed : T("이 장소를 다시 열었어요."));
    } catch (e) {
      $("placeBlocked").checked = place.blocked;
      notify(LAYOUT_TEXT[reasonOf(e)] || LAYOUT_TEXT.save_failed);
    }
    syncPanel();
    render();
  };
  $("arrangeDone").onclick = () => endLayout();
  $("speechToggle").checked = speechOn();
  $("speechToggle").onchange = () => {
    try {
      localStorage.setItem("game1-speech", $("speechToggle").checked ? "on" : "off");
    } catch {}
    if (!$("speechToggle").checked) {
      speechQueue.clear();
      for (const v of pawnViews.values()) {
        v.speech?.remove();
        v.speech = null;
        v.speechUntil = 0;
      }
    }
  };
  const cellAt = (e) => {
    const r = stage.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * GRID.width),
      y: Math.floor(((e.clientY - r.top) / r.height) * GRID.height),
    };
  };
  stage.addEventListener("pointermove", (e) => {
    if (!layout || !tool || draft || e.pointerType !== "mouse") return;
    const c = cellAt(e);
    if (hover && hover.x === c.x && hover.y === c.y) return;
    hover = c;
    render();
  });
  stage.addEventListener("pointerleave", () => {
    if (hover) {
      hover = null;
      render();
    }
  });
  stage.onclick = (e) => {
    if (moveDraft) {
      const c = cellAt(e);
      return previewMove(c.x, c.y);
    }
    if (!layout || !tool) return;
    const c = cellAt(e);
    previewAt(tool, c.x, c.y, true);
  };
  /* ───── 방 보기·폰 옮기기(PO-ROOM-001) ───── */
  function setViewRoom(room) {
    if (room === viewRoom) return;
    viewRoom = room;
    draft = null;
    hover = null;
    tool = null;
    for (const [id, v] of pawnViews) {
      v.speech?.remove();
      v.el.remove();
      pawnViews.delete(id);
    }
    render().then(frameScene);
  }
  document.querySelectorAll("#roomSwitch [data-room]").forEach((b) => (b.onclick = () => !moveDraft && setViewRoom(b.dataset.room)));
  function startRoomMove(pawnId, room) {
    if (layout) endLayout();
    try {
      if (!store.life().paused) store.lifePause(crypto.randomUUID(), true); // 미리보기 동안 생활 정지(자동 재개 없음)
    } catch {}
    const name = T(store.read().pawns.find((p) => p.id === pawnId)?.name || "폰");
    moveDraft = { pawnId, room, x: null, y: null, verdict: null };
    $("roomMoveTitle").textContent = T("{name}을(를) {room}으로 옮기기", { name, room: ROOM_NAME[room] });
    $("roomMovePanel").hidden = false;
    setViewRoom(room);
    // 안전한 빈칸을 하나 제안(아래쪽 가운데에 가까운 칸). 없으면 옮길 수 없다고 안내
    const cells = store.roomMoveCells(pawnId, room);
    if (!cells.length) {
      moveDraft.verdict = { ok: false, reason: "no_room" };
    } else {
      const best = cells.sort((a, b) => Math.abs(a.x - 6) + (7 - a.y) - (Math.abs(b.x - 6) + (7 - b.y)))[0];
      previewMove(best.x, best.y);
    }
    renderMoveBoard();
    render().then(frameScene);
  }
  function previewMove(x, y) {
    if (!moveDraft) return;
    moveDraft.x = x;
    moveDraft.y = y;
    moveDraft.verdict = store.previewRoomMove(moveDraft.pawnId, moveDraft.room, x, y);
    renderMoveBoard();
  }
  function renderMoveBoard() {
    const board = $("moveBoard");
    if (!moveDraft) return;
    const life = store.life(),
      sp = roomSpace(life, moveDraft.room),
      key = (p) => p.x + "," + p.y,
      walls = new Set(sp.walls.map(key)),
      places = new Map(sp.places.map((p) => [key(p), p])),
      pawns = new Set(Object.values(life.actors).filter((a) => roomOf(a) === moveDraft.room).map(key));
    if (board.childElementCount !== GRID.width * GRID.height) {
      board.replaceChildren();
      for (let y = 0; y < GRID.height; y++)
        for (let x = 0; x < GRID.width; x++) {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.x = x;
          b.dataset.y = y;
          b.onclick = () => previewMove(x, y);
          board.append(b);
        }
    }
    for (const b of board.children) {
      const x = Number(b.dataset.x),
        y = Number(b.dataset.y),
        k = x + "," + y,
        place = places.get(k),
        pick = moveDraft.x === x && moveDraft.y === y;
      b.className = "cell" + (place ? " place" : "") + (walls.has(k) ? " wall" : "") + (pawns.has(k) ? " pawn" : "") + (pick ? (moveDraft.verdict?.ok ? " pick ok" : " pick bad") : "");
      b.setAttribute("aria-label", T("가로 {x}, 세로 {y}", { x, y }) + " · " + (place ? T(place.label) : walls.has(k) ? T("장애물") : pawns.has(k) ? T("폰") : T("빈 칸")));
      b.replaceChildren();
      if (place) b.append(pic(furnitureSrc(place.kind)));
      else if (walls.has(k)) b.append(pic(furnitureSrc("wall")));
    }
    const v = moveDraft.verdict;
    $("roomMovePreview").hidden = !v;
    $("roomMoveText").textContent = v ? (v.ok ? MOVE_TEXT.ok : MOVE_TEXT[v.reason] || MOVE_TEXT.failed) : "";
    $("roomMovePreview").className = "arrange-preview " + (v?.ok ? "ok" : "bad");
    $("roomMoveConfirm").disabled = !v?.ok;
  }
  function endRoomMove(stay) {
    const back = moveDraft && !stay ? roomOf(store.life().actors[moveDraft.pawnId]) : null;
    moveDraft = null;
    $("roomMovePanel").hidden = true;
    if (back) setViewRoom(back);
    else render().then(frameScene);
  }
  $("roomMoveCancel").onclick = () => endRoomMove(false); // 취소: 원래 방·자리 그대로
  $("roomMoveConfirm").onclick = () => {
    if (!moveDraft?.verdict?.ok) return;
    const { pawnId, room, x, y } = moveDraft;
    try {
      store.movePawnRoom(moveDraft.commandId || (moveDraft.commandId = crypto.randomUUID()), pawnId, room, x, y, VIEWER);
      notify(T("{room}으로 옮겼어요. ▶ 를 누르면 생활이 다시 시작돼요.", { room: ROOM_NAME[room] }));
      endRoomMove(true);
    } catch (e) {
      const reason = String(e.message || "").replace(/^room./, "");
      moveDraft.commandId = null;
      moveDraft.verdict = MOVE_TEXT[reason] ? { ok: false, reason } : { ok: false, reason: "failed" };
      renderMoveBoard();
    }
  };
  $("pauseLife").onclick = () => {
    try {
      store.lifePause(crypto.randomUUID(), !store.life().paused);
      faulted = false;
      saveState("ok");
      render();
    } catch {
      notify(T("저장하지 못해 생활을 멈췄어요. 기존 기록은 유지합니다."));
      faulted = true;
      saveState("failed");
    }
  };
  document.querySelectorAll(".plate-speed [data-speed]").forEach((b) => {
    b.onclick = () => {
      speed = Number(b.dataset.speed);
      document.querySelectorAll(".plate-speed [data-speed]").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  for (const [id, action] of [["visitEnter", "enter"], ["visitLeave", "leave"], ["visitDisconnect", "disconnect"], ["visitReconnect", "reconnect"]])
    $(id).onclick = () => {
      try {
        store.visit(crypto.randomUUID(), action);
        render();
      } catch {
        notify(T("방문 폰의 현재 상태를 확인해 주세요."));
      }
    };
  for (const [id, scope] of [["hostAccess", "host_access"], ["guestActivity", "activity_participation"], ["guestLight", "light_auto_events"]])
    $(id).onchange = () => {
      try {
        store.visitPermission(crypto.randomUUID(), scope, $(id).checked);
        render();
      } catch {
        notify(T("방문 허용 상태를 저장하지 못했어요."));
      }
    };
  /* 저장 상태 줄(DES-07): 생활 기록이 실제로 저장됐는지 늘 보이게. 실패·충돌이면 생활은 멈춰 있고 마지막 저장본을 유지한다. */
  const SAVE_TEXT = { ok: T("저장됐어요"), failed: T("저장 실패 · 멈춤"), conflict: T("다른 창 변경 · 멈춤") };
  const saveState = (k) => {
    const e = $("saveState");
    document.body.dataset.save = k;
    if (!e || e.dataset.state === k) return;
    e.dataset.state = k;
    e.textContent = SAVE_TEXT[k];
  };
  saveState("ok");
  /* 생활 시계: ×N 이면 1/N 초마다 1 tick. 한 번에 여러 칸을 건너뛰지 않아 걷기가 끊기지 않는다(논리 tick 수는 같다). */
  let timer = null;
  async function lifeTick() {
    if (!(document.hidden || document.querySelector(".screen:not([hidden])") || rendering || faulted || store.life().paused || !store.read().pawns.length)) {
      let saved = false;
      try {
        store.lifeStep(store.life().tick + 1);
        saved = true;
        saveState("ok");
        await render();
      } catch {
        faulted = true;
        if (!saved) saveState("failed"); // 그리기 오류는 저장 실패가 아니다(저장본은 이미 확정)
        notify(T("저장 충돌 또는 저장 실패로 생활을 멈췄어요. 현재 기록을 보존한 채 새로고침해 주세요."));
      }
    }
    timer = setTimeout(lifeTick, Math.round(1000 / speed));
  }
  timer = setTimeout(lifeTick, Math.round(1000 / speed));
  window.addEventListener("storage", (event) => {
    if (event.key === "game1-local-a-v1") {
      faulted = true;
      saveState("conflict");
      notify(T("다른 창의 변경을 확인했어요. 현재 생활을 멈추고 새로고침해 주세요."));
    }
  });
  window.addEventListener("pagehide", () => clearTimeout(timer), { once: true });
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    sessionStorage.removeItem(DRAFT_KEY);
    if (saved && VIEWER === "local-owner") {
      startLayout(saved.tool);
      previewAt(saved.tool, saved.x, saved.y, true);
    }
  } catch {}
  if (window.game1Debug) window.game1Debug.life = () => ({ rendering, rerender, faulted, speed, timerSet: !!timer, speechQueued: [...speechQueue.values()].reduce((n, q) => n + q.length, 0) }); // ?debug=1 전용 점검
  return { render, renderList, toggleLayout };
}
