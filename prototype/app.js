import { t as T, tLife, applyStatic, setLang, getLang, LANGS } from "./i18n.js";
applyStatic();
import { mountLifeUI } from "./life-ui.js";
import { mountAccountUI } from "./account-ui.js";
import { renderSpaceComparison } from "./space-comparison.js";
import { createLocalStore, STORE_KEY } from "./store.js";
import { memoryText, AXES as REL_AXES } from "./relation-text.js";
import { AXES, LEVELS, DEFAULT_AXES, PRESETS } from "./core/game1-traits.js";
import { CHOICES, TEST_READY } from "./core/game1-workshop.js";

const $ = (id) => document.getElementById(id);
let toastTimer = null;
const say = (text) => {
  const t = $("notice");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
};
let lifeUI = null;
let store;
try {
  /* 시험용(A1-08): 주소에 ?debug=1 이 있을 때만 다음 저장 1회를 일부러 실패시킬 수 있다. 평소에는 localStorage 그대로. */
  let failNextSave = false;
  const debug = new URLSearchParams(location.search).get("debug") === "1";
  const storage = debug
    ? {
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => {
          if (failNextSave) {
            failNextSave = false;
            throw Error("debug.injected_save_failure");
          }
          localStorage.setItem(k, v);
        },
      }
    : localStorage;
  if (debug) window.game1Debug = { failNextSave: () => (failNextSave = true) };
  // 새 월드만 시작 관계 편차(PO-DEC-004 §2)를 한 번 만든다. 기존 저장본은 바뀌지 않는다.
  store = createLocalStore(storage, { initialSpread: true });
} catch (e) {
  say(T("저장 기록을 읽지 못했습니다. 기존 데이터를 덮어쓰지 않습니다. ") + e.message);
  throw e;
}

/* ───────── 얼굴 편집 상태 ───────── */
const slots = ["back_hair", "base", "eyes_pair", "mouth", "front_hair", "frame_accessory"];
const layers = Object.fromEntries(
  slots.map((s) => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    return [s, c];
  }),
);
let transforms = {},
  history = [],
  future = [],
  axes = { ...DEFAULT_AXES },
  saveCommand = null,
  editingTrait = null,
  editingPawn = null,
  savePending = false,
  drawing = false,
  last = null;
const uid = () => crypto.randomUUID(),
  image = (src) =>
    new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });

function blank() {
  for (const s of slots) {
    layers[s].getContext("2d").clearRect(0, 0, 512, 512);
    transforms[s] = { x: 0, y: 0, rotation: 0, scale: 1, visible: true };
  }
  const c = layers.base.getContext("2d");
  c.fillStyle = "#fff5df";
  c.beginPath();
  c.arc(256, 256, 192, 0, Math.PI * 2);
  c.fill();
  history = [];
  future = [];
  axes = { ...DEFAULT_AXES };
  $("name").value = "";
  saveCommand = null;
  editingTrait = null;
  editingPawn = null;
  $("editorTitle").textContent = T("폰 만들기");
  $("traitLabel").textContent = T("직접 조합");
  render();
}
function appearance() {
  return {
    layers: Object.fromEntries(slots.map((s) => [s, layers[s].toDataURL()])),
    transforms: structuredClone(transforms),
    schema_version: 1,
  };
}
/* 공용 합성기: 모든 초상은 사용자가 그린 6개 파츠로만 그린다 */
function paint(target, source = layers, t = transforms, clip = $("clip").checked) {
  const c = target.getContext("2d");
  c.clearRect(0, 0, target.width, target.height);
  c.save();
  c.scale(target.width / 512, target.height / 512);
  for (const s of slots) {
    const v = t[s];
    if (!v.visible) continue;
    c.save();
    if (s === "base" || ((s === "eyes_pair" || s === "mouth") && clip)) {
      c.beginPath();
      c.arc(256, 256, 192, 0, Math.PI * 2);
      c.clip();
    }
    c.translate(256 + v.x, 256 + v.y);
    c.rotate((v.rotation * Math.PI) / 180);
    c.scale(v.scale, v.scale);
    c.drawImage(source[s], -256, -256);
    c.restore();
    if (s === "base") {
      c.save();
      c.strokeStyle = "#5d4a3c";
      c.lineWidth = 7;
      c.beginPath();
      c.arc(256, 256, 192, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  }
  c.restore();
}
function renderPartThumbs() {
  document.querySelectorAll("#partGrid .part").forEach((b) => {
    const slot = b.dataset.slot,
      c = b.querySelector("canvas"),
      ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.scale(c.width / 512, c.height / 512);
    // 흐린 몸체 위에 해당 파츠만 보여 준다
    ctx.globalAlpha = 0.25;
    ctx.drawImage(layers.base, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(layers[slot], 0, 0);
    ctx.restore();
    if (!transforms[slot]?.visible) b.style.opacity = 0.45;
    else b.style.opacity = "";
  });
}
function hasStrokes() {
  return slots.some((s) => {
    if (s === "base") return false;
    const d = layers[s].getContext("2d").getImageData(0, 0, 512, 512).data;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) return true;
    return false;
  });
}
function render() {
  paint($("drawing"));
  $("canvasGuide").classList.toggle("off", hasStrokes());
  renderPartThumbs();
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
}
function draft() {
  saveCommand = null;
  try {
    localStorage.setItem(
      "game1-draft-v1",
      JSON.stringify({ appearance: appearance(), axes, name: $("name").value, editingPawn, editingTrait }),
    );
  } catch {
    say(T("초안 저장 실패 · 현재 그림은 화면에 유지됩니다."));
  }
}
async function loadAppearance(a) {
  for (const s of slots) {
    layers[s].getContext("2d").clearRect(0, 0, 512, 512);
    if (a.layers[s]) layers[s].getContext("2d").drawImage(await image(a.layers[s]), 0, 0);
    transforms[s] = { ...a.transforms[s] };
  }
  render();
}

/* ───────── 화면 전환: 전체 창(screen) · 팝업(sheet) ───────── */
const SCREENS = ["editor", "traitPanel", "relationPanel", "workshopPanel", "comparePanel"];
function closeSheets() {
  document.querySelectorAll(".sheet").forEach((s) => (s.hidden = true));
}
function openSheet(id) {
  closeSheets();
  $(id).hidden = false;
  $(id).querySelector(".sheet-body")?.scrollTo?.(0, 0);
}
function show(id) {
  closeSheets();
  for (const panel of SCREENS) $(panel).hidden = panel !== id;
  document.querySelector(".screen:not([hidden]) .screen-body")?.scrollTo?.(0, 0);
}
document.querySelectorAll(".sheet").forEach((sheet) => {
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet || e.target.closest("[data-close]")) sheet.hidden = true;
  });
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheets();
});

/* ───────── 성격 ───────── */
const AXIS_NAMES = { fairness_sensitivity: T("공정성 민감도"), closeness_orientation: T("친밀 지향"), risk_aversion: T("위험 회피") };
const LEVEL_NAMES = [T("낮음"), T("중간"), T("높음")];
function markPreset() {
  const hit = PRESETS.find((p) => AXES.every((a) => p.axis_values[a] === axes[a]));
  $("traitLabel").textContent = hit ? hit.label : T("직접 조합");
  document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", hit?.label === b.textContent));
}
function axisUI() {
  $("axes").replaceChildren();
  for (const axis of AXES) {
    const box = document.createElement("div");
    box.className = "axis";
    const title = document.createElement("strong");
    title.textContent = AXIS_NAMES[axis] || axis;
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", title.textContent);
    LEVELS.forEach((value, j) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = LEVEL_NAMES[j];
      b.classList.toggle("on", axes[axis] === value);
      b.setAttribute("aria-pressed", String(axes[axis] === value));
      b.onclick = () => {
        axes[axis] = value;
        axisUI();
        draft();
      };
      seg.append(b);
    });
    box.append(title, seg);
    $("axes").append(box);
  }
  markPreset();
  preview();
}
function preview() {
  $("preview").textContent =
    axes.risk_aversion === "high"
      ? T("예시: 작업 범위와 조건을 먼저 확인할 수 있어요.")
      : T("예시: 기록을 확인하거나 함께 시도할 방법을 제안할 수 있어요.");
}
for (const p of PRESETS) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p.label;
  b.onclick = () => {
    axes = { ...p.axis_values };
    axisUI();
    draft();
  };
  $("presets").append(b);
}
$("random").onclick = () => {
  axes = Object.fromEntries(AXES.map((a) => [a, LEVELS[Math.floor(Math.random() * 3)]]));
  axisUI();
  draft();
};

