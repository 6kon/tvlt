
(() => {
  "use strict";

  const KEY = "tvlt-reader-settings-v1";
  const ID = "tvlt-reader-controls";
  const defaults = {
    size: 17, line: 1.8, spacing: 0.3,
    padding: 18, theme: "sepia", font: "serif",
    x: null, y: null
  };

  let cfg = { ...defaults };
  try {
    cfg = { ...cfg, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {}

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
  };

  const themes = {
    light: ["#ffffff", "#262626"],
    sepia: ["#f5ebd8", "#483b2d"],
    dark: ["#24262b", "#e3e0da"],
    black: ["#090909", "#d3d3d3"]
  };

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;",
       '"':"&quot;", "'":"&#39;" })[c]);

  const url = s => {
    try {
      const u = new URL(s, location.href);
      return /^https?:$/.test(u.protocol) ? u.href : "";
    } catch { return ""; }
  };

  function inline(s) {
    const slots = [];
    const hold = html => {
      slots.push(html);
      return "\uE000" + (slots.length - 1) + "\uE001";
    };

    s = s.replace(/`([^`\n]+)`/g, (_, t) =>
      hold("<code>" + esc(t) + "</code>"));

    s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
      (raw, alt, src) => {
        const u = url(src);
        return u ? hold('<img loading="lazy" alt="' +
          esc(alt) + '" src="' + esc(u) + '">') : raw;
      });

    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (raw, label, href) => {
        const u = url(href);
        return u ? hold('<a href="' + esc(u) +
          '" target="_blank" rel="noopener noreferrer">' +
          esc(label) + '</a>') : raw;
      });

    s = s.replace(/<span\s+style=["']\s*color\s*:\s*(#[0-9a-fA-F]{3,8})\s*;?\s*["']\s*>([\s\S]*?)<\/span>/gi,
      (_, color, content) =>
        hold('<span style="color:' + color + '">' +
          esc(content) + '</span>'));

    s = esc(s)
      .replace(/==(.+?)==/g, '<mark>$1</mark>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

    return s.replace(/\uE000(\d+)\uE001/g, (_, i) => slots[+i]);
  }

  function markdown(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let quote = [], list = [], paragraph = [];

    function flush() {
      if (quote.length) {
        out.push("<blockquote>" +
          quote.map(inline).join("<br>") + "</blockquote>");
        quote = [];
      }
      if (list.length) {
        out.push("<ul>" + list.map(t =>
          "<li>" + inline(t) + "</li>").join("") + "</ul>");
        list = [];
      }
      if (paragraph.length) {
        out.push("<p>" + paragraph.map(inline).join("<br>") + "</p>");
        paragraph = [];
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      let m;

      if ((m = l.match(/^\s*(```|~~~)/))) {
        flush();
        const code = [];
        const fence = m[1];
        while (++i < lines.length && !lines[i].trimStart().startsWith(fence))
          code.push(lines[i]);
        out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
      } else if (!l.trim()) {
        flush();
      } else if ((m = l.match(/^\s*>\s?(.*)$/))) {
        if (list.length || paragraph.length) flush();
        quote.push(m[1]);
      } else if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(l)) {
        flush();
        out.push("<hr>");
      } else if ((m = l.match(/^(#{1,6})\s+(.+)$/))) {
        flush();
        const n = m[1].length;
        out.push("<h" + n + ">" + inline(m[2]) + "</h" + n + ">");
      } else if ((m = l.match(/^\s*[-*+]\s+(.+)$/))) {
        if (quote.length || paragraph.length) flush();
        list.push(m[1]);
      } else if (/^\|.*\|$/.test(l) &&
        i + 1 < lines.length &&
        /^\|[\s:|-]+\|$/.test(lines[i + 1])) {
        flush();
        const cells = s => s.slice(1, -1).split("|").map(x => inline(x.trim()));
        const head = cells(l);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
          rows.push(cells(lines[i]));
          i++;
        }
        i--;
        out.push("<table><thead><tr>" +
          head.map(x => "<th>" + x + "</th>").join("") +
          "</tr></thead><tbody>" +
          rows.map(r => "<tr>" +
            r.map(x => "<td>" + x + "</td>").join("") +
            "</tr>").join("") + "</tbody></table>");
      } else {
        if (quote.length || list.length) flush();
        paragraph.push(l);
      }
    }
    flush();
    return out.join("");
  }

  const docs = [...document.querySelectorAll("[data-tvlt1]")];

  if (!docs.length) {
    alert("먼저 북마클릿 1로 복호화하세요.");
    return;
  }

  const docStyle = `
    :host { display:block; max-width:100%; }
    .page {
      box-sizing:border-box;
      max-width:100%;
      overflow-wrap:anywhere;
      font-size:var(--size);
      line-height:var(--line);
      letter-spacing:var(--spacing);
      font-family:var(--font);
      color:var(--fg);
      background:var(--bg);
      padding:var(--pad);
      border-radius:8px;
    }
    .page * { box-sizing:border-box; max-width:100%; }
    .page p { margin:0 0 1em; }
    .page h1,.page h2,.page h3,
    .page h4,.page h5,.page h6 {
      line-height:1.4;
      margin:1em 0 .5em;
      font-weight:700;
    }
    .page h1 { font-size:1.65em; }
    .page h2 { font-size:1.4em; }
    .page h3 { font-size:1.2em; }
    .page blockquote {
      border-left:3px solid #a88bfa;
      padding:4px 0 4px 16px;
      margin:14px 0;
    }
    .page mark {
      background:#fff3b0;
      color:#333;
      padding:1px 3px;
      border-radius:3px;
    }
    .page em { color:#929292; }
    .page hr {
      border:0;
      border-top:1px solid currentColor;
      opacity:.35;
      margin:22px 0;
    }
    .page img {
      display:block;
      width:auto;
      max-width:100%;
      height:auto;
      margin:12px 0;
      border-radius:6px;
    }
    .page pre {
      overflow-x:auto;
      white-space:pre;
      background:rgba(127,127,127,.12);
      padding:12px;
      border-radius:8px;
    }
    .page code { font-family:monospace; }
    .page a { color:#579ce0; }
    .page ul { padding-left:1.5em; }
    .page table {
      display:block;
      overflow-x:auto;
      border-collapse:collapse;
    }
    .page th,.page td {
      border:1px solid #999;
      padding:7px;
    }
  `;

  const pages = [];

  for (const e of docs) {
    if (e.dataset.rendered === "1") {
      const existing = e.shadowRoot?.querySelector(".page");
      if (existing) pages.push(existing);
      continue;
    }

    const source = e.textContent;
    e.textContent = "";
    e.style.whiteSpace = "normal";
    e.style.display = "block";

    const shadow = e.shadowRoot || e.attachShadow({ mode:"open" });
    const style = document.createElement("style");
    style.textContent = docStyle;

    const page = document.createElement("div");
    page.className = "page";
    page.innerHTML = markdown(source);

    shadow.append(style, page);
    e.dataset.rendered = "1";
    pages.push(page);
  }

  function apply() {
    const [bg, fg] = themes[cfg.theme] || themes.sepia;
    for (const page of pages) {
      page.style.setProperty("--bg", bg);
      page.style.setProperty("--fg", fg);
      page.style.setProperty("--size", cfg.size + "px");
      page.style.setProperty("--line", cfg.line);
      page.style.setProperty("--spacing", cfg.spacing + "px");
      page.style.setProperty("--pad", cfg.padding + "px");
      page.style.setProperty("--font",
        cfg.font === "serif"
          ? "Georgia, 'Noto Serif KR', serif"
          : "'Noto Sans KR', sans-serif");
    }
    save();
  }

  apply();

  document.getElementById(ID)?.remove();

  const host = document.createElement("div");
  host.id = ID;
  host.style.cssText =
    "position:fixed;inset:0 auto auto 0;z-index:2147483647;" +
    "width:0;height:0;pointer-events:none;";
  document.body.appendChild(host);

  const ui = host.attachShadow({ mode:"open" });
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing:border-box; }
    button,input,select { font:inherit; }
    #fab {
      position:fixed;
      width:42px;height:42px;
      border:0;border-radius:50%;
      background:#343434;color:white;
      box-shadow:0 3px 12px #0005;
      display:flex;align-items:center;justify-content:center;
      font-size:21px;
      touch-action:none;
      user-select:none;
      pointer-events:auto;
      cursor:grab;
    }
    #panel {
      position:fixed;
      left:12px;right:12px;bottom:70px;
      max-width:360px;
      margin:auto;
      max-height:75dvh;
      overflow:auto;
      padding:17px;
      border-radius:16px;
      background:#28292d;
      color:#f2f2f2;
      box-shadow:0 6px 25px #0008;
      font:14px/1.5 sans-serif;
      pointer-events:auto;
    }
    #panel[hidden] { display:none; }
    .top { display:flex;justify-content:space-between;align-items:center; }
    .top strong { font-size:16px; }
    .top button { border:0;background:#444;color:white;border-radius:8px;padding:7px 12px; }
    label { display:block;margin-top:13px; }
    .value { float:right;color:#bbb; }
    input[type=range] { width:100%;accent-color:#b8a1f6; }
    select { width:100%;padding:9px;background:#404146;color:white;border:0;border-radius:8px; }
    .themes { display:flex;gap:8px;margin-top:8px; }
    .theme { flex:1;height:38px;border:2px solid transparent;border-radius:8px; }
    .theme.active { border-color:#b8a1f6;outline:1px solid white; }
    .hint { font-size:12px;color:#aaa;margin-top:14px; }
  `;

  const fab = document.createElement("button");
  fab.id = "fab";
  fab.textContent = "⚙";
  fab.setAttribute("aria-label", "독서 설정");

  const panel = document.createElement("div");
  panel.id = "panel";
  panel.hidden = true;

  panel.innerHTML = `
    <div class="top">
      <strong>📖 독서 설정</strong>
      <button id="close">닫기</button>
    </div>
    <label>글씨 크기 <span class="value" id="vsize"></span></label>
    <input id="size" type="range" min="12" max="30" step="1">
    <label>줄 간격 <span class="value" id="vline"></span></label>
    <input id="line" type="range" min="1.2" max="2.6" step=".1">
    <label>글자 간격 <span class="value" id="vspacing"></span></label>
    <input id="spacing" type="range" min="-.5" max="3" step=".1">
    <label>좌우 여백 <span class="value" id="vpadding"></span></label>
    <input id="padding" type="range" min="0" max="48" step="2">
    <label>배경 테마</label>
    <div class="themes" id="themes"></div>
    <label>글꼴</label>
    <select id="font">
      <option value="serif">명조체</option>
      <option value="sans">고딕체</option>
    </select>
    <p class="hint">⚙ 버튼을 드래그해 원하는 위치로 이동할 수 있습니다.</p>
  `;

  ui.append(style, fab, panel);

  const $ = id => ui.getElementById(id);

  function position(x, y) {
    x = Math.max(4, Math.min(innerWidth - 46, x));
    y = Math.max(4, Math.min(innerHeight - 46, y));
    fab.style.left = x + "px";
    fab.style.top = y + "px";
    cfg.x = x / innerWidth;
    cfg.y = y / innerHeight;
    save();
  }

  position(
    cfg.x == null ? innerWidth - 56 : cfg.x * innerWidth,
    cfg.y == null ? innerHeight * .7 : cfg.y * innerHeight
  );

  let drag = null;

  fab.addEventListener("pointerdown", ev => {
    if (drag) return;
    drag = {
      id:ev.pointerId,
      x:ev.clientX,y:ev.clientY,
      left:fab.offsetLeft,top:fab.offsetTop,
      moved:false
    };
    fab.setPointerCapture(ev.pointerId);
  });

  fab.addEventListener("pointermove", ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.hypot(dx,dy) > 7) drag.moved = true;
    if (drag.moved) position(drag.left + dx, drag.top + dy);
  });

  fab.addEventListener("pointerup", ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (!drag.moved) panel.hidden = !panel.hidden;
    drag = null;
  });

  fab.addEventListener("pointercancel", () => { drag = null; });
  $("close").onclick = () => panel.hidden = true;

  for (const [id, digits, suffix] of [
    ["size",0,"px"],["line",1,""],
    ["spacing",1,"px"],["padding",0,"px"]
  ]) {
    const input = $(id);
    input.value = cfg[id];
    const update = () => {
      cfg[id] = Number(input.value);
      $("v" + id).textContent = cfg[id].toFixed(digits) + suffix;
      apply();
    };
    input.addEventListener("input", update);
    update();
  }

  $("font").value = cfg.font;
  $("font").onchange = ev => {
    cfg.font = ev.target.value;
    apply();
  };

  for (const [name, color] of [
    ["light","#ffffff"],["sepia","#f5ebd8"],
    ["dark","#24262b"],["black","#090909"]
  ]) {
    const b = document.createElement("button");
    b.className = "theme";
    b.style.background = color;
    b.title = name;
    b.setAttribute("aria-label", name);
    if (cfg.theme === name) b.classList.add("active");
    b.onclick = () => {
      cfg.theme = name;
      ui.querySelectorAll(".theme").forEach(x =>
        x.classList.remove("active"));
      b.classList.add("active");
      apply();
    };
    $("themes").appendChild(b);
  }

  window.addEventListener("resize", () => {
    position(cfg.x * innerWidth, cfg.y * innerHeight);
  }, { passive:true });

})();
