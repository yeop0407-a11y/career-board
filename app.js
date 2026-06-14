/* =========================================================
   CAREER FIT BOARD — app logic
   ========================================================= */

// ===== 상수 =====
const ALL_CATEGORY   = { id: "all",   name: "전체", color: "#34A85A" };
const OTHER_CATEGORY = { id: "other", name: "기타", color: "#6B7280" };
const PROFILE_KEY = "career_board_profile_v2";
const SAVED_KEY   = "career_board_saved_v2";
const CAT_ICONS = { fair: "🏢", recommended: "⭐", program: "📚", recruitment: "💼", contest: "🏆", other: "📌" };

const WD_MAP = { "월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6 };
const WD_KO  = ["월", "화", "수", "목", "금", "토", "일"];
const TT_DAYS  = ["월", "화", "수", "목", "금"];
const TT_SLOTS = (() => { const s = []; for (let h = 9; h <= 20; h++) for (const m of [0, 30]) s.push({ h, m }); return s; })();

// 취업 전략 가이드 (준비 단계별)
const STAGE_GUIDE = {
  explore: {
    title: "탐색 단계 — 넓게 보고 방향 잡기",
    line: "아직 진로가 또렷하지 않다면, 다양한 직무·산업을 경험하며 관심 분야를 좁혀가는 시기예요.",
    focus: ["program", "fair"],
    steps: [
      ["직무·산업 탐색 특강 듣기", "현직자 멘토링·직무 특강으로 ‘무슨 일을 하는지’부터 파악"],
      ["채용설명회로 기업 분위기 보기", "부담 없이 참여해 기업·산업 감각 익히기"],
      ["관심 직무 1~2개로 좁히기", "흥미로운 분야를 추려 다음 단계 준비로 연결"],
    ],
  },
  prepare: {
    title: "준비 단계 — 실력과 서류 쌓기",
    line: "관심 직무가 정해졌다면, 자소서·면접·자격증 등 ‘무기’를 갖추는 시기예요.",
    focus: ["program", "recommended"],
    steps: [
      ["자소서·면접 프로그램 활용", "취업전략과 첨삭·모의면접으로 서류 완성도 높이기"],
      ["인턴·대외활동으로 경험 채우기", "양성과정·서포터즈 등으로 직무 경험 만들기"],
      ["추천채용 모니터링 시작", "관심 직무 추천채용을 미리 살펴 흐름 파악"],
    ],
  },
  applying: {
    title: "지원 단계 — 놓치지 않고 지원하기",
    line: "실제 지원 시기예요. 마감일을 챙기고 가산점 기회를 적극 활용하세요.",
    focus: ["recommended", "recruitment"],
    steps: [
      ["마감 임박 공고 우선 확인", "D-Day가 가까운 채용부터 빠르게 지원"],
      ["추천채용 가산점 활용", "학과 추천채용은 서류 가점이 있어 합격률이 높아요"],
      ["설명회로 면접 정보 얻기", "지원 기업 설명회·상담회에서 면접 팁 확보"],
    ],
  },
  done: {
    title: "축하합니다! 🎉",
    line: "취업을 완료하셨군요. 후배에게 도움이 될 정보나 새로운 기회도 둘러보세요.",
    focus: ["fair", "program"],
    steps: [["커리어 정보 계속 탐색", "이직·자기계발 프로그램도 참고해보세요"]],
  },
};

// ===== 전역 상태 =====
let allPosts = [];
let userProfile = null;
let savedIds = new Set();
let calendar = null;
let currentView = "dashboard";
// explore 상태
let exploreFilter = "all";
let exploreSearch = "";
let exploreViewMode = "cards";
let showExpired = false;
// foryou 상태
let foryouSort = "match";
let foryouFitOnly = false;
// schedule 상태
let scheduleFitFilter = "all";
// onboarding draft
let obDraft = {};
// 시간표 편집용
let ttDragging = false;
let ttDragValue = true;

// ===== 유틸 =====
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const todayStr = () => {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const escapeHtml = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ===== 프로필 / 저장 =====
function loadProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; } }
function saveProfile(p) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }
function loadSaved()  { try { return new Set(JSON.parse(localStorage.getItem(SAVED_KEY)) || []); } catch { return new Set(); } }
function persistSaved() { localStorage.setItem(SAVED_KEY, JSON.stringify([...savedIds])); }

// ===== 카테고리 =====
function getAllCategories() { return [ALL_CATEGORY, ...CATEGORIES, OTHER_CATEGORY]; }
function catColor(post) { return post.color || OTHER_CATEGORY.color; }
function catName(post) { return post.categoryName || "기타"; }
function categorizeTitle(title) {
  for (const cat of CATEGORIES)
    for (const kw of cat.keywords)
      if (title.includes(kw)) return { category: cat.id, categoryName: cat.name, color: cat.color };
  return { category: "other", categoryName: "기타", color: OTHER_CATEGORY.color };
}