/* ───────── 그리기 ───────── */
const coordinate = (e) => {
  const r = $("drawing").getBoundingClientRect();
  let x = ((e.clientX - r.left) * 512) / r.width - 256,
    y = ((e.clientY - r.top) * 512) / r.height - 256;
  const t = transforms[$("layer").value],
    angle = (-t.rotation * Math.PI) / 180;
  x -= t.x;
  y -= t.y;
  return {
    x: (x * Math.cos(angle) - y * Math.sin(angle)) / t.scale + 256,
    y: (x * Math.sin(angle) + y * Math.cos(angle)) / t.scale + 256,
  };
};
$("drawing").onpointerdown = (e) => {
  if ($("layer").value === "base") {
    say(T("몸체는 정원 비율을 유지합니다. 파츠를 선택해 그려주세요."));
    return;
  }
  e.preventDefault();
  const slot = $("layer").value;
  history.push({ slot, png: layers[slot].toDataURL() });
  if (history.length > 25) history.shift();
  future = [];
  drawing = true;
  last = coordinate(e);
  $("drawing").setPointerCapture(e.pointerId);
  stroke(last, last);
};
function stroke(a, b) {
  const c = layers[$("layer").value].getContext("2d");
  c.save();
  c.globalCompositeOperation = $("tool").value === "eraser" ? "destination-out" : "source-over";
  c.strokeStyle = $("color").value;
  c.lineWidth = Number($("width").value);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x + 0.01, b.y + 0.01);
  c.stroke();
  c.restore();
  paint($("drawing"));
}
$("drawing").onpointermove = (e) => {
  if (drawing) {
    const point = coordinate(e);
    stroke(last, point);
    last = point;
  }
};
$("drawing").onpointerup = $("drawing").onpointercancel = () => {
  if (drawing) {
    drawing = false;
    render();
    draft();
  }
};
async function historyMove(from, to) {
  const entry = from.pop();
  if (!entry) return;
  to.push({ slot: entry.slot, png: layers[entry.slot].toDataURL() });
  const c = layers[entry.slot].getContext("2d");
  c.clearRect(0, 0, 512, 512);
  c.drawImage(await image(entry.png), 0, 0);
  render();
  draft();
}
$("undo").onclick = () => historyMove(history, future);
$("redo").onclick = () => historyMove(future, history);
$("clip").onchange = render;
$("layer").onchange = () => {
  document.querySelectorAll("#partGrid .part").forEach((b) => b.classList.toggle("on", b.dataset.slot === $("layer").value));
  const t = transforms[$("layer").value];
  for (const [id, k] of [["dx", "x"], ["dy", "y"], ["rotation", "rotation"], ["scale", "scale"]]) {
    $(id).value = t[k];
    $(id).disabled = $("layer").value === "base";
  }
  $("hide").checked = !t.visible;
};
for (const [id, key] of [["dx", "x"], ["dy", "y"], ["rotation", "rotation"], ["scale", "scale"]])
  $(id).oninput = () => {
    transforms[$("layer").value][key] = Number($(id).value);
    render();
    draft();
  };
$("hide").onchange = () => {
  if ($("layer").value === "base") return;
  transforms[$("layer").value].visible = !$("hide").checked;
  render();
  draft();
};
document.querySelectorAll(".tools [data-tool]").forEach((b) => {
  b.onclick = () => {
    $("tool").value = b.dataset.tool;
    document.querySelectorAll(".tools [data-tool]").forEach((x) => x.classList.toggle("on", x === b));
  };
});
document.querySelectorAll("#partGrid .part").forEach((b) => {
  b.onclick = () => {
    $("layer").value = b.dataset.slot;
    $("layer").onchange();
  };
});
function markColor() {
  document.querySelectorAll(".palette [data-color]").forEach((b) => b.classList.toggle("on", b.dataset.color === $("color").value));
}
document.querySelectorAll(".palette [data-color]").forEach((b) => {
  b.style.setProperty("--c", b.dataset.color);
  b.onclick = () => {
    $("color").value = b.dataset.color;
    markColor();
  };
});
$("color").oninput = markColor;
markColor();
$("samples").onclick = async () => {
  if (hasStrokes() && !confirm(T("지금 그린 그림을 참고 예시로 바꿀까요? 되돌리기로 돌아올 수 없어요."))) return;
  for (const slot of slots) {
    layers[slot].getContext("2d").clearRect(0, 0, 512, 512);
    layers[slot].getContext("2d").drawImage(await image("./assets/six_layers/" + slot + "_neutral.png"), 0, 0);
  }
  render();
  draft();
  say(T("참고 예시예요. 위에 덧그리거나 지우개로 고쳐서 나만의 얼굴로 만들어 보세요."));
};
$("traits").onclick = () => {
  axisUI();
  paint($("traitCanvas"));
  show("traitPanel");
};
$("back").onclick = () => show("editor");

