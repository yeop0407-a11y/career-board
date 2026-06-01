"""
경영학과 취업정보 RSS 수집 스크립트
사용법: python fetch_rss.py
출력: data/posts.json (사이트가 읽는 데이터 파일)
"""

import feedparser
import json
import os
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

# =============================================
# RSS 피드 URL 설정 (config.js와 동일하게 유지)
# =============================================
RSS_FEEDS = [
    {
        "url": "https://biz.pusan.ac.kr/bbs/biz/1093/rssList.do?row=50",
        "name": "경영학과 취업게시판",
    },
]

# =============================================
# 카테고리 설정 (config.js와 동일하게 유지)
# =============================================
CATEGORIES = [
    {
        "id": "fair",
        "name": "채용설명회",
        "color": "#2563EB",
        "keywords": ["채용설명회", "채용상담회", "설명회", "상담회", "리쿠르팅", "기업투어", "런치설명회"],
    },
    {
        "id": "recommended",
        "name": "추천채용",
        "color": "#DC2626",
        "keywords": ["추천채용", "추천 채용", "취업추천", "학교추천"],
    },
    {
        "id": "program",
        "name": "취업프로그램",
        "color": "#D97706",
        "keywords": ["특강", "멘토링", "면접 프로그램", "자기소개서", "자소서", "취업캠프", "컨설팅", "첨삭", "양성과정", "직무체험", "체험캠프", "취업특강", "온라인 현직자"],
    },
    {
        "id": "recruitment",
        "name": "일반채용",
        "color": "#16A34A",
        "keywords": ["채용공고", "채용 공고", "공개채용", "공채", "모집공고", "신입사원", "경력사원", "신입/경력", "인턴십", "인턴", "채용"],
    },
    {
        "id": "contest",
        "name": "공모전/대외활동",
        "color": "#7C3AED",
        "keywords": ["공모전", "대외활동", "서포터즈", "아이디어 경진", "경진대회"],
    },
]


def categorize(title: str) -> dict:
    """제목 키워드로 카테고리 분류"""
    for cat in CATEGORIES:
        for kw in cat["keywords"]:
            if kw in title:
                return {"category": cat["id"], "categoryName": cat["name"], "color": cat["color"]}
    return {"category": "other", "categoryName": "기타", "color": "#6B7280"}


def parse_date(entry) -> str:
    """RSS 항목에서 날짜를 YYYY-MM-DD 형식으로 추출"""
    for attr in ("published", "updated", "created"):
        raw = getattr(entry, attr, None)
        if not raw:
            continue
        try:
            dt = parsedate_to_datetime(raw)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    return datetime.now().strftime("%Y-%m-%d")


def strip_html(text: str) -> str:
    """HTML 태그 제거"""
    text = re.sub(r"<[^>]+>", "", text or "")
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    return text.strip()


def fetch_all() -> list:
    posts = []
    seen = set()

    for feed_cfg in RSS_FEEDS:
        url = feed_cfg["url"]
        name = feed_cfg["name"]
        print(f"Fetching: {name}")
        print(f"  URL: {url}")

        feed = feedparser.parse(url)

        if feed.bozo:
            print(f"  Warning: {feed.bozo_exception}")

        if not feed.entries:
            print(f"  No entries found. (HTTP status: {feed.get('status', 'N/A')})")
            continue

        for entry in feed.entries:
            uid = getattr(entry, "id", None) or getattr(entry, "link", "")
            if uid in seen:
                continue
            seen.add(uid)

            title = getattr(entry, "title", "(제목 없음)").strip()
            # RSS 피드 오류: 제목 끝에 불필요한 "}" 문자 제거
            title = title.rstrip("}")
            # HTML 엔티티 디코딩 (&amp; → &)
            title = strip_html(title)
            link = getattr(entry, "link", "")
            description = strip_html(getattr(entry, "summary", ""))[:500]

            cat_info = categorize(title)

            posts.append({
                "id": uid,
                "title": title,
                "link": link,
                "date": parse_date(entry),
                "source": name,
                "description": description,
                **cat_info,
            })

        print(f"  Collected {len(feed.entries)} items")

    # 날짜 내림차순 정렬
    posts.sort(key=lambda p: p["date"], reverse=True)
    return posts


def save(posts: list):
    os.makedirs("data", exist_ok=True)
    output = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "count": len(posts),
        "posts": posts,
    }
    with open("data/posts.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n[OK] Saved {len(posts)} posts -> data/posts.json")


if __name__ == "__main__":
    print("=" * 50)
    print("경영학과 취업정보 RSS 수집기")
    print("=" * 50)
    posts = fetch_all()
    if posts:
        save(posts)
    else:
        print("\n⚠️  수집된 게시물이 없습니다.")
        print("RSS URL이 올바른지 확인하고, fetch_rss.py 상단의 RSS_FEEDS를 수정해주세요.")
