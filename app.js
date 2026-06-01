// === 상수 ===
const ALL_CATEGORY = { id: "all", name: "전체", color: "#1E3A5F" };
const OTHER_CATEGORY = { id: "other", name: "기타", color: "#6B7280" };

// === 전역 상태 ===
let calendar = null;
let allPosts = [];
let activeFilter = "all";

// === 카테고리 유틸 ===
function getAllCategories() {
  return [ALL_CATEGORY, ...CATEGORIES, OTHER_CATEGORY];
}

function categorizeTitle(title) {
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (title.includes(kw)) {
        return { id: cat.id, name: cat.name, color: cat.color };
      }
    }
  }
  return OTHER_CATEGORY;
}

// === 날짜 포맷 ===
function toCalendarDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  // FullCalendar에 YYYY-MM-DD 형식으로 전달
  return d.toISOString().split("T")[0];
}

function formatDateKo(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
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
      extendedProps: p,
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
    views: {
      listYear: { buttonText: "전체 목록" },
    },
    events: postsToEvents(posts),
    eventClick(info) {
      info.jsEvent.preventDefault();
      showModal(info.event.extendedProps);
    },
    noEventsText: "해당 기간에 게시물이 없습니다.",
    listDaySideFormat: { weekday: "short" },
  });
  calendar.render();
}

// === 필터링 ===
function applyFilter(categoryId) {
  activeFilter = categoryId;

  // 버튼 상태 갱신
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.id === categoryId);
  });

  // 이벤트 교체
  const filtered =
    categoryId === "all"
      ? allPosts
      : allPosts.filter(p => p.category === categoryId);

  calendar.removeAllEvents();
  calendar.addEventSource(postsToEvents(filtered));
}

// === 필터 버튼 렌더 ===
function renderFilters() {
  const container = document.getElementById("filters");
  container.innerHTML = "";
  getAllCategories().forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (cat.id === "all" ? " active" : "");
    btn.dataset.id = cat.id;
    btn.textContent = cat.name;
    btn.style.setProperty("--cat-color", cat.color);
    btn.addEventListener("click", () => applyFilter(cat.id));
    container.appendChild(btn);
  });
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
  renderFilters();

  const loadingEl = document.getElementById("loading");
  const calendarEl = document.getElementById("calendar");

  try {
    const data = await loadData();
    allPosts = data.posts || [];

    // 서버에서 받은 데이터에 카테고리 정보가 없으면 프론트에서 재분류
    allPosts = allPosts.map(p => {
      if (!p.category || p.category === "other") {
        const cat = categorizeTitle(p.title);
        return { ...p, ...cat, categoryName: cat.name };
      }
      return p;
    });

    // 업데이트 시각 표시
    if (data.updated) {
      const d = new Date(data.updated);
      document.getElementById("last-updated").textContent =
        `최종 업데이트: ${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
    }

    loadingEl.style.display = "none";
    initCalendar(allPosts);

  } catch (err) {
    loadingEl.style.display = "none";
    calendarEl.innerHTML = `
      <div class="error-msg">
        <p style="font-size:2rem;margin-bottom:1rem">⚠️</p>
        <p style="font-weight:700;margin-bottom:0.5rem">데이터를 불러올 수 없습니다</p>
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
    if (e.key === "Escape") hideModal();
  });
  document.getElementById("refresh-btn").addEventListener("click", () => {
    location.reload();
  });
});