// ===== 일정 / 마감 파싱 =====
function parseTimeRange(text) {
  const m = (text || "").match(/(\d{1,2}):(\d{2})\s*[~∼\-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const startH = +m[1] + (+m[2]) / 60;
  const endH   = +m[3] + (+m[4]) / 60;
  if (endH <= startH) return null;
  return { startH, endH, label: `${pad(+m[1])}:${m[2]}~${pad(+m[3])}:${m[4]}` };
}

// 게시물에서 일정 정보 추출: { eventDate, eventWeekday(0=월), deadlineDate, time, timeLabel }
function getSchedule(post) {
  const title = post.title || "";
  const desc  = post.description || "";
  const year  = post.date ? +post.date.slice(0, 4) : new Date().getFullYear();
  let deadlineDate = null, eventDate = null, eventWeekday = null;

  // 마감일: (~M/D)
  let m = title.match(/\(\s*[~∼]\s*(\d{1,2})[./](\d{1,2})\s*\)/);
  if (m) deadlineDate = ymd(year, +m[1], +m[2]);

  // 기간: (M/D~M/D) → 종료일=마감, 시작일=이벤트
  if (!deadlineDate) {
    m = title.match(/\((\d{1,2})[./](\d{1,2})\s*[~∼]\s*(\d{1,2})[./](\d{1,2})\s*\)/);
    if (m) { deadlineDate = ymd(year, +m[3], +m[4]); eventDate = ymd(year, +m[1], +m[2]); }
  }

  // 본문의 'M. D.(요일)' — 설명회/특강 같은 단일 일정에 가장 정확
  const dm = desc.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*\(([월화수목금토일])\)/);
  if (dm) { eventDate = ymd(year, +dm[1], +dm[2]); eventWeekday = WD_MAP[dm[3]]; }

  // 본문에 없으면 제목의 단일 (M/D)
  if (!eventDate) {
    m = title.match(/\((\d{1,2})[./](\d{1,2})\s*(?:,[^)]*)?\)/);
    if (m && !/[~∼]/.test(m[0])) eventDate = ymd(year, +m[1], +m[2]);
  }

  // 요일이 없으면 날짜에서 계산 (월=0)
  if (eventDate && eventWeekday === null) {
    const d = new Date(eventDate + "T00:00:00");
    if (!isNaN(d)) eventWeekday = (d.getDay() + 6) % 7;
  }

  const time = parseTimeRange(desc);
  return { eventDate, eventWeekday, deadlineDate, time, timeLabel: time ? time.label : null };
}

// 마감/종료 기준 날짜
function endDate(post) { return post._sched.deadlineDate || post._sched.eventDate || null; }
function isExpired(post) { const e = endDate(post); return e ? e < todayStr() : false; }
function isScheduledEvent(post) { return post._sched.eventWeekday !== null && post._sched.eventWeekday !== undefined && !!post._sched.eventDate; }

// 일정형(설명회·특강 등) 정보 모음
function scheduledEvents() { return allPosts.filter(isScheduledEvent); }
function upcomingEvents() {
  const t = todayStr();
  return scheduledEvents().filter((p) => p._sched.eventDate >= t)
    .sort((a, b) => a._sched.eventDate.localeCompare(b._sched.eventDate));
}
function recentEvents(n = 12) {
  const t = todayStr();
  return scheduledEvents().filter((p) => p._sched.eventDate < t)
    .sort((a, b) => b._sched.eventDate.localeCompare(a._sched.eventDate)).slice(0, n);
}
// 다가오는 일정이 있으면 그것을, 없으면(학기말 등) 최근 일정을 예시로 반환
function scheduleEventList(limit = 12) {
  const up = upcomingEvents();
  if (up.length) return { list: up, fallback: false };
  return { list: recentEvents(limit), fallback: true };
}

// D-Day 정보 { days, label, level }
function ddayInfo(post) {
  const e = endDate(post);
  if (!e) return null;
  const t0 = new Date(todayStr() + "T00:00:00");
  const t1 = new Date(e + "T00:00:00");
  const days = Math.round((t1 - t0) / 86400000);
  let label, level;
  if (days < 0) { label = "마감"; level = "normal"; }
  else if (days === 0) { label = "D-DAY"; level = "urgent"; }
  else { label = "D-" + days; level = days <= 3 ? "urgent" : days <= 7 ? "soon" : "normal"; }
  return { days, label, level };
}

// ===== 시간표 / 참여 가능 진단 =====
function classSet() {
  const raw = (userProfile && userProfile.timetable) || [];
  const keys = [];
  for (const k of raw) {
    const parts = k.split("-");
    if (parts.length === 2) {
      // 구 "d-h" (1시간) → 두 30분 슬롯으로 확장
      for (const m of [0, 30]) keys.push(`${parts[0]}-${parts[1]}-${m}`);
    } else if (parts.length === 3) {
      // 구 15분 키 → 가장 가까운 30분으로 반올림
      const [d, h, m] = parts.map(Number);
      keys.push(`${d}-${h}-${m < 30 ? 0 : 30}`);
    } else {
      keys.push(k);
    }
  }
  return new Set(keys);
}
function hasTimetable() { return classSet().size > 0; }

// 참여 가능 여부: {fit:'ok'|'clash'|'unknown', label}
function eventFit(post) {
  const s = post._sched;
  if (s.eventWeekday === null || s.eventWeekday === undefined) return null;
  if (s.eventWeekday > 4) return { fit: "ok", label: "주말 일정" };
  if (!s.time) return { fit: "unknown", label: "시간 미정" };
  if (!hasTimetable()) return { fit: "unknown", label: "시간표 미입력" };
  const cs = classSet();
  for (const blk of cs) {
    const [d, h, m = 0] = blk.split("-").map(Number);
    const slotStart = h + m / 60;
    if (d === s.eventWeekday && s.time.startH < slotStart + 0.5 && s.time.endH > slotStart)
      return { fit: "clash", label: "수업과 겹침" };
  }
  return { fit: "ok", label: "참여 가능" };
}

// ===== 맞춤 점수 / 추천 이유 =====
function matchedKeywords(post, keywords) {
  const text = ((post.title || "") + " " + (post.description || "")).toLowerCase();
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}
function scorePost(post, profile) {
  if (!profile) return 0;
  let score = 0;
  for (const id of profile.industries || []) {
    const ind = INDUSTRIES.find((i) => i.id === id);
    if (ind && matchedKeywords(post, ind.keywords)) score += 2;
  }
  for (const id of profile.jobs || []) {
    const job = JOBS.find((j) => j.id === id);
    if (job && matchedKeywords(post, job.keywords)) score += 2;
  }
  if (profile.stage && STAGE_GUIDE[profile.stage] && STAGE_GUIDE[profile.stage].focus.includes(post.category)) score += 1;
  // 시간표와 겹치지 않는 일정엔 가점
  const fit = eventFit(post);
  if (fit && fit.fit === "ok") score += 1;
  return score;
}
function isMatch(post) { return userProfile ? scorePost(post, userProfile) > 0 : false; }

