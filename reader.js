
(() => {
  const doc = document;
  const ID = "universal-reader";
  const FAB = ID + "-fab";
  const PANEL = ID + "-panel";
  const KEY = ID + "-position";

  // 다시 실행하면 리더기와 버튼 제거
  if (doc.getElementById(FAB)) {
    doc.getElementById(PANEL)?.remove();
    doc.getElementById(FAB).remove();
    return;
  }

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // 본문 자동 추출
  function extract() {
    const selectors = [
      "article", '[itemprop="articleBody"]',
      ".entry-content", ".post-content",
      ".article-content", ".chapter-content",
      ".novel-content", ".story-content",
      ".reading-content", "main", '[role="main"]'
    ];

    const candidates = [
      ...new Set([
        ...doc.querySelectorAll(selectors.join(",")),
        ...doc.querySelectorAll("section,div"),
        doc.body
      ])
    ];

    const score = el => {
      const text = (el.innerText || "").trim();
      const links = [...el.querySelectorAll("a")]
        .reduce((n, a) => n + (a.innerText || "").length, 0);
      const paragraphs = el.querySelectorAll("p").length;
      return text.length - links * 1.5 +
        Math.min(paragraphs, 60) * 80;
    };

    let root = candidates
      .filter(el => (el.innerText || "").trim().length > 100)
      .sort((a, b) => score(b) - score(a))[0] || doc.body;

    // 원본은 변경하지 않고 복사본만 가공
    const copy = root.cloneNode(true);

    copy.querySelectorAll(`
      script,style,noscript,iframe,form,button,
      input,textarea,select,nav,header,footer,
      aside,video,audio,canvas,svg,
      [hidden],[aria-hidden="true"],
      .advertisement,.ads,.sidebar,.comments,
      .related-posts,.social-share,.pagination
    `).forEach(el => el.remove());

    copy.querySelectorAll("*").forEach(el => {
      if (el.tagName === "IMG") {
        const src = el.getAttribute("data-src") ||
                    el.getAttribute("src");
        if (src) {
          try {
            el.src = new URL(src, location.href).href;
          } catch {}
        }
      }

      if (el.tagName === "A") {
        el.replaceWith(doc.createTextNode(el.textContent));
        return;
      }

      for (const attr of [...el.attributes]) {
        if (
          attr.name.startsWith("on") ||
          ["style", "class", "id", "srcset"].includes(attr.name)
        ) el.removeAttribute(attr.name);
      }
    });

    return copy;
  }

  // 이동 가능한 버튼
  const fab = doc.createElement("button");
  fab.id = FAB;
  fab.textContent = "📖";
  fab.setAttribute("aria-label", "본문 리더기");
  fab.style.cssText = `
    position:fixed;left:calc(100vw - 60px);top:35vh;
    width:48px;height:48px;border:0;border-radius:50%;
    background:#343434;color:white;font-size:23px;
    box-shadow:0 3px 12px #0005;z-index:2147483646;
    touch-action:none;user-select:none;cursor:grab;
  `;
  doc.body.appendChild(fab);

  function place(x, y) {
    fab.style.left = clamp(x, 4, Math.max(4, innerWidth - 52)) + "px";
    fab.style.top = clamp(y, 4, Math.max(4, innerHeight - 52)) + "px";
  }

  try {
    const pos = JSON.parse(localStorage.getItem(KEY));
    if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y))
      place(pos.x * innerWidth, pos.y * innerHeight);
  } catch {}

  let drag = null;

  fab.addEventListener("pointerdown", e => {
    drag = {
      id: e.pointerId, x: e.clientX, y: e.clientY,
      left: fab.offsetLeft, top: fab.offsetTop, moved: false
    };
    fab.setPointerCapture(e.pointerId);
  });

  fab.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 7) drag.moved = true;
    if (drag.moved) place(drag.left + dx, drag.top + dy);
  });

  fab.addEventListener("pointerup", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;

    if (moved) {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          x: fab.offsetLeft / innerWidth,
          y: fab.offsetTop / innerHeight
        }));
      } catch {}
    } else openReader();
  });

  fab.addEventListener("pointercancel", () => drag = null);

  // 리더기 화면
  function openReader() {
    const existing = doc.getElementById(PANEL);
    if (existing) {
      existing.remove();
      fab.style.visibility = "visible";
      return;
    }

    const content = extract();
    if ((content.textContent || "").trim().length < 30) {
      alert("본문을 찾지 못했습니다.");
      return;
    }

    const panel = doc.createElement("div");
    panel.id = PANEL;
    panel.style.cssText = `
      position:fixed;inset:0;z-index:2147483647;
      display:flex;flex-direction:column;
      background:#faf8f3;color:#242424;
      font-family:system-ui,sans-serif;
    `;

    const bar = doc.createElement("div");
    bar.style.cssText = `
      display:flex;align-items:center;gap:7px;
      padding:10px;background:#eeeae2;flex-shrink:0;
    `;

    const title = doc.createElement("span");
    title.textContent = "📖 " + doc.title;
    title.style.cssText = `
      flex:1;min-width:0;overflow:hidden;
      white-space:nowrap;text-overflow:ellipsis;
      font-size:13px;
    `;
    bar.appendChild(title);

    const area = doc.createElement("div");
    area.style.cssText = `
      flex:1;min-height:0;overflow:auto;
      padding:24px 20px 70px;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    `;

    const body = doc.createElement("div");
    body.style.cssText = `
      max-width:720px;margin:auto;font-size:19px;
      line-height:1.9;word-break:keep-all;
      overflow-wrap:anywhere;
    `;

    const heading = doc.createElement("h2");
    heading.textContent = doc.title;
    heading.style.cssText = "font-size:1.3em;line-height:1.5";
    body.append(heading, content);
    area.appendChild(body);

    let size = 19;
    let dark = false;

    function button(label, action) {
      const b = doc.createElement("button");
      b.textContent = label;
      b.style.cssText = `
        min-width:40px;height:42px;border:0;
        border-radius:9px;background:#ddd8ce;
        color:#222;font-size:16px;
        font-weight:600;touch-action:manipulation;
      `;
      b.onclick = action;
      bar.appendChild(b);
      return b;
    }

    button("A−", () => {
      size = clamp(size - 2, 13, 35);
      body.style.fontSize = size + "px";
    });

    button("A+", () => {
      size = clamp(size + 2, 13, 35);
      body.style.fontSize = size + "px";
    });

    button("◐", () => {
      dark = !dark;
      panel.style.background = dark ? "#17191d" : "#faf8f3";
      panel.style.color = dark ? "#eee" : "#242424";
      bar.style.background = dark ? "#252830" : "#eeeae2";

      bar.querySelectorAll("button").forEach(b => {
        b.style.background = dark ? "#40444c" : "#ddd8ce";
        b.style.color = dark ? "#fff" : "#222";
      });
    });

    button("✕", () => {
      panel.remove();
      fab.style.visibility = "visible";
    });

    panel.append(bar, area);
    doc.body.appendChild(panel);
    fab.style.visibility = "hidden";
  }
})();