/* ───────── 저장 ───────── */
async function save() {
  if (savePending) return;
  savePending = true;
  saveCommand ??= uid();
  const command = saveCommand,
    target = editingPawn,
    traitTarget = editingTrait,
    name = $("name").value,
    art = appearance(),
    selectedAxes = { ...axes };
  for (const id of ["save", "saveFace", "retry"]) $(id).disabled = true;
  say(T("저장 중이에요…"));
  try {
    if ($("failSave").checked) {
      $("failSave").checked = false;
      throw Error(T("시험 저장 실패"));
    }
    const created = !target && !traitTarget;
    if (target) store.updatePawn(command, target, name, art, selectedAxes);
    else if (traitTarget) store.saveTraits(command, traitTarget, selectedAxes);
    else store.createPawn(command, name, art, selectedAxes);
    try {
      localStorage.removeItem("game1-draft-v1");
    } catch {}
    saveCommand = null;
    $("retry").hidden = true;
    await world();
    say(created ? T(T("{name}의 첫 하루가 시작됐어요. 폰을 눌러 무엇을 하는지 지켜보세요."), { name }) : T(T("저장 완료 · 내 월드에 반영됐어요.")));
  } catch (e) {
    try {
      localStorage.setItem(
        "game1-draft-v1",
        JSON.stringify({ appearance: art, axes: selectedAxes, name, editingPawn: target, editingTrait: traitTarget }),
      );
    } catch {}
    say(
      e.message === "save.version_conflict"
        ? T("다른 창에서 저장된 변경이 있어요. 현재 그림은 초안에 보관했습니다. 새로고침 후 다시 저장해 주세요.")
        : e.message === "pawn.name_invalid" || /name/.test(e.message)
          ? T("이름을 1~20자로 지어 주세요. 현재 그림은 유지됩니다.")
          : T("저장하지 못했어요. 현재 그림은 유지됩니다. 다시 시도해 주세요."),
    );
    $("retry").hidden = false;
  } finally {
    savePending = false;
    for (const id of ["save", "saveFace", "retry"]) $(id).disabled = false;
  }
}
$("save").onclick = $("saveFace").onclick = $("retry").onclick = save;
$("name").oninput = draft;

async function editExisting(p) {
  editingPawn = p.id;
  editingTrait = null;
  saveCommand = null;
  history = [];
  future = [];
  axes = { ...p.trait.axis_values };
  $("name").value = p.name;
  await loadAppearance(p.appearance);
  $("layer").onchange();
  $("editorTitle").textContent = T(T("{name} 꾸미기"), { name: p.name });
  show("editor");
  say(T("수정 후 저장하기를 눌러 주세요."));
}
async function world() {
  show(null);
  if (lifeUI) await lifeUI.render();
}
function newPawn() {
  if (store.read().pawns.length >= 3) {
    say(T("이 시험 버전은 자기 폰 3명까지 지원합니다."));
    return;
  }
  blank();
  $("layer").value = "eyes_pair";
  $("layer").onchange();
  show("editor");
  say(T("빈 원에서 새 폰을 그려주세요."));
}
$("newPawn").onclick = $("listNew").onclick = newPawn;
$("editorToWorld").onclick = $("relationBack").onclick = () => world();
$("pawnList").onclick = async () => {
  openSheet("sheet-list");
  if (lifeUI) await lifeUI.renderList();
};
$("openJournal").onclick = () => openSheet("sheet-journal");
$("openRelation").onclick = () => openSheet("sheet-relation");
$("openVisit").onclick = () => openSheet("sheet-visit");
$("openMore").onclick = () => openSheet("sheet-more");
$("arrangeLife").onclick = () => {
  show(null);
  if (lifeUI) lifeUI.toggleLayout();
};

