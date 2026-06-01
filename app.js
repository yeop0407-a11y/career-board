// === 상수 ===
const ALL_CATEGORY = { id: "all", name: "전체", color: "#1E3A5F" };
const OTHER_CATEGORY = { id: "other", name: "기타", color: "#6B7280" };
const PROFILE_KEY = "career_board_profile";
const CAT_ICONS = {
  fair: "🏢", recommended: "⭐", program: "📚",
  recruitment: "💼", contest: "🏆", other: "📌",
};

// === 전역 상태 ===
let calendar = null;
let allPosts = [];
let activeFilter = "all";
let currentView = "cards";
let userProfile = null;
let obDraft = {};

// === 프로필 관리 ===
function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}
function saveProfile(p) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }

// === 카테고리 유틸 ===
function getAllCategories() {
  return [ALL_CATEGORY, ...CATEGORIES, OTHER_CATEGORY];
}

function categorizeTitle(title) {
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (title.includes(kw)) return { id: cat.id, name: cat.name, color: cat.color };
    }
  }
  return OTHER_CATEGORY;
}

// === 맞춤 점수 ===
function scorePost(post, profile) {
  if (!profile) return 0;
  const text = ((post.title || "") + " " + (post.description || "")).toLowerCase();
  let score = 0;
  for (const id of (profile.industries || [])) {
    const ind = INDUSTRIES.find(i => i.id === id);
    if (ind && ind.keywords.some(kw => text.includes(kw.toLowerCase()))) score++;
  }
  for (const id of (profile.jobs || [])) {
    const job = JOBS.find(j => j.id === id);
    if (job && job.keywords.some(kw => text.includes(kw.toLowerCase()))) score++;
  }
  if (profile.stage === "explore" && ["program", "fair"].includes(post.category)) score++;
  if (profile.stage === "applying" && ["recommended", "recruitment"].includes(post.category)) score++;
  return score;
}

// === 날짜 포맷 ===
function toCalendarDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.toISOString().split("T")[0];
}

function formatDateKo(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

function extractDeadline(title) {
  const m = title.match(/[~∼](\d{1,2})[./](\d{1,2})/);
  if (!m) return null;
  const month = parseInt(m[1]);
  const day = parseInt(m[2]);
  return `${month}/${day}`;
}

// === 카드 뷰 렌더 ===
function renderCards(posts) {
  const container = document.getElementById("cards-view");
  if (!posts.length) {
    container.innerHTML = '<p class="cards-no-results">해당 게시물이 없습니다.</p>';
    return;
  }
  container.innerHTML = "";
  posts.forEach(post => {
    const isMatch = userProfile ? scorePost(post, userProfile) > 0 : false;
    const icon = CAT_ICONS[post.category] || "📌";
    const deadline = extractDeadline(post.title);
    const card = document.createElement("article");
    card.className = "post-card";
    card.innerHTML = `
      <div class="card-banner" style="background:linear-gradient(135deg,${post.color}ee,${post.color}88)">
        <span class="card-banner-icon">${icon}</span>
        ${isMatch ? '<span class="card-match-badge">맞춤</span>' : ""}
      </div>
      <div class="card-body">
        <span class="card-category-badge" style="background:${post.color}">${post.categoryName || "기타"}</span>
        <h3 class="card-title">${post.title}</h3>
        <p class="card-meta">📅 ${formatDateKo(post.date)}</p>
        <p class="card-desc">${post.description || "상세 내용은 원문을 확인해주세요."}</p>
      </div>
      <div class="card-footer">
        <span class="card-deadline">${deadline ? `⏰ ~${deadline}` : ""}</span>
        <a href="${post.link}" target="_blank" rel="noopener noreferrer" class="card-link"
           onclick="event.stopPropagation()">원문 보기 →</a>
      </div>
    `;
    card.addEventListener("click", () => showModal(post));
    container.appendChild(card);
  });
}

// === posts → FullCalendar events ===
function postsToEvents(posts) {
  return posts
    .filter(p => toCalendarDate(p.date))
    .map(p => ({
      id: p.id,
      title: p.title,
      start: toCalendarDate(p.date),
      backgroundColor: p.color,
      borderColor: p.color,
      textColor: "#fff",
      extendedProps: { ...p, isMatch: userProfile ? scorePost(p, userProfile) > 0 : false },
    }));
}

// === FullCalendar 초기화 ===
function initCalendar(posts) {
  const el = document.getElementById("calendar");
  calendar = new FullCalendar.Calendar(el, {
    initialView: "listYear",
    locale: "ko",
    height: "auto",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listYear",
    },
    buttonText: { today: "오늘", month: "월별 보기", listYear: "전체 목록" },
    views: { listYear: { buttonText: "전체 목록" } },
    events: postsToEvents(posts),
    eventContent(info) {
      if (!info.event.extendedProps.isMatch || info.view.type !== "listYear") return;
      const wrap = document.createElement("div");
      wrap.className = "fc-event-custom";
      const badge = document.createElement("span");
      badge.className = "fc-match-badge";
      badge.textContent = "맞춤";
      const title = document.createElement("span");
      title.textContent = info.event.title;
      wrap.appendChild(badge);
      wrap.appendChild(title);
      return { domNodes: [wrap] };
    },
    eventClick(info) {
      info.jsEvent.preventDefault();
      showModal(info.event.extendedProps);
    },
    noEventsText: "해당 기간에 게시물이 없습니다.",
    listDaySideFormat: { weekday: "short" },
  });
  calendar.render();
}

