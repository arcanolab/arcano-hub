/**
 * Arcano Lab Hub — telas em HTML puro.
 * Funções sem dependência do Foundry: o hub.mjs passa o estado e a função de tradução,
 * e a prévia (preview.html) usa as mesmas funções com dados de exemplo.
 */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

/** Situação de um módulo do catálogo para este mundo */
export function moduleState(mod, local, patron) {
  const locked = !mod.free && !tierCovers(patron, mod.tier);
  if ( locked ) return "locked";
  if ( !local ) return "missing";
  if ( isNewer(mod.version, local.version) ) return "update";
  return local.active ? "ok" : "inactive";
}

/** Tiers em ordem: um tier mais alto libera tudo dos mais baixos */
export const TIER_ORDER = ["free", "apprentice", "master", "archmage"];
function tierCovers(patron, tier) {
  if ( !patron?.tier ) return tier === "free";
  return TIER_ORDER.indexOf(patron.tier) >= TIER_ORDER.indexOf(tier);
}

export function isNewer(a, b) {
  const pa = String(a ?? "0").split(".").map(Number), pb = String(b ?? "0").split(".").map(Number);
  for ( let i = 0; i < Math.max(pa.length, pb.length); i++ ) {
    if ( (pa[i] ?? 0) !== (pb[i] ?? 0) ) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/* ---------------------------------------------------------------- */

/** Visitante vê as boas-vindas por padrão, mas pode abrir o Laboratório e as Anotações (só a Conta exige login) */
function showConnect(s) {
  if ( s.patron || !s.login ) return false;
  return !["lab", "news"].includes(s.tab);
}

export function renderHub(s, t) {
  return `
  <div class="al-hub-body">
    ${renderSide(s, t)}
    <section class="al-main" data-tab="${esc(s.tab)}">
      ${showConnect(s) ? renderConnect(s, t) : renderTab(s, t)}
    </section>
  </div>`;
}

function renderSide(s, t) {
  const p = s.patron;
  const updates = s.catalog.filter(m => moduleState(m, s.local[m.id], p) === "update").length;
  const tab = (id, icon, label, count) => `
    <button type="button" class="${s.tab === id ? "active" : ""}" data-action="hub-tab" data-tab="${id}" ${p || (id !== "account") ? "" : "disabled"}>
      <i class="fa-solid ${icon}"></i>${esc(label)}${count ? `<span class="al-count">${count}</span>` : ""}
    </button>`;
  return `
  <aside class="al-side">
    <div class="al-brand">
      <img src="${esc(s.assets)}/arcanolab.svg" alt="">
      <div class="al-wordmark">Arcano <em>Lab</em><small>Hub</small></div>
    </div>

    ${!s.login ? "" : p ? `
    <div class="al-patron">
      <div class="al-patron-top">
        <div class="al-avatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(p.name?.[0] ?? "?")}</div>
        <div>
          <div class="al-patron-name">${esc(p.name)}</div>
          <div class="al-patron-sub">${esc(t("since", {date: p.since}))}</div>
        </div>
      </div>
      <span class="al-tier ${p.tier === "archmage" ? "al-tier--gold" : ""}">${esc(t(`tier.${p.tier}`))}</span>
      ${p.founder ? `<span class="al-stamp">${esc(t("founder"))}</span>` : ""}
    </div>` : `
    <div class="al-patron al-patron--guest" data-action="hub-tab" data-tab="connect" role="button" tabindex="0">
      <div class="al-patron-top">
        <div class="al-avatar" style="background: var(--al-bg-overlay); box-shadow: 0 0 0 2px var(--al-bg-raised), 0 0 0 3.5px var(--al-border-strong);"><i class="fa-solid fa-user" style="font-size:14px;color:var(--al-text-2)"></i></div>
        <div>
          <div class="al-patron-name">${esc(t("guest"))}</div>
          <div class="al-patron-sub">${esc(t("notConnected"))}</div>
        </div>
      </div>
    </div>`}

    <nav class="al-nav">
      ${tab("lab", "fa-flask", t("tab.lab"), updates)}
      ${tab("news", "fa-scroll", t("tab.news"))}
      ${s.login ? tab("account", "fa-id-card", t("tab.account")) : ""}
    </nav>

    <div class="al-side-foot">
      <a class="al-btn al-btn--secondary al-btn--block" href="${esc(s.patreonUrl)}" target="_blank" rel="noopener">
        <i class="fa-brands fa-patreon"></i>${esc(t("openPatreon"))}
      </a>
      ${s.discordUrl ? `<a class="al-btn al-btn--ghost al-btn--block" href="${esc(s.discordUrl)}" target="_blank" rel="noopener"><i class="fa-brands fa-discord"></i>Discord</a>` : ""}
      <div class="al-meta">Hub v${esc(s.version)} · ${esc(t(s.online ? "online" : "offline"))}</div>
    </div>
  </aside>`;
}

/* ---------------------------------------------------------------- */

function renderConnect(s, t) {
  const hero = s.catalog.find(m => m.highlight) ?? s.catalog[0];
  return `
  <div class="al-connect">
    <div>
      <div class="al-kicker">${esc(t("connect.kicker"))}</div>
      <h1 class="al-title">${t("connect.title")}</h1>
      <ol class="al-steps">
        <li><span>${t("connect.step1")}</span></li>
        <li><span>${t("connect.step2")}</span></li>
        <li><span>${t("connect.step3")}</span></li>
      </ol>
      <div class="al-connect-actions">
        ${s.connecting
          ? `<span class="al-waiting"><i class="fa-solid fa-circle-notch fa-spin"></i>${esc(t("connect.waiting"))}</span>
             <button type="button" class="al-btn al-btn--ghost" data-action="cancel-login">${esc(t("cancel"))}</button>`
          : `<button type="button" class="al-btn al-btn--patreon" data-action="login"><i class="fa-brands fa-patreon"></i>${esc(t("connect.button"))}</button>
             <span class="al-note">${esc(t("connect.note"))}</span>`}
      </div>
      <p class="al-fine">${esc(t("connect.fine"))}</p>
    </div>
    ${hero ? `
    <div class="al-specimen-big">
      <span class="al-tape"></span>
      <div class="al-card-head"><span>${esc(hero.exp)}</span><span class="al-v">v${esc(hero.version)}</span></div>
      <div class="al-art" style="margin-top:10px"><img src="${esc(cover(s, hero))}" alt=""></div>
      <div class="al-card-name">${esc(hero.title)}</div>
      <div class="al-card-desc">${esc(text(hero.summary, s.lang))}</div>
      <div class="al-card-foot"><span>${esc(t("connect.latest"))}</span><span>${esc(hero.date ?? "")}</span></div>
    </div>` : ""}
  </div>`;
}

/* ---------------------------------------------------------------- */

function renderTab(s, t) {
  if ( s.tab === "news" ) return renderNews(s, t);
  if ( s.tab === "account" && s.patron ) return renderAccount(s, t);
  return renderLab(s, t);
}

function renderLab(s, t) {
  const rows = s.catalog.map(m => ({m, state: moduleState(m, s.local[m.id], s.patron)}));
  const counts = {all: rows.length};
  for ( const r of rows ) counts[r.state] = (counts[r.state] ?? 0) + 1;
  counts.installed = (counts.ok ?? 0) + (counts.update ?? 0) + (counts.inactive ?? 0);
  const filters = [["all", "filter.all"], ["installed", "filter.installed"], ["update", "filter.update"], ["missing", "filter.missing"], ["locked", "filter.locked"]];
  const show = rows.filter(r => s.filter === "all" || r.state === s.filter
    || (s.filter === "installed" && ["ok", "update", "inactive"].includes(r.state)));
  const updates = counts.update ?? 0;
  // "category": "maps" no catálogo põe o item na subseção de mapas
  const maps = show.filter(r => r.m.category === "maps");
  const modules = show.filter(r => r.m.category !== "maps");

  return `
  <div class="al-page-head">
    <div>
      <div class="al-kicker">${esc(t("lab.kicker"))}</div>
      <h1 class="al-title">${t("lab.title", {n: rows.length})}</h1>
    </div>
    ${updates ? `<span class="al-note">← ${esc(t("lab.note", {n: updates}))}</span>` : ""}
  </div>
  <div class="al-filters">
    ${filters.filter(([k]) => k === "all" || counts[k]).map(([k, label]) =>
      `<button type="button" class="al-chip ${s.filter === k ? "active" : ""}" data-action="filter" data-filter="${k}">${esc(t(label))}<b>${counts[k] ?? 0}</b></button>`).join("")}
  </div>
  ${s.copied ? `<div class="al-howto">${t("howto", {title: esc(s.copied)})}</div>` : ""}
  ${modules.length ? `<div class="al-grid">${modules.map(r => renderCard(s, t, r.m, r.state)).join("")}</div>` : ""}
  ${maps.length ? `
  <h2 class="al-section"><i class="fa-solid fa-map"></i>${esc(t("lab.maps"))}<b>${maps.length}</b></h2>
  <div class="al-grid">${maps.map(r => renderCard(s, t, r.m, r.state)).join("")}</div>` : ""}`;
}

function renderCard(s, t, m, state) {
  const local = s.local[m.id];
  const statusHtml = {
    ok: `<span class="al-status al-status--ok">${esc(t("state.ok", {v: local?.version}))}</span>`,
    inactive: `<span class="al-status al-status--off">${esc(t("state.inactive"))}</span>`,
    update: `<span class="al-status al-status--warn">${esc(t("state.update", {from: local?.version, to: m.version}))}</span>`,
    missing: `<span class="al-status al-status--off">${esc(t("state.missing"))}</span>`,
    locked: `<span class="al-status al-status--lock">${esc(t("state.locked", {tier: t(`tier.${m.tier}`)}))}</span>`
  }[state];
  const copyBtn = (label, cls = "primary") =>
    `<button type="button" class="al-btn al-btn--${cls} ${s.copied === m.title ? "is-done" : ""}" data-action="copy" data-id="${esc(m.id)}">
      <i class="fa-solid ${s.copied === m.title ? "fa-check" : "fa-link"}"></i>${esc(s.copied === m.title ? t("copied") : label)}</button>`;
  const actions = {
    ok: `<button type="button" class="al-btn al-btn--ghost" data-action="changelog" data-id="${esc(m.id)}"><i class="fa-solid fa-scroll"></i>${esc(t("act.news"))}</button>`,
    inactive: `<button type="button" class="al-btn al-btn--secondary" data-action="activate" data-id="${esc(m.id)}"><i class="fa-solid fa-power-off"></i>${esc(t("act.activate"))}</button>`,
    update: `<button type="button" class="al-btn al-btn--primary" data-action="update" data-id="${esc(m.id)}"><i class="fa-solid fa-arrows-rotate"></i>${esc(t("act.update"))}</button>`,
    missing: copyBtn(t("act.install")),
    locked: `<a class="al-btn al-btn--secondary" href="${esc(s.patreonUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-lock-open"></i>${esc(t("act.unlock"))}</a>`
  }[state];

  return `
  <article class="al-card ${state === "locked" ? "is-locked" : ""} ${state === "update" ? "is-update" : ""}">
    <span class="al-tape"></span>
    ${state === "update" ? `<span class="al-new">${esc(t("badge.update"))}</span>` : ""}
    <div class="al-card-head"><span>${esc(m.exp)}</span><span class="al-v">v${esc(m.version)}</span></div>
    <div class="al-art">
      ${m.free ? `<span class="al-free">${esc(t("free"))}</span>` : ""}
      <img src="${esc(cover(s, m))}" alt="">
      ${state === "locked" ? `<div class="al-lock"><i class="fa-solid fa-lock"></i>${esc(t("tier." + m.tier))}</div>` : ""}
    </div>
    <div class="al-card-name">${esc(m.title)}</div>
    <div class="al-card-desc">${esc(text(m.summary, s.lang))}</div>
    <div class="al-card-foot">${statusHtml}<div class="al-card-actions">${actions}</div></div>
  </article>`;
}

function renderNews(s, t) {
  const items = s.catalog.flatMap(m => (m.changelog ?? []).map(c => ({...c, title: m.title})))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
  <div class="al-page-head"><div>
    <div class="al-kicker">${esc(t("news.kicker"))}</div>
    <h1 class="al-title">${t("news.title")}</h1>
  </div></div>
  <p class="al-lead">${esc(t("news.lead"))}</p>
  <div class="al-log">
    ${items.map(c => `
    <div class="al-log-item">
      <div class="al-log-date"><b>${esc(c.date)}</b>${esc(c.kind ? t(`kind.${c.kind}`) : "")}</div>
      <div>
        <div class="al-log-title">${esc(c.title)}<span class="al-ver">v${esc(c.version)}</span></div>
        <ul>${(text(c.notes, s.lang) ?? []).map(n => `<li>${esc(n)}</li>`).join("")}</ul>
      </div>
    </div>`).join("")}
  </div>`;
}

function renderAccount(s, t) {
  const p = s.patron;
  return `
  <div class="al-page-head"><div>
    <div class="al-kicker">${esc(t("account.kicker"))}</div>
    <h1 class="al-title">${t("account.title")}</h1>
  </div></div>
  <div class="al-panel" style="margin-top:18px">
    <dl class="al-rows">
      <dt>${esc(t("account.name"))}</dt><dd>${esc(p.name)}</dd>
      <dt>${esc(t("account.tier"))}</dt><dd>${esc(t(`tier.${p.tier}`))}${p.founder ? ` · <span style="color:var(--al-gold)">${esc(t("founder"))}</span>` : ""}</dd>
      <dt>${esc(t("account.status"))}</dt><dd><span class="al-status al-status--ok" style="color:var(--al-success)">${esc(t("account.active"))}</span></dd>
      <dt>${esc(t("account.checked"))}</dt><dd>${esc(p.checkedAt ?? "—")}</dd>
      <dt>${esc(t("account.key"))}</dt><dd><span class="al-key">${esc(maskKey(p.key))}</span></dd>
    </dl>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="al-btn al-btn--secondary" data-action="refresh"><i class="fa-solid fa-rotate"></i>${esc(t("account.refresh"))}</button>
      <button type="button" class="al-btn al-btn--ghost" data-action="logout"><i class="fa-solid fa-right-from-bracket"></i>${esc(t("account.logout"))}</button>
    </div>
  </div>
  <p class="al-fine" style="max-width:560px">${esc(t("account.fine"))}</p>`;
}

/* ---------------------------------------------------------------- */

function cover(s, m) {
  if ( !m.cover ) return `${s.assets}/arcanolab.svg`;
  return /^https?:/.test(m.cover) ? m.cover : `${s.assets}/covers/${m.cover}`;
}
function text(v, lang) {
  if ( v && typeof v === "object" && !Array.isArray(v) ) return v[lang] ?? v.en ?? Object.values(v)[0];
  return v;
}
function maskKey(k) {
  if ( !k ) return "—";
  return `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
}
