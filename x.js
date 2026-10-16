
(() => {
  "use strict";

  const KEY = "__xCaptureBookmarklet";

  // 재실행 시 기존 수집 창 정리
  if (window[KEY]?.close) window[KEY].close();

  const doc = document;
  const tweetText = doc.querySelector('[data-testid="tweetText"]');
  const root =
    tweetText?.closest('article') ||
    tweetText?.closest('div.r-16y2uox.r-1wbh5a2.r-1ny4l3l');

  if (!root) {
    alert("게시물을 찾지 못했습니다. X 게시물 상세 화면에서 실행하세요.");
    return;
  }

  const find = selector => root.querySelector(selector);
  const unique = items => [...new Set(items.filter(Boolean))];
  const quote = value => JSON.stringify(String(value ?? ""));

  // 게시물 기본 정보
  const userBox = find('[data-testid="User-Name"]');
  const profile = userBox?.querySelector('a[href]');
  const id = (profile?.getAttribute("href") || "")
    .split("/").filter(Boolean)[0] || "";

  const nickname =
    profile?.querySelector('div[dir="ltr"] span span')?.textContent?.trim() ||
    profile?.querySelector('div[dir="ltr"] span')?.textContent?.trim() ||
    "";

  const time = find("time[datetime]");
  const date = time
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date(time.dateTime))
    : "";

  const body = find('[data-testid="tweetText"]')?.innerText?.trim() || "";
  const preview = Array.from(body).slice(0, 20).join("");

  const statusLink =
    time?.closest('a[href*="/status/"]') ||
    find('a[href*="/status/"]');

  const postUrl = statusLink
    ? new URL(statusLink.getAttribute("href"), location.origin).href
    : location.href;

  function imageUrl(src) {
    try {
      const url = new URL(src, location.href);
      if (
        url.hostname === "pbs.twimg.com" &&
        url.pathname.startsWith("/media/")
      ) {
        url.searchParams.set("name", "orig");
      }
      return url.href;
    } catch {
      return src;
    }
  }

  const images = unique(
    [...root.querySelectorAll(
      'a[href*="/status/"][href*="/photo/"] img[src], [data-testid="tweetPhoto"] img[src]'
    )].map(el => imageUrl(el.getAttribute("src")))
  );

  function posters() {
    return unique(
      [...root.querySelectorAll("video[poster]")]
        .map(video => video.poster)
    );
  }

  // 동영상 재생 감지
  const found = new Map();
  const startedAt = performance.now();
  let active = true;
  let observer = null;
  let timer = null;

  function classify(address) {
    const url = address.toLowerCase();

    if (/\.m3u8(?:[?#]|$)/.test(url)) return "M3U8";
    if (/\.mpd(?:[?#]|$)/.test(url)) return "MPD";
    if (/\.m4a(?:[?#]|$)|audio|\/aud\//.test(url))
      return "오디오 후보";
    if (/\.mp4(?:[?#]|$)/.test(url)) return "MP4 후보";
    if (/\.(m4s|ts)(?:[?#]|$)/.test(url)) return "미디어 조각";

    return "기타 미디어";
  }

  function add(address, source) {
    if (!active || !address || /^(blob:|data:)/i.test(address))
      return;

    try {
      const url = new URL(address, location.href);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();

      if (!/^https?:$/.test(url.protocol)) return;

      const media =
        host === "video.twimg.com" ||
        host.endsWith(".video.twimg.com") ||
        /\/(video|audio)\//.test(path) ||
        /\.(mp4|m3u8|mpd|m4a|m4s|ts)$/.test(path);

      if (!media) return;

      if (!found.has(url.href)) {
        found.set(url.href, {
          type: classify(url.href),
          source
        });
        update();
      }
    } catch {}
  }

  function scan() {
    if (!active) return;

    root.querySelectorAll("video, video source, source[src]")
      .forEach(el => {
        add(el.currentSrc, "플레이어");
        add(el.getAttribute("src"), "플레이어");
      });

    try {
      performance.getEntriesByType("resource")
        .filter(entry => entry.startTime >= startedAt)
        .forEach(entry => add(entry.name, "재생 기록"));
    } catch {}
  }

  // 모바일 수집 창
  const panel = doc.createElement("div");
  panel.id = "x-capture-bookmarklet-panel";
  panel.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "left:10px",
    "right:10px",
    "bottom:12px",
    "max-width:520px",
    "margin:auto",
    "padding:15px",
    "background:#15202b",
    "color:white",
    "border:1px solid #526579",
    "border-radius:16px",
    "box-shadow:0 5px 25px #0008",
    "font:14px system-ui,sans-serif"
  ].join(";");

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <b style="font-size:16px">🎬 X 동영상 수집</b>
      <button id="xc-close" style="padding:11px;border:0;border-radius:9px;background:#435466;color:white">닫기</button>
    </div>
    <div id="xc-status" style="margin:14px 0;white-space:pre-line;line-height:1.6">
      수집 준비 중
    </div>
    <div style="display:flex;gap:8px">
      <button id="xc-copy" style="flex:1;min-height:48px;border:0;border-radius:10px;background:#1d9bf0;color:white;font-size:15px;font-weight:bold">수집 종료 · 복사</button>
      <button id="xc-scan" style="min-height:48px;border:1px solid #718096;border-radius:10px;background:#273849;color:white;padding:0 12px">다시 확인</button>
    </div>
  `;

  doc.body.append(panel);

  const status = panel.querySelector("#xc-status");

  function update() {
    if (!active) return;

    const counts = {};
    for (const item of found.values()) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }

    status.textContent =
      `🔴 수집 중 · ${found.size}개 발견\n` +
      (Object.keys(counts).length
        ? Object.entries(counts)
            .map(([type, count]) => `${type}: ${count}개`)
            .join(" / ")
        : "동영상을 재생해 주세요.");
  }

  function close() {
    active = false;
    observer?.disconnect();
    if (timer) clearInterval(timer);
    panel.remove();
    if (window[KEY]?.close === close) delete window[KEY];
  }

  window[KEY] = { close };

  panel.querySelector("#xc-close").onclick = close;
  panel.querySelector("#xc-scan").onclick = scan;

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}

    const area = doc.createElement("textarea");
    area.value = value;
    area.style.cssText =
      "position:fixed;top:0;left:0;opacity:0";
    doc.body.append(area);
    area.focus();
    area.select();

    let success = false;
    try {
      success = doc.execCommand("copy");
    } catch {}

    area.remove();
    return success;
  }

  panel.querySelector("#xc-copy").onclick = async () => {
    scan();

    const videos = [...found.entries()].map(([url, info]) => ({
      url,
      ...info
    }));

    const thumbnails = posters();
    const firstImage = images[0] || thumbnails[0] || "";

    const hasVideo =
      !!root.querySelector("video,[data-testid='videoComponent']") ||
      thumbnails.length > 0;

    const primary =
      videos.find(v => v.type === "MP4 후보") ||
      videos.find(v => v.type === "M3U8") ||
      videos.find(v => v.type === "MPD");

    const lines = [
      "---",
      '"@id": ' + quote(id),
      '"@닉네임": ' + quote(nickname),
      '"@날짜": ' + quote(date),
      '"@본문": ' + quote(preview),
      ...(firstImage ? ['"@이미지": ' + quote(firstImage)] : []),
      ...(hasVideo ? [
        '"@동영상": ' + quote(primary?.url || ""),
        '"@동영상게시물": ' + quote(postUrl)
      ] : []),
      "---",
      ...images.map(url => "- " + url),
      ...thumbnails.filter(url => !images.includes(url))
        .map(url => "- " + url),
      ...(videos.length ? ["", "[동영상 주소 - 미검증]"] : []),
      ...videos.map(v => `- [${v.type}] ${v.url}`),
      "",
      body
    ];

    const result = lines.join("\n");
    const copied = await copyText(result);

    if (copied) {
      close();
      alert(`복사 완료!\n동영상 관련 주소 ${videos.length}개`);
    } else {
      status.textContent = "자동 복사가 차단되었습니다. 아래 창에서 직접 복사하세요.";
      const area = doc.createElement("textarea");
      area.value = result;
      area.style.cssText =
        "position:fixed;z-index:2147483647;inset:10%;width:80%;height:65%;background:white;color:black";
      doc.body.append(area);
      area.focus();
      area.select();
      close();
    }
  };

  try {
    observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        if (entry.startTime >= startedAt)
          add(entry.name, "실시간 기록");
      });
    });
    observer.observe({ type: "resource", buffered: false });
  } catch {}

  timer = setInterval(scan, 1200);
  scan();
  update();
})();