/* ───────── 관계·기억 ───────── */
const labels = {
  affection: T("애정"),
  trust: T("신뢰"),
  respect: T("존중"),
  reciprocity: T("호혜성"),
  dependence: T("의존"),
  power: T("권력"),
  obligation: T("의무"),
  conflict: T("갈등"),
};
const barTone = { affection: "pink", trust: "sky", respect: "mint", reciprocity: "butter", dependence: "lilac", power: "lilac", obligation: "butter", conflict: "pink" };
const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};
const svgIcon = (name) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "#" + name);
  s.append(u);
  return s;
};
/* 관계창(PO-REQ-001 §4): 누가 누구를 어떻게 보는지 → 근거 → 8축 → 최근 사건(사실/해석/사유/해결) → 실제 근거 엔터티 */
const SLOT_ORDER = ["back_hair", "base", "eyes_pair", "mouth", "front_hair", "frame_accessory"];
async function pawnFace(p, size) {
  const c = el("canvas", "rel-face");
  c.width = c.height = size;
  const imgs = {};
  for (const sl of SLOT_ORDER) imgs[sl] = await image(p.appearance?.layers?.[sl] || "./assets/six_layers/" + sl + "_neutral.png");
  paint(c, imgs, p.appearance?.transforms || Object.fromEntries(SLOT_ORDER.map((sl) => [sl, { x: 0, y: 0, rotation: 0, scale: 1, visible: true }])), false);
  return c;
}
let relRender = 0;
async function relationship() {
  const mine = ++relRender; // 빠르게 여러 번 열려도 마지막 호출만 그린다(머리말 중복 방지)
  const from = $("from").value,
    to = $("to").value,
    state = store.read(),
    all = [...state.pawns, ...(state.life.guest?.present ? [state.life.guest] : [])],
    pf = all.find((p) => p.id === from),
    pt = all.find((p) => p.id === to),
    nameOf = (id) => T(all.find((p) => p.id === id)?.name || T("폰"));
  $("relationship").replaceChildren();
  $("relHead").replaceChildren();
  if (!pf || !pt || from === to) {
    $("relationship").append(el("p", "empty", T("서로 다른 폰을 선택해 주세요.")));
    return;
  }
  // 1. 방향 머리말: 얼굴·이름·A→B, 같은 소유자끼리면 방향 바꾸기
  const head = $("relHead"),
    bothOwn = !pf.local_double && !pt.local_double;
  const who = (p) => {
    const box = el("div", "rel-who");
    box.append(el("b", "", T(p.name)), el("small", "", p.local_double ? T("방문 폰 · 로컬 방문 데모") : T("내 폰")));
    return box;
  };
  const faceFrom = await pawnFace(pf, 72),
    faceTo = await pawnFace(pt, 72);
  if (mine !== relRender) return;
  head.replaceChildren();
  $("relationship").replaceChildren();
  head.append(faceFrom, who(pf), el("span", "rel-arrow", "→"), faceTo, who(pt));
  if (bothOwn) {
    const swap = el("button", "gbtn gbtn-sm rel-swap", T("반대 방향 보기"));
    swap.type = "button";
    swap.onclick = () => {
      $("from").value = to;
      $("to").value = from;
      relationship();
    };
    head.append(swap);
  }
  const dto = store.projection(from, to, $("restricted").checked);
  // 저장 상태(DES-07): 실패·충돌이면 관계 창 맨 위에 알린다. 보이는 수치는 마지막 저장본이다.
  const save = document.body.dataset.save;
  if (save === "failed" || save === "conflict") {
    const warn = el("div", "rel-save-warn");
    warn.append(el("b", "", save === "failed" ? T("저장하지 못했어요.") : T("다른 창에서 바뀐 기록이 있어요.")), el("small", "", T("마지막 저장 상태를 보여 주고 있어요. 생활은 멈춰 있어요.")));
    $("relationship").append(warn);
  }
  if (dto.visibility === "restricted") {
    $("relationship").append(el("p", "empty", T("이 방향은 공개된 정보가 없어요.")));
    return;
  }
  // 2. 요약: 실제 판정된 태그 + 최근 인지한 변화 이유(저장 확정된 기록만)
  const sum = el("div", "rel-summary");
  sum.append(el("h4", "", T("{a}이(가) 보는 {b}", { a: T(pf.name), b: T(pt.name) })));
  const tags = el("div", "tag-row");
  if (dto.tags.length) for (const t of dto.tags) tags.append(el("span", "tag", t.label));
  else tags.append(el("span", "muted", T("아직 정해진 관계 설명은 없어요.")));
  sum.append(tags);
  const lastView = dto.memory_views.at(-1);
  if (lastView) {
    const mt = memoryText(lastView, nameOf);
    sum.append(el("p", "rel-reason", T("최근 알게 된 일: ") + mt.fact + " " + mt.interpretation));
  }
  const lastChange = [...state.life.logs].reverse().find((l) => (l.changes || []).some((c) => c.from === from && c.to === to && (c.affection || c.trust)));
  if (lastChange) {
    const c = lastChange.changes.find((c) => c.from === from && c.to === to);
    sum.append(el("p", "rel-reason small", T("마지막 변화: {text} (애정 {a}, 신뢰 {t})", { text: tLife(lastChange.text), a: (c.affection >= 0 ? "+" : "") + c.affection, t: (c.trust >= 0 ? "+" : "") + c.trust })));
  }
  $("relationship").append(sum);
  // 3. 8축: 두 묶음으로 나누되 8개 모두 보여 준다
  for (const [title, keys] of [
    [T("마음"), ["affection", "trust", "respect", "conflict"]],
    [T("관계 구조"), ["dependence", "power", "reciprocity", "obligation"]],
  ]) {
    const group = el("div", "axis-group");
    group.append(el("h4", "", title));
    for (const key of keys) {
      const [, label, desc] = REL_AXES.find((a) => a[0] === key),
        n = dto.scores[key];
      const row = el("div", "score-row");
      const bar = el("div", "bar " + (barTone[key] || ""));
      const fill = el("i");
      fill.style.width = Math.min(100, (n / 1000) * 100) + "%";
      bar.append(fill);
      const name = el("span", "axis-name");
      name.append(el("b", "", T(label)), el("small", "", T(desc)));
      row.append(name, bar, el("b", "", String(n)));
      group.append(row);
    }
    $("relationship").append(group);
  }
  // 4. 최근 사건: 사실 / 해석 / 사유 / 해결 독립 표시
  const ev = el("div", "rel-events");
  ev.append(el("h4", "", T("최근 사건")));
  if (!dto.memory_views.length) ev.append(el("p", "hint", T("아직 함께 겪은 일이 없어요.")));
  for (const v of dto.memory_views.slice(-6).reverse()) {
    const mt = memoryText(v, nameOf),
      row = el("div", "memory-row");
    const body = el("div");
    body.append(el("span", "mem-fact", mt.fact), el("small", "mem-interp", T("해석 · ") + mt.interpretation));
    if (mt.reason) body.append(el("small", "mem-reason", T("이유 · ") + mt.reason));
    if (mt.resolution) body.append(el("small", "mem-resolution", T("해결 · ") + mt.resolution));
    row.append(svgIcon("i-book"), body);
    ev.append(row);
  }
  $("relationship").append(ev);
  // 5. 실제 근거가 있는 것만
  const basis = el("div", "rel-basis");
  basis.append(el("h4", "", T("관계의 근거")));
  const items = [];
  // 열린 확인사항은 갈등이 아니다(PO-HAND-005 §3B): 따로, 사실만 보여 준다.
  const ISSUE_STATE = { observed: T("봤지만 아직 말하지 않았어요"), intends_request: T("확인을 부탁하려 해요"), verification_pending: T("확인을 부탁했고 답을 기다려요"), verification_accepted: T("다시 확인하기로 했어요"), correction_published: T("기록은 고쳐졌어요") + " · " + T("아직 전해 듣기 전") };
  for (const i of dto.basis?.open_issues || []) {
    const p = el("p", "hint rel-issue");
    p.append(svgIcon("i-book"), document.createTextNode(T("열린 확인사항: 공동작업 기록 · {state}", { state: ISSUE_STATE[i.state] || i.state })));
    basis.append(p);
  }
  for (const c of dto.basis?.conflicts || []) items.push(T("풀리지 않은 갈등: {topic}", { topic: c.topic === "credit_attribution" ? T("공동작업 공로") : c.topic }));
  if (dto.basis?.roles) items.push(T("함께 맡은 역할 {n}개", { n: dto.basis.roles }));
  if (dto.basis?.resources) items.push(T("기대고 있는 자원 {n}개", { n: dto.basis.resources }));
  if (dto.basis?.commitments) items.push(T("받아들인 약속 {n}개", { n: dto.basis.commitments }));
  if (dto.basis_status === "no_active_basis") items.push(T("공동 결정 기록 없음 (권력은 기본값)"));
  if (!items.length && !dto.basis?.open_issues?.length) items.push(T("지금은 따로 기록된 근거가 없어요."));
  for (const t of items) basis.append(el("p", "hint", t));
  $("relationship").append(basis);
}
$("relations").onclick = () => {
  show("relationPanel");
  for (const id of ["from", "to"]) {
    $(id).replaceChildren();
    for (const p of [
      ...store.read().pawns,
      ...(id === "to" && store.read().life.guest?.present ? [store.read().life.guest] : []),
    ])
      $(id).add(new Option(T(p.name) + (p.local_double ? T(" · 방문 폰") : ""), p.id));
  }
  if ($("to").options.length > 1) $("to").selectedIndex = 1;
  relationship();
};
$("from").onchange = $("to").onchange = $("restricted").onchange = relationship;

