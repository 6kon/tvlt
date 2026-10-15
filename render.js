
(() => {
  "use strict";

  const D = document;
  const ID = "universal-reader-v2";
  const FAB = ID + "-fab";
  const PANEL = ID + "-panel";
  const KEY = ID + "-pos";
  const MAX = 2147483647;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 재실행 시 기존 리더기 제거
  if (D.getElementById(FAB)) {
    D.getElementById(PANEL)?.remove();
    D.getElementById(FAB).remove();
    return;
  }

  const isNotion = /(^|\.)notion\.(so|site)$/.test(location.hostname);

  function visible(el) {
    if (!(el instanceof Element)) return false;
    if (el.closest("[hidden],[inert],[aria-hidden='true']")) return false;

    let node = el;
    while (node instanceof Element) {
      const s = getComputedStyle(node);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        s.visibility === "collapse" ||
        Number(s.opacity) === 0
      ) return false;
      node = node.parentElement;
    }

    return el.getClientRects().length > 0;
  }

  function textLength(el) {
    return (el.innerText || "").trim().length;
  }

  function findRoot() {
    if (isNotion) {
      const notionSelectors = [
        ".notion-page-content",
        "[data-content-editable-leaf]",
        ".notion-page-block",
        "[role='main']",
        "main"
      ];

      for (const selector of notionSelectors) {
        const elements = [...D.querySelectorAll(selector)]
          .filter(visible);

        if (selector === "[data-content-editable-leaf]") {
          const parent = elements[0]?.closest(
            ".notion-page-content,[role='main'],main"
          );
          if (parent && textLength(parent) > 30) return parent;
          continue;
        }

        const best = elements.sort(
          (a, b) => textLength(b) - textLength(a)
        )[0];

        if (best && textLength(best) > 30) return best;
      }
    }

    const selectors = [
      "article",
      "[itemprop='articleBody']",
      ".entry-content",
      ".post-content",
      ".article-content",
      ".chapter-content",
      ".novel-content",
      ".story-content",
      ".reading-content",
      "main",
      "[role='main']"
    ];

    const candidates = [
      ...new Set([
        ...D.querySelectorAll(selectors.join(",")),
        ...D.querySelectorAll("section,div"),
        D.body
      ])
    ].filter(el => visible(el) && textLength(el) > 100);

    function score(el) {
      const text = textLength(el);
      const links = [...el.querySelectorAll("a")]
        .reduce((n, a) => n + textLength(a), 0);
      const paragraphs = el.querySelectorAll("p").length;
      const controls = el.querySelectorAll(
        "button,input,nav,aside"
      ).length;

      return text - links * 1.5 +
        Math.min(paragraphs, 60) * 80 -
        controls * 30;
    }

    return candidates.sort((a, b) => score(b) - score(a))[0] || D.body;
  }

  function extract() {
    const root = findRoot();

    const blocked = `
      script,style,noscript,iframe,form,
      button,input,textarea,select,
      nav,header,footer,aside,
      video,audio,canvas,svg,
      [hidden],[inert],[aria-hidden='true'],
      .advertisement,.ads,.sidebar,
      .comments,.comment-list,
      .related-posts,.social-share,.pagination
    `;

    const clone = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return D.createTextNode(node.nodeValue);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const el = node;

      if (!visible(el) || el.matches(blocked)) return null;

      // 실행 가능한 요소를 복사하지 않음
      const allowed = new Set([
        "DIV","P","SPAN","BR","H1","H2","H3","H4",
        "H5","H6","STRONG","B","EM","I","U",
        "S","DEL","BLOCKQUOTE","PRE","CODE",
        "UL","OL","LI","HR","IMG","FIGURE",
        "FIGCAPTION","TABLE","THEAD","TBODY",
        "TR","TH","TD","SUP","SUB","DETAILS",
        "SUMMARY"
      ]);

      const tag = allowed.has(el.tagName) ? el.tagName : "DIV";
      const out = D.createElement(tag.toLowerCase());

      if (tag === "IMG") {
        const src =
          el.getAttribute("data-src") ||
          el.getAttribute("src");

        if (src) {
          try {
            const url = new URL(src, location.href);
            if (["http:", "https:", "data:"].includes(url.protocol)) {
              out.src = url.href;
              out.alt = el.alt || "";
            }
          } catch {}
        }
        return out;
      }

      if (tag === "OL" && el.hasAttribute("start")) {
        out.setAttribute("start", el.getAttribute("start"));
      }

      if (tag === "TH" || tag === "TD") {
        for (const a of ["colspan", "rowspan"]) {
          const v = el.getAttribute(a);
          if (v && /^\d{1,2}$/.test(v)) out.setAttribute(a, v);
        }
      }

      for (const child of el.childNodes) {
        const result = clone(child);
        if (result) out.appendChild(result);
      }

      return out;
    };

    return clone(root);
  }

  // 플로팅 버튼
  const fab = D.createElement("button");
  fab.id = FAB;
  fab.textContent = "📖";
  fab.setAttribute("aria-label", "본문 리더기");
  fab.style.cssText = `
    position:fixed;left:calc(100vw - 60px);top:35vh;
    width:48px;height:48px;border:0;border-radius:50%;
    background:#343434;color:#fff;font-size:23px;
    box-shadow:0 3px 12px #0005;
    z-index:${MAX - 1};
    touch-action:none;user-select:none;cursor:grab;
  `;
  D.body.appendChild(fab);

  function place(x, y) {
    fab.style.left =
      clamp(x, 4, Math.max(4, innerWidth - 52)) + "px";
    fab.style.top =
      clamp(y, 4, Math.max(4, innerHeight - 52)) + "px";
  }

  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) {
      place(p.x * innerWidth, p.y * innerHeight);
    }
  } catch {}

  let drag = null;

  fab.addEventListener("pointerdown", e => {
    if (drag) return;

    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: fab.offsetLeft,
      top: fab.offsetTop,
      moved: false
    };

    fab.setPointerCapture(e.pointerId);
  });

  fab.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;

    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (Math.hypot(dx, dy) > 7) drag.moved = true;

    if (drag.moved) {
      place(drag.left + dx, drag.top + dy);
    }
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
    } else {
      openReader();
    }
  });

  fab.addEventListener("pointercancel", () => drag = null);

  // 리더기
  function openReader() {
    const existing = D.getElementById(PANEL);

    if (existing) {
      existing.remove();
      fab.style.visibility = "visible";
      return;
    }

    const content = extract();
    const plain = (content?.textContent || "").trim();

    if (plain.length < 30) {
      alert("표시된 본문을 찾지 못했습니다.");
      return;
    }

    const panel = D.createElement("div");
    panel.id = PANEL;
    panel.style.cssText = `
      position:fixed;inset:0;z-index:${MAX};
      display:flex;flex-direction:column;
      background:#faf8f3;color:#242424;
      font-family:system-ui,sans-serif;
    `;

    const bar = D.createElement("div");
    bar.style.cssText = `
      display:flex;align-items:center;gap:7px;
      padding:10px;background:#eeeae2;
      flex-shrink:0;
    `;

    const title = D.createElement("span");
    title.textContent = "📖 " + D.title;
    title.style.cssText = `
      flex:1;min-width:0;overflow:hidden;
      white-space:nowrap;text-overflow:ellipsis;
      font-size:13px;font-weight:600;
    `;
    bar.appendChild(title);

    const area = D.createElement("div");
    area.style.cssText = `
      flex:1;min-height:0;overflow:auto;
      padding:24px 20px 70px;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    `;

    const body = D.createElement("div");
    body.style.cssText = `
      max-width:720px;margin:auto;
      font-size:19px;line-height:1.9;
      word-break:keep-all;overflow-wrap:anywhere;
    `;

    const heading = D.createElement("h2");
    heading.textContent = D.title;
    heading.style.cssText = `
      font-size:1.3em;line-height:1.5;
      margin:0 0 1.5em;
    `;

    body.append(heading, content);
    area.appendChild(body);

    // 사이트 CSS의 영향을 줄이는 기본 스타일
    const style = D.createElement("style");
    style.textContent = `
      #${P} img {
        max-width:100%!important;
        height:auto!important;
      }
      #${P} p {
        margin:0 0 1em!important;
        line-height:inherit!important;
      }
      #${P} h1,#${P} h2,#${P} h3 {
        line-height:1.5!important;
        margin:1.2em 0 .6em!important;
      }
      #${P} blockquote {
        margin:1em 0!important;
        padding-left:1em!important;
        border-left:3px solid #999!important;
      }
      #${P} pre {
        white-space:pre-wrap!important;
        overflow-wrap:anywhere!important;
      }
      #${P} table {
        display:block;
        max-width:100%;
        overflow-x:auto;
      }
    `;

    let size = 19;
    let dark = false;

    function button(label, action) {
      const b = D.createElement("button");
      b.textContent = label;
      b.style.cssText = `
        min-width:40px;height:42px;
        border:0;border-radius:9px;
        background:#ddd8ce;color:#222;
        font-size:16px;font-weight:600;
        touch-action:manipulation;
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

      panel.style.background =
        dark ? "#17191d" : "#faf8f3";
      panel.style.color =
        dark ? "#eeeeee" : "#242424";
      bar.style.background =
        dark ? "#252830" : "#eeeae2";

      bar.querySelectorAll("button").forEach(b => {
        b.style.background = dark ? "#40444c" : "#ddd8ce";
        b.style.color = dark ? "#fff" : "#222";
      });
    });

    button("✕", () => {
      panel.remove();
      fab.style.visibility = "visible";
    });

    panel.append(style, bar, area);
    D.body.appendChild(panel);
    fab.style.visibility = "hidden";
  }
})();
