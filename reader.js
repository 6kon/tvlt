
(() => {
  "use strict";

  const D = document;
  const ID = "universal-reader-v3";
  const FAB = ID + "-fab";
  const PANEL = ID + "-panel";
  const KEY = ID + "-position";
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // 이전 버전 버튼도 정리
  for (const id of [
    "universal-reader-v1-fab",
    "universal-reader-v2-fab",
    FAB
  ]) {
    D.getElementById(id)?.remove();
  }
  for (const id of [
    "universal-reader-v1-panel",
    "universal-reader-v2-panel",
    PANEL
  ]) {
    D.getElementById(id)?.remove();
  }

  const isNotion =
    /(^|\.)notion\.(so|site|com)$/.test(location.hostname);

  // 화면에 실제 표시되는 요소인지 확인
  function visible(el) {
    if (!(el instanceof Element)) return false;

    if (el.closest("[hidden],[inert],[aria-hidden='true']"))
      return false;

    let p = el;
    while (p instanceof Element) {
      const s = getComputedStyle(p);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        s.visibility === "collapse" ||
        Number(s.opacity) === 0
      ) return false;
      p = p.parentElement;
    }

    return el.getClientRects().length > 0;
  }

  // Notion 본문 추출
  function extractNotion() {
    const roots = [...D.querySelectorAll(
      ".notion-page-content"
    )].filter(visible);

    if (!roots.length) return null;

    // 여러 본문이 있으면 글이 가장 많은 영역 선택
    const root = roots.sort(
      (a, b) =>
        (b.innerText || "").length -
        (a.innerText || "").length
    )[0];

    const output = D.createElement("div");

    const blocks = [
      ...root.querySelectorAll(
        ":scope > .notion-selectable[data-block-id]"
      )
    ];

    // Notion 구조가 조금 달라진 경우
    if (!blocks.length) {
      return copyVisible(root);
    }

    for (const block of blocks) {
      if (!visible(block)) continue;

      const type = [...block.classList]
        .find(c => /^notion-.+-block$/.test(c)) || "";

      // 하위 페이지 링크, 데이터베이스, 메뉴형 블록 제외
      if (/notion-(page|collection_view|database)-block/.test(type))
        continue;

      const text = (block.innerText || "").trim();

      // 이미지 블록은 글자가 없어도 처리
      if (/notion-image-block/.test(type)) {
        const img = block.querySelector("img");
        if (img && visible(img)) {
          const result = copyVisible(img);
          if (result) output.appendChild(result);
        }
        continue;
      }

      if (!text) continue;

      let tag = "p";

      if (/notion-header-block/.test(type)) tag = "h2";
      else if (/notion-sub_header-block/.test(type)) tag = "h3";
      else if (/notion-sub_sub_header-block/.test(type)) tag = "h4";
      else if (/notion-quote-block/.test(type)) tag = "blockquote";
      else if (/notion-code-block/.test(type)) tag = "pre";
      else if (/notion-bulleted_list-block/.test(type)) tag = "li";
      else if (/notion-numbered_list-block/.test(type)) tag = "li";

      const element = D.createElement(tag);

      // 실제 텍스트 영역을 우선 사용
      const leaves = [
        ...block.querySelectorAll(
          "[data-content-editable-leaf]"
        )
      ].filter(visible);

      if (leaves.length) {
        const fragments = leaves
          .map(e => (e.innerText || e.textContent || "").trim())
          .filter(Boolean);

        element.textContent = fragments.join("\n");
      } else {
        element.textContent = text;
      }

      if (/notion-to_do-block/.test(type)) {
        const checked = block.querySelector(
          "input[type='checkbox']:checked,[aria-checked='true']"
        );
        element.textContent =
          (checked ? "☑ " : "☐ ") + element.textContent;
      }

      if (/notion-bulleted_list-block/.test(type)) {
        element.textContent = "• " + element.textContent;
        element = convertToParagraph(element);
      }

      if (/notion-numbered_list-block/.test(type)) {
        element.textContent = "• " + element.textContent;
        element = convertToParagraph(element);
      }

      output.appendChild(element);
    }

    return output;
  }

  function convertToParagraph(el) {
    const p = D.createElement("p");
    p.textContent = el.textContent;
    return p;
  }

  // 원본 HTML에서 안전하게 보이는 요소만 복사
  function copyVisible(root) {
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

    const allowed = new Set([
      "DIV","P","SPAN","BR","H1","H2","H3",
      "H4","H5","H6","STRONG","B","EM","I",
      "U","S","DEL","BLOCKQUOTE","PRE","CODE",
      "UL","OL","LI","HR","IMG","FIGURE",
      "FIGCAPTION","TABLE","THEAD","TBODY",
      "TR","TH","TD","SUP","SUB"
    ]);

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return D.createTextNode(node.nodeValue);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      if (!visible(node) || node.matches(blocked)) return null;

      const tag = allowed.has(node.tagName)
        ? node.tagName.toLowerCase()
        : "div";

      const out = D.createElement(tag);

      if (tag === "img") {
        const src =
          node.getAttribute("data-src") ||
          node.getAttribute("src");

        if (src) {
          try {
            const url = new URL(src, location.href);
            if (["http:", "https:", "data:"].includes(url.protocol)) {
              out.src = url.href;
              out.alt = node.alt || "";
            }
          } catch {}
        }
        return out;
      }

      if (tag === "ol" && node.hasAttribute("start")) {
        out.setAttribute("start", node.getAttribute("start"));
      }

      for (const child of node.childNodes) {
        const copied = walk(child);
        if (copied) out.appendChild(copied);
      }

      return out;
    }

    return walk(root);
  }

  // 일반 웹사이트 본문 추출
  function extractGeneral() {
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
    ].filter(el =>
      visible(el) && (el.innerText || "").trim().length > 100
    );

    function score(el) {
      const text = (el.innerText || "").trim().length;
      const links = [...el.querySelectorAll("a")]
        .reduce(
          (n, a) => n + (a.innerText || "").length,
          0
        );
      const paragraphs = el.querySelectorAll("p").length;
      const controls = el.querySelectorAll(
        "button,input,nav,aside"
      ).length;

      return text - links * 1.5 +
        Math.min(paragraphs, 60) * 80 -
        controls * 30;
    }

    const root = candidates.sort(
      (a, b) => score(b) - score(a)
    )[0] || D.body;

    return copyVisible(root);
  }

  function extract() {
    if (isNotion) {
      const result = extractNotion();
      if (result && result.textContent.trim().length > 0)
        return result;
    }
    return extractGeneral();
  }

  // 이동 가능한 📖 버튼
  const fab = D.createElement("button");
  fab.id = FAB;
  fab.textContent = "📖";
  fab.setAttribute("aria-label", "본문 리더기");
  fab.style.cssText = `
    position:fixed;
    left:calc(100vw - 60px);
    top:35vh;
    width:48px;height:48px;
    border:0;border-radius:50%;
    background:#343434;color:#fff;
    font-size:23px;
    box-shadow:0 3px 12px #0005;
    z-index:2147483646;
    touch-action:none;
    user-select:none;
    cursor:grab;
  `;
  D.body.appendChild(fab);

  function place(x, y) {
    fab.style.left =
      clamp(x, 4, Math.max(4, innerWidth - 52)) + "px";
    fab.style.top =
      clamp(y, 4, Math.max(4, innerHeight - 52)) + "px";
  }

  try {
    const pos = JSON.parse(localStorage.getItem(KEY));
    if (
      Number.isFinite(pos?.x) &&
      Number.isFinite(pos?.y)
    ) {
      place(pos.x * innerWidth, pos.y * innerHeight);
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

  fab.addEventListener(
    "pointercancel",
    () => drag = null
  );

  // 리더기 화면
  function openReader() {
    const existing = D.getElementById(PANEL);

    if (existing) {
      existing.remove();
      fab.style.visibility = "visible";
      return;
    }

    const content = extract();
    const plain = (content?.textContent || "").trim();

    if (plain.length < 20) {
      alert("표시된 본문을 찾지 못했습니다.");
      return;
    }

    const panel = D.createElement("div");
    panel.id = PANEL;
    panel.style.cssText = `
      position:fixed;inset:0;
      z-index:2147483647;
      display:flex;
      flex-direction:column;
      background:#faf8f3;
      color:#242424;
      font-family:system-ui,sans-serif;
    `;

    const bar = D.createElement("div");
    bar.style.cssText = `
      display:flex;align-items:center;
      gap:7px;padding:10px;
      background:#eeeae2;
      flex-shrink:0;
    `;

    const title = D.createElement("span");
    title.textContent = "📖 " + D.title;
    title.style.cssText = `
      flex:1;min-width:0;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
      font-size:13px;
      font-weight:600;
    `;
    bar.appendChild(title);

    const area = D.createElement("div");
    area.style.cssText = `
      flex:1;min-height:0;
      overflow:auto;
      padding:24px 20px 70px;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    `;

    const body = D.createElement("div");
    body.style.cssText = `
      max-width:720px;
      margin:auto;
      font-size:19px;
      line-height:1.9;
      word-break:keep-all;
      overflow-wrap:anywhere;
      white-space:normal;
    `;

    const heading = D.createElement("h2");
    heading.textContent = D.title;
    heading.style.cssText = `
      font-size:1.3em;
      line-height:1.5;
      margin:0 0 1.5em;
    `;

    body.append(heading, content);
    area.appendChild(body);

    const style = D.createElement("style");
    style.textContent = `
      #${PANEL} img {
        max-width:100%!important;
        height:auto!important;
      }
      #${PANEL} p {
        margin:0 0 1em!important;
        line-height:inherit!important;
        white-space:pre-wrap!important;
      }
      #${PANEL} h1,
      #${PANEL} h2,
      #${PANEL} h3,
      #${PANEL} h4 {
        line-height:1.5!important;
        margin:1.2em 0 .6em!important;
      }
      #${PANEL} blockquote {
        margin:1em 0!important;
        padding-left:1em!important;
        border-left:3px solid #999!important;
      }
      #${PANEL} pre {
        white-space:pre-wrap!important;
        overflow-wrap:anywhere!important;
      }
      #${PANEL} table {
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
        min-width:40px;
        height:42px;
        border:0;
        border-radius:9px;
        background:#ddd8ce;
        color:#222;
        font-size:16px;
        font-weight:600;
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
        b.style.background =
          dark ? "#40444c" : "#ddd8ce";
        b.style.color =
          dark ? "#fff" : "#222";
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