/* ───────── 보존된 공방 시험 ───────── */
const copy = {
  C: T("이름 정정 후 재발송"),
  D: T("작업 우선, 해결 유예"),
  V: T("기여 기록 확인"),
  H: T("밤에게 도움 요청"),
  A: T("노을에게 대안 배우기"),
  R: T("역할 새로 합의"),
  P: T("합의하고 동업 지속"),
  S: T("수락한 역할 분리"),
  E: T("퇴장·인계"),
};
function conditions() {
  return {
    ...TEST_READY,
    role_consent: $("consent").checked,
    role_change_accepted: $("consent").checked,
    major_transition_accepted: $("consent").checked,
    delivery_committed: $("delivery").checked,
    connected: $("connected").checked,
    bam_knows: $("aware").checked,
    morae_knows: $("aware").checked,
    method_learned: $("learned").checked,
    settlement_accepted: $("settlement").checked,
  };
}
const reasons = {
  "workshop.help_unconfirmed": T("이번 도움 제안은 성립하지 않았습니다. 대안을 선택하거나 퇴장할 수 있어요."),
  "workshop.technical_pause": T("연결 문제로 활동을 잠시 멈췄습니다."),
  "workshop.delivery_unconfirmed": T("고객 전달을 아직 확인하지 못했습니다. 확인하거나 다른 선택을 해주세요."),
  "workshop.role_change_unconfirmed": T("새 책임이 수락되지 않았습니다. 기존 역할은 유지돼요."),
  "workshop.transition_unconfirmed": T("동업 지속 합의가 아직 없습니다. 다른 선택이나 퇴장이 가능해요."),
  "workshop.method_unavailable": T("대안 학습을 아직 확인하지 못했습니다."),
  "workshop.handover_pending": T("본인은 퇴장했습니다. 인계·정산은 별도 합의 대기입니다."),
};
function workshop() {
  show("workshopPanel");
  const state = store.workshop();
  $("choices").replaceChildren();
  $("round").textContent = state
    ? T("라운드 ") + Math.min(state.round, 3) + T(" · 시간 테스트 포인트 ") + state.test_balance.work_time + T(" · 재료 ") + state.test_balance.material
    : T("새 공방을 시작해 주세요.");
  if (!state || state.status === "completed") return;
  for (const [code, c] of Object.entries(CHOICES))
    if (c.round === state.round) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = copy[code] + T(" · 시간 ") + c.time + T(" / 재료 ") + c.material;
      b.onclick = () => submit(code);
      $("choices").append(b);
    }
}
function submit(code) {
  try {
    const result = store.submit(uid(), code, conditions());
    workshop();
    $("result").textContent =
      reasons[result.reason_key] ||
      (["committed", "exited"].includes(result.status)
        ? T("선택이 로컬 저장에 확정됐습니다. 관계·기억에서 변화와 남은 문제를 확인하세요.")
        : T("확정되지 않았습니다. 다른 선택이나 퇴장이 가능합니다."));
    if (result.source_event_ids?.length) $("result").append(el("p", "", T("확정 사건: ") + result.source_event_ids.join(", ")));
    for (const relation of result.relations || []) {
      const pawns = store.read().pawns,
        from = pawns.find((p) => p.id === relation.from_pawn_id),
        to = pawns.find((p) => p.id === relation.to_pawn_id);
      const changed = Object.keys(labels)
        .filter((k) => relation.before[k] !== relation.after[k])
        .map((k) => labels[k] + " " + relation.before[k] + " → " + relation.after[k]);
      $("result").append(el("p", "", from.name + " → " + to.name + " · " + (changed.join(" · ") || T("확정 수치 변화 없음"))));
    }
    say(T("처리 상태: ") + result.status);
  } catch (e) {
    say(T("처리하지 못했습니다. 기존 저장 상태를 유지합니다. ") + e.message);
  }
}
$("begin").onclick = () => {
  try {
    store.begin(uid());
    workshop();
    $("result").textContent = T("새 주문의 공로 문제를 확인합니다. 고의는 단정하지 않습니다.");
  } catch (e) {
    say(e.message === "workshop.requires_three" ? T("먼저 자기 폰 3명을 만들어 주세요.") : e.message);
  }
};
$("exit").onclick = () => submit("E");
$("repair").onclick = () => {
  try {
    store.repair(uid(), { accepted: $("repairAccepted").checked, executed: $("repairDone").checked });
    $("result").textContent = T("대상 주문의 갈등을 정리했습니다. 기억은 유지되며 자동 친구가 되지는 않습니다.");
  } catch (e) {
    say(T("복구를 확정하지 못했습니다. 별도 실행·수용 근거를 확인해 주세요. ") + e.message);
  }
};
$("openWorkshop").onclick = workshop;
$("workshopBack").onclick = () => world();