// === 뷰 전환 ===
function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const cardsEl = document.getElementById("cards-view");
  const calEl = document.getElementById("calendar");
  cardsEl.style.display = view === "cards" ? "grid" : "none";
  calEl.style.display = view === "calendar" ? "block" : "none";
  if (view === "calendar" && calendar) calendar.updateSize();
}

// === 필터링 ===
function applyFilter(categoryId) {
  activeFilter = categoryId;
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.id === categoryId);
  });

  let filtered;
  if (categoryId === "custom") {
    filtered = allPosts.filter(p => scorePost(p, userProfile) > 0);
  } else if (categoryId === "all") {
    filtered = allPosts;
  } else {
    filtered = allPosts.filter(p => p.category === categoryId);
  }

  renderCards(filtered);
  if (calendar) {
    calendar.removeAllEvents();
    calendar.addEventSource(postsToEvents(filtered));
  }
}

// === 필터 버튼 렌더 ===
function renderFilters() {
  const container = document.getElementById("filters");
  container.innerHTML = "";

  if (userProfile) {
    const matchCount = allPosts.filter(p => scorePost(p, userProfile) > 0).length;
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (activeFilter === "custom" ? " active" : "");
    btn.dataset.id = "custom";
    btn.textContent = `⭐ 맞춤 추천 ${matchCount}`;
    btn.style.setProperty("--cat-color", "#F59E0B");
    btn.addEventListener("click", () => applyFilter("custom"));
    container.appendChild(btn);
  }

  getAllCategories().forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (cat.id === activeFilter ? " active" : "");
    btn.dataset.id = cat.id;
    btn.textContent = cat.name;
    btn.style.setProperty("--cat-color", cat.color);
    btn.addEventListener("click", () => applyFilter(cat.id));
    container.appendChild(btn);
  });
}

// === 프로필 버튼 갱신 ===
function updateProfileBtn() {
  const btn = document.getElementById("profile-btn");
  if (!userProfile) {
    btn.textContent = "프로필 설정";
    btn.classList.remove("has-profile");
  } else {
    const grade = GRADES[parseInt(userProfile.grade)] || userProfile.grade;
    const stage = STAGES.find(s => s.id === userProfile.stage)?.name || "";
    btn.textContent = `${grade} · ${stage}`;
    btn.classList.add("has-profile");
  }
}

// === 온보딩 모달 ===
function showObStep(n) {
  document.querySelectorAll(".ob-step").forEach(el => {
    el.classList.toggle("active", el.dataset.step === String(n));
  });
}