// 추천 이유 문자열 (카드/모달용)
function recoReason(post, profile, { withFit = true } = {}) {
  if (!profile) return null;
  const hits = [];
  for (const id of profile.industries || []) {
    const ind = INDUSTRIES.find((i) => i.id === id);
    if (ind && matchedKeywords(post, ind.keywords)) hits.push(ind.name);
  }
  for (const id of profile.jobs || []) {
    const job = JOBS.find((j) => j.id === id);
    if (job && matchedKeywords(post, job.keywords)) hits.push(job.name);
  }
  const parts = [];
  if (hits.length) parts.push(`관심 분야 ‘${[...new Set(hits)].slice(0, 2).join(", ")}’와 관련 있어요`);
  const guide = profile.stage && STAGE_GUIDE[profile.stage];
  if (guide && guide.focus.includes(post.category)) parts.push(`‘${guide.title.split(" — ")[0]}’에 도움돼요`);
  if (withFit) {
    const fit = eventFit(post);
    if (fit && fit.fit === "ok" && fit.label === "참여 가능") parts.push("시간표와 겹치지 않아요");
    else if (fit && fit.fit === "clash") parts.push("⚠ 수업과 시간이 겹쳐요");
  }
  if (!parts.length) return null;
  return parts.join(" · ");
}

// ===== 날짜 포맷 =====
function formatDateKo(s) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}
function shortMD(s) { if (!s) return ""; const [, m, d] = s.split("-"); return `${+m}/${+d}`; }

// RSS 본문(HTML 제거로 다 붙어버린 텍스트)을 항목별 줄로 정리
function prettifyDescription(text) {
  let t = String(text || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
  if (!t) return [];
  // 1) 문장 끝(한글/영문/닫는괄호 + 마침표 + 공백, 뒤가 숫자가 아닐 때) 뒤 줄바꿈 — 날짜(5. 28.)는 보호
  t = t.replace(/([가-힣A-Za-z)\]"”』」】])\.\s+(?=\D)/g, "$1.\n");
  // 2) 번호 항목 'N. 한글' 앞 줄바꿈
  t = t.replace(/\s*(\d{1,2}\.\s*)(?=[가-힣])/g, "\n$1");
  // 3) 글머리 기호 앞 줄바꿈
  t = t.replace(/\s*(?=[■▶▷※○□◆●▪☞『「【►✓◎▣])/g, "\n");
  // 4) '붙임' 앞 줄바꿈
  t = t.replace(/\s*(?=붙임)/g, "\n");
  // 5) 정리
  t = t.replace(/[ ]*\n[ ]*/g, "\n").replace(/\n{2,}/g, "\n").trim();
  return t.split("\n").map((s) => s.trim()).filter(Boolean);
}
function isDescHead(line) { return /^(\d{1,2}\.|[■▶▷※○□◆●▪☞『「【►✓◎▣]|붙임)/.test(line); }

// 캘린더용 짧은 제목
function displayTitle(title) {
  let t = title.replace(/\([~∼]?\d{1,2}[./]\d{1,2}(?:[~∼]\d{1,2}[./]\d{1,2})?\s*(?:,[^)]*)?\)/g, "").trim();
  const bm = t.match(/^\[([^\]]+)\]/);
  if (bm) {
    const bc = bm[1];
    if (!["취업전략과", "학과공지", "사무실", "행정실", "대학원", "경력개발", "학생처", "외국어"].some((k) => bc.includes(k))) return bc;
    t = t.replace(/^\[[^\]]+\]\s*/, "");
  }
  const corp = t.match(/(?:\(주\)[가-힣A-Za-z0-9]+|[A-Za-z가-힣][A-Za-z가-힣0-9]*\s*\(주\))/);
  if (corp) return corp[0].trim();
  const cut = t.search(/\s+(?:추천채용|채용공고|채용상담|채용설명|채용안내|채용 공고|모집|안내|설명회|상담회|인턴|특강|멘토링|공모전|서포터즈|취업캠프|양성과정)/);
  if (cut > 2) return t.substring(0, cut).trim().substring(0, 18);
  return t.substring(0, 18).trim();
}

// ===== 활성 게시물 =====
function activePosts() { return showExpired ? allPosts : allPosts.filter((p) => !isExpired(p)); }
function nonExpired()  { return allPosts.filter((p) => !isExpired(p)); }

// =========================================================
//  카드 렌더
// =========================================================
function buildCard(post, { reason } = {}) {
  const match = isMatch(post);
  const fit = eventFit(post);
  const dd = ddayInfo(post);
  const s = post._sched;

  const card = document.createElement("article");
  card.className = "post-card" + (match ? " is-match" : "");

  let tags = `<span class="cat-badge" style="background:${catColor(post)}">${CAT_ICONS[post.category] || "📌"} ${escapeHtml(catName(post))}</span>`;
  if (match) tags += `<span class="match-badge">맞춤</span>`;
  if (fit && fit.fit !== "unknown") tags += `<span class="fit-pill ${fit.fit}">${fit.fit === "ok" ? "✓ " : "✕ "}${fit.label}</span>`;

  const reasonText = reason ? recoReason(post, userProfile) : null;

  // 날짜/시간 표시
  let dateLine;
  if (s.eventDate) {
    const wd = s.eventWeekday != null ? `(${WD_KO[s.eventWeekday]})` : "";
    dateLine = `🗓️ ${shortMD(s.eventDate)}${wd}${s.timeLabel ? " " + s.timeLabel : ""}`;
  } else {
    dateLine = `📅 ${shortMD(post.date)} 게시`;
  }

  let ddChip = "";
  if (dd) ddChip = `<span class="card-dl">${dd.days < 0 ? "마감" : "~" + shortMD(endDate(post)) + " · " + dd.label}</span>`;

  card.innerHTML = `
    <div class="card-top">
      <div class="card-tags">${tags}</div>
      <h3 class="card-title">${escapeHtml(post.title)}</h3>
      ${reasonText ? `<div class="card-reason">💡 ${escapeHtml(reasonText)}</div>` : ""}
      <p class="card-desc">${escapeHtml(post.description || "상세 내용은 원문을 확인해주세요.")}</p>
    </div>
    <div class="card-foot">
      <span class="card-meta-date">${dateLine}</span>
      ${ddChip}
    </div>`;
  card.addEventListener("click", () => showModal(post));
  return card;
}