/* ───────── 저장 파일 내보내기·불러오기 ───────── */
$("exportSave").onclick = () => {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    say(T("아직 저장된 월드가 없어요."));
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  a.download = "donggeuran-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $("saveNote").textContent = T("저장 파일을 내려받았어요. 이 브라우저에도 계속 자동 저장돼요.");
};
$("importSave").onclick = () => $("importFile").click();
$("importFile").onchange = async () => {
  const file = $("importFile").files[0];
  $("importFile").value = "";
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    say(T("저장 파일이 너무 큽니다."));
    return;
  }
  try {
    const text = await file.text();
    // 실제 저장소에 쓰기 전에 같은 검증기로 먼저 확인한다
    const probe = {};
    createLocalStore({ getItem: () => text, setItem: (k, v) => (probe[k] = v) });
    const previous = localStorage.getItem(STORE_KEY);
    if (previous) localStorage.setItem(STORE_KEY + ".before-import", previous);
    localStorage.setItem(STORE_KEY, text);
    localStorage.removeItem("game1-draft-v1");
    say(T("저장 데이터를 불러왔어요. 화면을 다시 엽니다."));
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    say(T("이 파일은 동그란 사이 저장 데이터가 아니거나 손상됐어요. 기존 기록은 그대로예요."));
  }
};