function renderObChips(containerId, items, field, isSingle) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  items.forEach(item => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ob-chip";
    chip.dataset.id = item.id;
    chip.textContent = item.name;
    const isSelected = isSingle
      ? obDraft[field] === item.id
      : (obDraft[field] || []).includes(item.id);
    if (isSelected) chip.classList.add("selected");
    chip.addEventListener("click", () => {
      if (isSingle) {
        container.querySelectorAll(".ob-chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        obDraft[field] = item.id;
      } else {
        chip.classList.toggle("selected");
        const arr = obDraft[field] || [];
        obDraft[field] = chip.classList.contains("selected")
          ? [...arr, item.id]
          : arr.filter(id => id !== item.id);
      }
    });
    container.appendChild(chip);
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
  const overlay = document.getElementById("onboarding");
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
}

function closeOnboarding() {
  const overlay = document.getElementById("onboarding");
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
}

function saveAndClose() {
  userProfile = { ...obDraft, setupDone: true };
  saveProfile(userProfile);
  closeOnboarding();
  updateProfileBtn();
  renderFilters();
  applyFilter(activeFilter);
}

// === 모달 ===
function showModal(post) {
  const modal = document.getElementById("modal");
  const badge = document.getElementById("modal-category");

  badge.textContent = post.categoryName || post.category;
  badge.style.backgroundColor = post.color || "#6B7280";

  document.getElementById("modal-title").textContent = post.title;
  document.getElementById("modal-date").textContent = formatDateKo(post.date);
  document.getElementById("modal-source").textContent = post.source || "-";
  document.getElementById("modal-description").textContent =
    post.description?.trim() || "상세 내용은 원문을 확인해주세요.";

  const link = document.getElementById("modal-link");
  link.href = post.link || "#";

  modal.classList.add("visible");
  modal.setAttribute("aria-hidden", "false");
}

function hideModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("visible");
  modal.setAttribute("aria-hidden", "true");
}

// === 데이터 로드 ===
async function loadData() {
  const res = await fetch("./data/posts.json?t=" + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// === 초기화 ===
async function init() {
  userProfile = loadProfile();
  updateProfileBtn();
  renderFilters();

  const loadingEl = document.getElementById("loading");
  const cardsEl = document.getElementById("cards-view");

  try {
    const data = await loadData();
    allPosts = data.posts || [];

    allPosts = allPosts.map(p => {
      if (!p.category || p.category === "other") {
        const cat = categorizeTitle(p.title);
        return { ...p, ...cat, categoryName: cat.name };
      }
      return p;
    });

    if (data.updated) {
      const d = new Date(data.updated);
      document.getElementById("last-updated").textContent =
        `최종 업데이트: ${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
    }

    loadingEl.style.display = "none";
    renderFilters();
    renderCards(allPosts);
    initCalendar(allPosts);

    document.getElementById("view-toggle").style.display = "flex";
    cardsEl.style.display = "grid";

    if (!userProfile) setTimeout(openOnboarding, 700);

  } catch (err) {
    loadingEl.style.display = "none";
    cardsEl.style.display = "grid";
    document.getElementById("view-toggle").style.display = "flex";
    cardsEl.innerHTML = `
      <div class="cards-no-results" style="padding:3rem">
        <p style="font-size:2rem;margin-bottom:1rem">⚠️</p>
        <p style="font-weight:700;margin-bottom:0.5rem;color:#374151">데이터를 불러올 수 없습니다</p>
        <p>아래 명령어를 실행하여 데이터를 먼저 생성해주세요.</p>
        <p style="margin-top:0.75rem"><code>python fetch_rss.py</code></p>
        <p style="font-size:0.8rem;margin-top:1rem;color:#94A3B8">${err.message}</p>
      </div>
    `;
    console.error("[career-board]", err);
  }
}

// === 이벤트 리스너 ===
document.addEventListener("DOMContentLoaded", () => {
  init();

  document.getElementById("modal-close").addEventListener("click", hideModal);
  document.getElementById("modal").addEventListener("click", e => {
    if (e.target === document.getElementById("modal")) hideModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { hideModal(); closeOnboarding(); }
  });
  document.getElementById("refresh-btn").addEventListener("click", () => location.reload());

  document.getElementById("profile-btn").addEventListener("click", openOnboarding);

  document.getElementById("view-toggle").addEventListener("click", e => {
    const btn = e.target.closest(".view-btn");
    if (btn) switchView(btn.dataset.view);
  });

  document.getElementById("onboarding").addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("ob-next")) showObStep(parseInt(btn.dataset.to));
    else if (btn.classList.contains("ob-prev")) showObStep(parseInt(btn.dataset.to));
    else if (btn.classList.contains("ob-skip")) closeOnboarding();
    else if (btn.classList.contains("ob-save")) saveAndClose();
  });
});