function renderCardsInto(el, posts, opts = {}) {
  el.innerHTML = "";
  if (!posts.length) {
    el.innerHTML = `<div class="cards-empty"><div class="big">🔍</div><p>${opts.empty || "해당하는 정보가 없습니다."}</p></div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  posts.forEach((p) => frag.appendChild(buildCard(p, opts)));
  el.appendChild(frag);
}

// =========================================================
//  대시보드
// =========================================================
function renderDashboard() {
  const active = nonExpired();

  // --- stat cards ---
  const matchCount = userProfile ? active.filter(isMatch).length : 0;
  const upcoming = active.filter((p) => { const d = ddayInfo(p); return d && d.days >= 0; });
  const urgent = upcoming.filter((p) => ddayInfo(p).days <= 7);
  const upEvents = upcomingEvents();
  const totalEvents = scheduledEvents().length;

  const stats = [
    { ic: "📋", bg: "#E9F6EE", num: active.length, label: "현재 모집 중인 정보", sub: `전체 ${allPosts.length}건` },
    { ic: "⭐", bg: "#FFF4E0", num: userProfile ? matchCount : "–", label: "나에게 맞는 추천", sub: userProfile ? "프로필 기반" : "프로필 설정 필요" },
    { ic: "⏰", bg: "#FDECEC", num: urgent.length, label: "7일 내 마감", sub: urgent.length ? "서둘러 확인하세요" : "여유 있어요" },
    { ic: "🗓️", bg: "#E8F0FE", num: totalEvents, label: "설명회·특강 정보", sub: upEvents.length ? `다가오는 ${upEvents.length}건` : "시간표 비교 가능" },
  ];
  $("#stat-row").innerHTML = stats.map((s) => `
    <div class="stat-card">
      <div class="stat-ic" style="background:${s.bg}">${s.ic}</div>
      <div class="stat-num">${s.num}</div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-sub">${s.sub}</div>
    </div>`).join("");

  // bell badge
  const badge = $("#bell-badge");
  if (urgent.length) { badge.hidden = false; badge.textContent = urgent.length > 99 ? "99+" : urgent.length; }
  else badge.hidden = true;

  // --- 취업 전략 가이드 ---
  renderStrategy();

  // --- 카테고리 분포 ---
  const total = active.length || 1;
  const counts = CATEGORIES.map((c) => ({ ...c, n: active.filter((p) => p.category === c.id).length }))
    .filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  $("#dist-body").innerHTML = counts.map((c) => `
    <div class="dist-row" data-cat="${c.id}">
      <div class="dist-top"><b>${c.name}</b><span>${c.n}건</span></div>
      <div class="dist-bar"><i style="width:${Math.round((c.n / total) * 100)}%;background:${c.color}"></i></div>
    </div>`).join("") || `<p class="empty-line">표시할 정보가 없습니다.</p>`;
  $$("#dist-body .dist-row").forEach((row) => row.addEventListener("click", () => {
    exploreFilter = row.dataset.cat; switchView("explore");
  }));

  // --- 마감 임박 ---
  const dl = upcoming.slice().sort((a, b) => ddayInfo(a).days - ddayInfo(b).days).slice(0, 6);
  $("#deadline-count").textContent = upcoming.length + "건";
  $("#deadline-list").innerHTML = dl.map((p) => {
    const d = ddayInfo(p);
    return `<li class="deadline-item" data-id="${escapeHtml(p.id)}">
      <span class="dday ${d.level}">${d.label}</span>
      <span class="deadline-text">${escapeHtml(p.title)}</span></li>`;
  }).join("") || `<p class="empty-line">마감 임박 정보가 없습니다 👍</p>`;
  $$("#deadline-list .deadline-item").forEach((li) => li.addEventListener("click", () => {
    const post = allPosts.find((p) => p.id === li.dataset.id); if (post) showModal(post);
  }));

  // --- 오늘의 맞춤 추천 ---
  let reco;
  if (userProfile) {
    reco = active.filter(isMatch).sort((a, b) => scorePost(b, userProfile) - scorePost(a, userProfile)).slice(0, 4);
    if (!reco.length) reco = active.slice(0, 4);
  } else {
    reco = active.slice(0, 4);
  }
  renderCardsInto($("#dash-reco"), reco, { reason: !!userProfile, empty: "표시할 추천이 없습니다." });

  // --- 다가오는 설명회·특강 (없으면 최근 일정 예시) ---
  const { list: evList, fallback: evFallback } = scheduleEventList(8);
  const events = evList.slice(0, 8);
  const evTitle = $("#dash-events-title");
  if (evTitle) evTitle.textContent = evFallback ? "최근 진행된 설명회·특강 (예시)" : "다가오는 설명회·특강 일정";
  const strip = $("#dash-events");
  if (!events.length) { strip.innerHTML = `<p class="empty-line">예정된 일정이 없습니다.</p>`; }
  else {
    strip.innerHTML = "";
    events.forEach((p) => {
      const s = p._sched, fit = eventFit(p);
      const chip = document.createElement("div");
      chip.className = "event-chip";
      chip.style.borderLeftColor = catColor(p);
      chip.innerHTML = `
        <div class="ec-date">${shortMD(s.eventDate)} (${WD_KO[s.eventWeekday]})</div>
        <div class="ec-time">${s.timeLabel || "시간 미정"}</div>
        <div class="ec-title">${escapeHtml(displayTitle(p.title))}</div>
        ${fit && fit.fit !== "unknown" ? `<div class="ec-fit ${fit.fit}">${fit.fit === "ok" ? "✓ " : "✕ "}${fit.label}</div>` : ""}`;
      chip.addEventListener("click", () => showModal(p));
      strip.appendChild(chip);
    });
  }
}

function renderStrategy() {
  const tag = $("#strategy-stage-tag");
  const body = $("#strategy-body");
  const guide = userProfile && userProfile.stage ? STAGE_GUIDE[userProfile.stage] : null;
  if (!guide) {
    tag.textContent = "단계 미설정";
    body.innerHTML = `<p class="strategy-line">취업 준비 단계를 설정하면 단계에 맞는 전략과 추천을 보여드려요.</p>
      <button class="btn view btn-primary" id="strategy-setup" style="align-self:flex-start">준비 단계 설정하기</button>`;
    const b = $("#strategy-setup"); if (b) b.addEventListener("click", openOnboarding);
    return;
  }
  tag.textContent = STAGES.find((s) => s.id === userProfile.stage)?.name || "";
  const focusNames = guide.focus.map((id) => (CATEGORIES.find((c) => c.id === id) || {}).name).filter(Boolean);
  body.innerHTML = `
    <p class="strategy-line"><b>${escapeHtml(guide.title)}</b><br>${escapeHtml(guide.line)}</p>
    <div class="strategy-focus">${focusNames.map((n) => `<span class="psum-chip">🎯 ${n} 집중</span>`).join("")}</div>
    ${guide.steps.map((st, i) => `
      <div class="strategy-step">
        <span class="num">${i + 1}</span>
        <div><b>${escapeHtml(st[0])}</b><p>${escapeHtml(st[1])}</p></div>
      </div>`).join("")}`;
}

// =========================================================
//  맞춤 추천 뷰
// =========================================================
function renderForYou() {
  const summary = $("#foryou-profile");
  const cardsEl = $("#foryou-cards");
  const toolbar = $(".view[data-view='foryou'] .toolbar");

  if (!userProfile) {
    summary.innerHTML = `<div class="profile-cta">
      <p>아직 관심사를 설정하지 않았어요.<br>학년·관심 산업·직무를 알려주시면 맞춤 추천을 받을 수 있어요.</p>
      <button class="btn view btn-primary" id="foryou-setup">맞춤 설정 시작하기</button></div>`;
    $("#foryou-setup").addEventListener("click", openOnboarding);
    cardsEl.innerHTML = "";
    if (toolbar) toolbar.style.display = "none";
    return;
  }
  if (toolbar) toolbar.style.display = "flex";

  // 프로필 요약 칩
  const grade = GRADES[parseInt(userProfile.grade)] || "";
  const stage = STAGES.find((s) => s.id === userProfile.stage)?.name || "";
  const inds = (userProfile.industries || []).map((id) => INDUSTRIES.find((i) => i.id === id)?.name).filter(Boolean);
  const jobs = (userProfile.jobs || []).map((id) => JOBS.find((j) => j.id === id)?.name).filter(Boolean);
  const chips = [];
  if (grade) chips.push(`<span class="psum-chip">🎓 <b>${grade}</b></span>`);
  if (stage) chips.push(`<span class="psum-chip">📍 <b>${stage}</b></span>`);
  inds.forEach((n) => chips.push(`<span class="psum-chip">🏭 ${n}</span>`));
  jobs.forEach((n) => chips.push(`<span class="psum-chip">💼 ${n}</span>`));
  if (hasTimetable()) chips.push(`<span class="psum-chip">🗓️ 시간표 ${classSet().size}칸</span>`);
  summary.innerHTML = chips.join("");

  // 추천 목록
  let list = nonExpired().filter((p) => scorePost(p, userProfile) > 0);
  if (foryouFitOnly) list = list.filter((p) => { const f = eventFit(p); return !f || f.fit !== "clash"; });

  if (foryouSort === "match") list.sort((a, b) => scorePost(b, userProfile) - scorePost(a, userProfile) || b.date.localeCompare(a.date));
  else if (foryouSort === "date") list.sort((a, b) => b.date.localeCompare(a.date));
  else if (foryouSort === "deadline") list.sort((a, b) => {
    const da = ddayInfo(a), db = ddayInfo(b);
    const va = da && da.days >= 0 ? da.days : 9999;
    const vb = db && db.days >= 0 ? db.days : 9999;
    return va - vb;
  });

  $("#foryou-desc").textContent = `내 관심사와 맞는 정보 ${list.length}건을 골랐어요.`;
  renderCardsInto(cardsEl, list, { reason: true, empty: "관심사와 맞는 정보가 아직 없어요. 관심 산업·직무를 더 추가해보세요." });
}

// =========================================================
//  내 시간표 뷰
// =========================================================
function renderTimetable() {
  const grid = $("#timetable");
  const cs = classSet();

  // 이벤트가 걸친 15분 칸 표시용 "d-h-m" -> [titles]
  const eventCells = {};
  scheduleEventList().list.forEach((p) => {
    const s = p._sched;
    if (s.eventWeekday > 4 || !s.time) return;
    const { startH, endH } = s.time;
    TT_SLOTS.forEach(({ h, m }) => {
      const slotStart = h + m / 60;
      if (slotStart < endH && slotStart + 0.5 > startH) {
        const k = `${s.eventWeekday}-${h}-${m}`;
        (eventCells[k] = eventCells[k] || []).push(displayTitle(p.title));
      }
    });
  });

  grid.style.gridTemplateColumns = `46px repeat(${TT_DAYS.length}, 1fr)`;
  let html = `<div class="tt-cell tt-head"></div>` + TT_DAYS.map((d) => `<div class="tt-cell tt-head">${d}</div>`).join("");
  TT_SLOTS.forEach(({ h, m }) => {
    let timeCls = "tt-cell tt-time", timeText = "";
    if (m === 0) { timeCls += " tt-hour"; timeText = `${pad(h)}시`; }
    else         { timeCls += " tt-half"; timeText = "30"; }
    html += `<div class="${timeCls}">${timeText}</div>`;
    for (let d = 0; d < TT_DAYS.length; d++) {
      const key = `${d}-${h}-${m}`;
      const on = cs.has(key);
      const ev = eventCells[key];
      let cls = "tt-cell slot";
      if (m === 0) cls += " hour-top";
      else         cls += " half-top";
      if (on) cls += " on";
      if (ev) cls += " has-event";
      const title = ev ? ` title="이 시간대 일정: ${escapeHtml(ev.join(", "))}"` : "";
      html += `<div class="${cls}" data-key="${key}"${title}></div>`;
    }
  });
  grid.innerHTML = html;

  renderFitSummary();
  renderScheduleEvents();
}

function toggleCell(key, value) {
  if (!userProfile) userProfile = { grade: null, stage: null, industries: [], jobs: [], timetable: [] };
  const set = classSet();
  if (value) set.add(key); else set.delete(key);
  userProfile.timetable = [...set];
  saveProfile(userProfile);
}

function renderFitSummary() {
  const el = $("#fit-summary");
  const { list: events, fallback } = scheduleEventList();
  if (!events.length) { el.innerHTML = `<p class="fit-note">일정형(설명회·특강) 정보가 아직 없습니다.</p>`; return; }
  const fbNote = fallback ? `<p class="fit-note">현재 예정된 새 일정이 없어, <b>최근 진행된 일정</b>으로 시간표 비교 예시를 보여드려요. 새 설명회·특강이 올라오면 자동으로 비교됩니다.</p>` : "";
  if (!hasTimetable()) {
    el.innerHTML = `<p class="fit-note">왼쪽 시간표에서 수업 시간을 칠해주세요. 그러면 ${events.length}개 일정이 수업과 겹치는지 진단해드려요.</p>${fbNote}`;
    return;
  }
  let ok = 0, clash = 0, unknown = 0;
  events.forEach((p) => { const f = eventFit(p); if (!f || f.fit === "unknown") unknown++; else if (f.fit === "ok") ok++; else clash++; });
  el.innerHTML = `
    <div class="fit-stat"><span class="fs-num ok">${ok}</span><span class="fs-label">참여 가능한 일정<br>(수업과 안 겹침)</span></div>
    <div class="fit-stat"><span class="fs-num clash">${clash}</span><span class="fs-label">수업과 겹치는 일정</span></div>
    ${unknown ? `<p class="fit-note">시간 정보가 없는 일정 ${unknown}건은 원문에서 시간을 확인하세요.</p>` : ""}
    ${fbNote}`;
}

function renderScheduleEvents() {
  const { list } = scheduleEventList();
  let events = list.slice();
  if (scheduleFitFilter === "ok") events = events.filter((p) => { const f = eventFit(p); return f && f.fit === "ok"; });
  else if (scheduleFitFilter === "clash") events = events.filter((p) => { const f = eventFit(p); return f && f.fit === "clash"; });
  renderCardsInto($("#schedule-events"), events, { empty: "조건에 맞는 일정이 없습니다." });
}

// =========================================================
//  카테고리 탐색 뷰
// =========================================================
function renderFilters() {
  const c = $("#filters");
  c.innerHTML = "";
  const base = activePosts();

  if (userProfile) {
    const n = base.filter(isMatch).length;
    const btn = document.createElement("button");
    btn.className = "filter-btn custom" + (exploreFilter === "custom" ? " active" : "");
    btn.innerHTML = `⭐ 맞춤 추천 <b style="margin-left:.2rem">${n}</b>`;
    btn.addEventListener("click", () => { exploreFilter = "custom"; renderExplore(); });
    c.appendChild(btn);
  }
  getAllCategories().forEach((cat) => {
    const n = cat.id === "all" ? base.length : base.filter((p) => p.category === cat.id).length;
    if (cat.id !== "all" && n === 0) return;
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (cat.id === exploreFilter ? " active" : "");
    btn.style.setProperty("--cat-color", cat.color);
    btn.innerHTML = `<span class="dot"></span>${cat.name} <b style="margin-left:.15rem;opacity:.8">${n}</b>`;
    btn.addEventListener("click", () => { exploreFilter = cat.id; renderExplore(); });
    c.appendChild(btn);
  });
}

// includeExpired=true 이면 지난 공고까지 포함 (캘린더는 날짜 탐색이 목적이라 항상 전체)
function exploreList(includeExpired = false) {
  let list = includeExpired ? allPosts.slice() : activePosts();
  if (exploreFilter === "custom") list = list.filter(isMatch);
  else if (exploreFilter !== "all") list = list.filter((p) => p.category === exploreFilter);
  if (exploreSearch.trim()) {
    const q = exploreSearch.trim().toLowerCase();
    list = list.filter((p) => ((p.title || "") + " " + (p.description || "")).toLowerCase().includes(q));
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

function renderExplore() {
  renderFilters();
  $$("#explore-viewtoggle .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.vt === exploreViewMode));
  const cardsEl = $("#explore-cards"), calEl = $("#calendar");
  if (exploreViewMode === "cards") {
    cardsEl.hidden = false; calEl.hidden = true;
    renderCardsInto(cardsEl, exploreList(), { reason: !!userProfile && exploreFilter === "custom", empty: "조건에 맞는 정보가 없습니다. ‘지난 공고 포함’을 켜보세요." });
  } else {
    cardsEl.hidden = true; calEl.hidden = false;
    renderCalendar(exploreList(true));
  }
}

function postsToEvents(posts) {
  return posts.filter((p) => p.date).map((p) => {
    const s = p._sched;
    const start = s.eventDate || p.date;
    const ev = {
      id: p.id, title: displayTitle(p.title), start,
      backgroundColor: catColor(p), borderColor: catColor(p), textColor: "#fff",
      extendedProps: { post: p, isMatch: isMatch(p) },
    };
    if (s.deadlineDate) {
      const end = new Date(s.deadlineDate + "T00:00:00"); end.setDate(end.getDate() + 1);
      ev.end = end.toISOString().split("T")[0];
    }
    return ev;
  });
}

function renderCalendar(posts) {
  const el = $("#calendar");
  if (!calendar) {
    calendar = new FullCalendar.Calendar(el, {
      initialView: "dayGridMonth", locale: "ko", height: "auto",
      headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,listYear" },
      buttonText: { today: "오늘", month: "월별", listYear: "목록" },
      events: postsToEvents(posts),
      eventContent(info) {
        if (!info.event.extendedProps.isMatch || info.view.type !== "listYear") return;
        const wrap = document.createElement("div"); wrap.className = "fc-event-custom";
        const b = document.createElement("span"); b.className = "fc-match-badge"; b.textContent = "맞춤";
        const t = document.createElement("span"); t.textContent = info.event.title;
        wrap.append(b, t); return { domNodes: [wrap] };
      },
      eventClick(info) { info.jsEvent.preventDefault(); showModal(info.event.extendedProps.post); },
      noEventsText: "해당 기간에 정보가 없습니다.",
    });
    calendar.render();
  } else {
    calendar.removeAllEvents();
    calendar.addEventSource(postsToEvents(posts));
    calendar.updateSize();
  }
}

// =========================================================
//  모달
// =========================================================
function showModal(post) {
  const s = post._sched, fit = eventFit(post), dd = ddayInfo(post);
  $("#modal-category").textContent = catName(post);
  $("#modal-category").style.background = catColor(post);
  const fitBadge = $("#modal-fit");
  if (fit && fit.fit !== "unknown") {
    fitBadge.hidden = false;
    fitBadge.textContent = (fit.fit === "ok" ? "✓ " : "✕ ") + fit.label;
    fitBadge.style.background = fit.fit === "ok" ? "#34A85A" : "#C0392B";
  } else fitBadge.hidden = true;

  $("#modal-title").textContent = post.title;

  const meta = [];
  if (s.eventDate) meta.push(`<span>🗓️ 일정: <b>${formatDateKo(s.eventDate)}${s.timeLabel ? " " + s.timeLabel : ""}</b></span>`);
  meta.push(`<span>📅 게시: <b>${formatDateKo(post.date)}</b></span>`);
  if (dd && dd.days >= 0) meta.push(`<span>⏰ <b>~${shortMD(endDate(post))} (${dd.label})</b></span>`);
  meta.push(`<span>🏫 <b>${escapeHtml(post.source || "경영학과 취업게시판")}</b></span>`);
  $("#modal-meta").innerHTML = meta.join("");

  const reason = recoReason(post, userProfile);
  const rEl = $("#modal-reason");
  if (reason) { rEl.hidden = false; rEl.innerHTML = "💡 " + escapeHtml(reason); } else rEl.hidden = true;

  const descEl = $("#modal-description");
  const lines = prettifyDescription(post.description);
  if (!lines.length) {
    descEl.innerHTML = `<p class="desc-line">상세 내용은 원문에서 확인해주세요.</p>`;
  } else {
    descEl.innerHTML = lines.map((line) =>
      `<p class="desc-line${isDescHead(line) ? " desc-head" : ""}">${escapeHtml(line)}</p>`).join("");
  }
  $("#modal-link").href = post.link || "#";

  const saveBtn = $("#modal-save");
  const upd = () => {
    const on = savedIds.has(post.id);
    saveBtn.textContent = on ? "★ 저장됨" : "☆ 저장";
    saveBtn.classList.toggle("active", on);
  };
  upd();
  saveBtn.onclick = () => {
    if (savedIds.has(post.id)) { savedIds.delete(post.id); toast("저장을 취소했어요"); }
    else { savedIds.add(post.id); toast("저장했어요 ★"); }
    persistSaved(); upd();
  };

  const modal = $("#modal");
  modal.classList.add("visible"); modal.setAttribute("aria-hidden", "false");
}
function hideModal() { const m = $("#modal"); m.classList.remove("visible"); m.setAttribute("aria-hidden", "true"); }

// =========================================================
//  온보딩
// =========================================================
function showObStep(n) { $$(".ob-step").forEach((el) => el.classList.toggle("active", el.dataset.step === String(n))); }
function renderObChips(containerId, items, field, single) {
  const c = $("#" + containerId); c.innerHTML = "";
  items.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "ob-chip"; chip.textContent = item.name;
    const sel = single ? obDraft[field] === item.id : (obDraft[field] || []).includes(item.id);
    if (sel) chip.classList.add("selected");
    chip.addEventListener("click", () => {
      if (single) { c.querySelectorAll(".ob-chip").forEach((x) => x.classList.remove("selected")); chip.classList.add("selected"); obDraft[field] = item.id; }
      else {
        chip.classList.toggle("selected");
        const arr = obDraft[field] || [];
        obDraft[field] = chip.classList.contains("selected") ? [...arr, item.id] : arr.filter((x) => x !== item.id);
      }
    });
    c.appendChild(chip);
  });
}
function openOnboarding() {
  obDraft = userProfile
    ? { grade: userProfile.grade, stage: userProfile.stage, industries: [...(userProfile.industries || [])], jobs: [...(userProfile.jobs || [])] }
    : { grade: null, stage: null, industries: [], jobs: [] };
  renderObChips("ob-grades", GRADES.map((g, i) => ({ id: String(i), name: g })), "grade", true);
  renderObChips("ob-stages", STAGES, "stage", true);
  renderObChips("ob-industries", INDUSTRIES, "industries", false);
  renderObChips("ob-jobs", JOBS, "jobs", false);
  showObStep(userProfile ? 1 : 0);
  const ov = $("#onboarding"); ov.classList.add("visible"); ov.setAttribute("aria-hidden", "false");
}
function closeOnboarding() { const ov = $("#onboarding"); ov.classList.remove("visible"); ov.setAttribute("aria-hidden", "true"); }
function saveOnboarding() {
  userProfile = { ...(userProfile || {}), ...obDraft, timetable: (userProfile && userProfile.timetable) || [], setupDone: true };
  saveProfile(userProfile);
  closeOnboarding();
  updateProfileChip();
  toast("맞춤 설정을 저장했어요 🎯");
  renderAll();
}

// =========================================================
//  공통 UI
// =========================================================
function updateProfileChip() {
  const chip = $("#profile-btn"), avatar = $("#profile-avatar");
  if (!userProfile || !userProfile.setupDone) {
    $("#profile-name").textContent = "프로필 설정";
    $("#profile-sub").textContent = "시작하려면 클릭";
    chip.classList.remove("has-profile"); avatar.textContent = "🙂";
    return;
  }
  const grade = GRADES[parseInt(userProfile.grade)] || "경영학과";
  const stage = STAGES.find((s) => s.id === userProfile.stage)?.name || "취업 준비";
  $("#profile-name").textContent = grade;
  $("#profile-sub").textContent = stage;
  chip.classList.add("has-profile"); avatar.textContent = "🎓";
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 250); }, 2200);
}

function switchView(view) {
  currentView = view;
  $$(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
  $$(".nav-link").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".m-link").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "dashboard") renderDashboard();
  else if (view === "foryou") renderForYou();
  else if (view === "schedule") renderTimetable();
  else if (view === "explore") renderExplore();
}

function renderAll() {
  renderDashboard();
  if (currentView === "foryou") renderForYou();
  else if (currentView === "schedule") renderTimetable();
  else if (currentView === "explore") renderExplore();
}

// =========================================================
//  데이터 로드
// =========================================================
async function loadData() {
  if (window.POSTS_DATA && Array.isArray(window.POSTS_DATA.posts)) return window.POSTS_DATA;
  const res = await fetch("./data/posts.json?t=" + Date.now());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function init() {
  userProfile = loadProfile();
  savedIds = loadSaved();
  updateProfileChip();

  try {
    const data = await loadData();
    allPosts = (data.posts || []).map((p) => {
      if (!p.category || p.category === "other") { const c = categorizeTitle(p.title); p = { ...p, ...c }; }
      p._sched = getSchedule(p);
      return p;
    });

    if (data.updated) {
      const d = new Date(data.updated);
      $("#last-updated").textContent = `최종 업데이트 ${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
    }

    $("#loading").style.display = "none";
    switchView("dashboard");

    if (!userProfile || !userProfile.setupDone) setTimeout(openOnboarding, 600);
  } catch (err) {
    $("#loading").innerHTML = `<div class="cards-empty"><div class="big">⚠️</div>
      <p style="font-weight:700;color:var(--ink)">데이터를 불러올 수 없습니다</p>
      <p>터미널에서 <code>python fetch_rss.py</code> 를 실행해 데이터를 생성한 뒤,<br>로컬 서버(<code>python -m http.server</code>)로 열어주세요.</p>
      <p style="font-size:.78rem;color:var(--ink-3);margin-top:.75rem">${escapeHtml(err.message)}</p></div>`;
    console.error("[career-board]", err);
  }
}