/* ───────── 시작 ───────── */
blank();
try {
  const d = JSON.parse(localStorage.getItem("game1-draft-v1") || "null");
  if (d) {
    await loadAppearance(d.appearance);
    axes = d.axes;
    editingPawn = d.editingPawn || null;
    editingTrait = d.editingTrait || null;
    $("name").value = d.name;
    $("editorTitle").textContent = editingPawn ? T(T("{name} 꾸미기"), { name: d.name }) : T(T("폰 만들기"));
    show("editor");
    say(T("이전 그림·성격 초안을 복구했습니다. 아직 폰 저장은 확정되지 않았습니다."));
  } else if (!store.read().pawns.length) {
    show("editor");
    say(T("첫 폰을 그려 볼까요? 빈 원에 눈과 입을 그려 주세요."));
  } else show(null);
} catch {
  say(T("초안을 읽지 못했습니다. 저장 기록은 유지합니다."));
}
$("layer").onchange();

lifeUI = mountLifeUI({
  store,
  paint,
  image,
  edit: editExisting,
  notify: say,
  openRelations: (from, to) => {
    $("relations").click();
    $("from").value = from;
    $("to").value = to;
    relationship();
  },
  showWorld: world,
  closeSheets,
});
await lifeUI.render();
// 계정(PO-AUTH-001): 로그인 과정 중에는 생활을 멈춘다. 다시 시작은 사용자가 ▶ 로(자동 재개 없음)
mountAccountUI({
  store,
  storeKey: STORE_KEY,
  // 계정에서 불러올 저장본은 파일 불러오기와 같은 검증기로 먼저 확인한다(실패하면 로컬은 그대로)
  validateText: (text) => createLocalStore({ getItem: () => text, setItem() {} }),
  pauseLife: () => {
    try {
      if (!store.life().paused) store.lifePause(crypto.randomUUID(), true);
    } catch {}
  },
});
$("artCompare").onclick = async () => {
  show("comparePanel");
  await renderSpaceComparison($("compareCanvas"), store.read(), paint, image);
};
$("compareBack").onclick = world;

/* ───────── 언어 ───────── */
for (const [code, label] of Object.entries(LANGS)) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "gbtn gbtn-sm" + (code === getLang() ? " gbtn-blue" : "");
  b.textContent = label;
  b.setAttribute("aria-pressed", String(code === getLang()));
  b.onclick = () => {
    if (code === getLang()) return;
    setLang(code);
    location.reload();
  };
  $("langPicker").append(b);
}
if (getLang() !== "ko") {
  const plate = document.querySelector(".title-plate"),
    alt = "./assets/brand/title-" + getLang() + ".png",
    probe = new Image();
  probe.onload = () => (plate.src = alt);
  probe.src = alt;
}