// =========================================================
//  이벤트 바인딩
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  init();

  // nav
  $("#nav-menu").addEventListener("click", (e) => { const b = e.target.closest(".nav-link"); if (b) switchView(b.dataset.view); });
  $("#mobile-nav").addEventListener("click", (e) => { const b = e.target.closest(".m-link"); if (b) switchView(b.dataset.view); });
  document.body.addEventListener("click", (e) => { const b = e.target.closest("[data-goto]"); if (b) switchView(b.dataset.goto); });

  // header actions
  $("#refresh-btn").addEventListener("click", () => location.reload());
  $("#bell-btn").addEventListener("click", () => { switchView("dashboard"); setTimeout(() => $(".deadline-card")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); });
  $("#profile-btn").addEventListener("click", openOnboarding);
  $("#hero-profile-btn").addEventListener("click", openOnboarding);

  // foryou
  $("#foryou-edit-btn").addEventListener("click", openOnboarding);
  $("#foryou-sort").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn"); if (!b) return; foryouSort = b.dataset.sort; $$("#foryou-sort .seg-btn").forEach((x) => x.classList.toggle("active", x === b)); renderForYou(); });
  $("#foryou-fit-only").addEventListener("change", (e) => { foryouFitOnly = e.target.checked; renderForYou(); });

  // schedule
  $("#timetable-clear").addEventListener("click", () => {
    if (userProfile) { userProfile.timetable = []; saveProfile(userProfile); }
    renderTimetable(); toast("시간표를 초기화했어요");
  });
  $("#fit-filter").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn"); if (!b) return; scheduleFitFilter = b.dataset.fit; $$("#fit-filter .seg-btn").forEach((x) => x.classList.toggle("active", x === b)); renderScheduleEvents(); });

  // 시간표 드래그 토글
  const tt = $("#timetable");
  tt.addEventListener("mousedown", (e) => {
    const cell = e.target.closest(".slot"); if (!cell) return;
    e.preventDefault(); ttDragging = true;
    ttDragValue = !cell.classList.contains("on");
    cell.classList.toggle("on", ttDragValue); toggleCell(cell.dataset.key, ttDragValue);
  });
  tt.addEventListener("mouseover", (e) => { if (!ttDragging) return; const cell = e.target.closest(".slot"); if (!cell) return; cell.classList.toggle("on", ttDragValue); toggleCell(cell.dataset.key, ttDragValue); });
  // 모바일 탭
  tt.addEventListener("click", (e) => { if (ttDragging) return; const cell = e.target.closest(".slot"); if (!cell) return; const v = !cell.classList.contains("on"); cell.classList.toggle("on", v); toggleCell(cell.dataset.key, v); });
  window.addEventListener("mouseup", () => { if (ttDragging) { ttDragging = false; renderFitSummary(); renderScheduleEvents(); } });

  // explore
  $("#search-input").addEventListener("input", (e) => { exploreSearch = e.target.value; renderExplore(); });
  $("#explore-viewtoggle").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn"); if (!b) return; exploreViewMode = b.dataset.vt; renderExplore(); });
  $("#expired-check").addEventListener("change", (e) => { showExpired = e.target.checked; renderExplore(); });

  // modal
  $("#modal-close").addEventListener("click", hideModal);
  $("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) hideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideModal(); closeOnboarding(); } });

  // onboarding
  $("#onboarding").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.classList.contains("ob-next") || b.classList.contains("ob-prev")) showObStep(parseInt(b.dataset.to));
    else if (b.classList.contains("ob-skip")) closeOnboarding();
    else if (b.classList.contains("ob-save")) saveOnboarding();
  });
});
