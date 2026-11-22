/**
 * Arcano Lab Hub — Foundry VTT v14
 * Conecta o Patreon do mestre, mostra o catálogo do Arcano Lab, entrega os links
 * pessoais de instalação e avisa quando sai versão nova.
 *
 * O servidor (pasta worker/) responde:
 *   GET  /catalog                       catálogo público
 *   POST /auth/start                    { state, url } — abre o login do Patreon
 *   GET  /auth/poll?state=…             { status: "pending" | "done" | "error", key, patron }
 *   GET  /me            (Bearer chave)  { patron } ou 401
 *   GET  /m/<chave>/<id>/module.json    manifest pessoal (o que o Foundry instala)
 */
import { renderHub, moduleState, isNewer } from "./views.mjs";

const MOD = "arcano-hub";
const ASSETS = `modules/${MOD}/assets`;
const PATREON_URL = "https://www.patreon.com/arcanolab";
const DISCORD_URL = "";
const DEFAULT_SERVER = "https://hub.arcanolab.workers.dev";
const CACHE_KEY = `${MOD}.catalog`;
const VERSIONS_KEY = `${MOD}.versions`;
const VERSIONS_TTL = 6 * 60 * 60 * 1000;   // relê as versões no GitHub a cada 6 h

/**
 * false: o Hub funciona sem servidor. O catálogo vem do GitHub, não há login e o Patreon é só um link.
 * true: liga o login do Patreon e os links pessoais (precisa do servidor da pasta worker/ no ar).
 */
const PATREON_LOGIN = false;
const CATALOG_URL = "https://raw.githubusercontent.com/arcanolab/arcano-hub/main/catalog.json";

const t = (key, data = {}) => {
  let s = game.i18n.localize(`ALHUB.${key}`);
  for ( const [k, v] of Object.entries(data) ) s = s.replaceAll(`{${k}}`, v);
  return s;
};
const server = () => (game.settings.get(MOD, "server") || DEFAULT_SERVER).replace(/\/+$/, "");
const session = () => game.settings.get(MOD, "session") ?? {};
/** Módulo público (grátis, no GitHub): o link é o manifest oficial. Módulo do Lab: link pessoal com a chave. */
const installLink = mod => mod.manifest || `${server()}/m/${session().key}/${mod.id}/module.json`;

/* -------------------------------------------- */
/*  Servidor                                    */
/* -------------------------------------------- */

async function api(path, {method = "GET", body, auth = false, timeout = 8000} = {}) {
  const headers = {"Accept": "application/json"};
  if ( body ) headers["Content-Type"] = "application/json";
  if ( auth && session().key ) headers.Authorization = `Bearer ${session().key}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${server()}${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal});
    const data = await res.json().catch(() => ({}));
    return {ok: res.ok, status: res.status, data};
  } finally { clearTimeout(timer); }
}

const Hub = {
  catalog: [],
  online: false,

  async loadCatalog() {
    try {
      let data;
      if ( PATREON_LOGIN ) {
        const res = await api("/catalog");
        if ( !res.ok ) throw new Error("catalog");
        data = res.data;
      } else {
        const res = await fetch(CATALOG_URL, {cache: "no-cache"});
        if ( !res.ok ) throw new Error("catalog");
        data = await res.json();
      }
      this.catalog = data.modules ?? [];
      this.online = true;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(this.catalog)); } catch(err) {}
    } catch(err) {
      this.online = false;
      try { this.catalog = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]"); } catch(e) { this.catalog = []; }
      // sem servidor e sem cópia guardada: usa o catálogo que vem dentro do módulo
      if ( !this.catalog.length ) try {
        const res = await fetch(foundry.utils.getRoute(`modules/${MOD}/catalog.json`));
        if ( res.ok ) this.catalog = (await res.json()).modules ?? [];
      } catch(e) {}
    }
    if ( !PATREON_LOGIN ) await this.applyLiveVersions();
    return this.catalog;
  },

  /** Sem servidor: a versão de cada módulo público vem do último release do repositório (campo "repo") */
  async applyLiveVersions() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? "{}"); } catch(e) {}
    const versions = saved.versions ?? {};
    if ( !saved.at || (Date.now() - saved.at > VERSIONS_TTL) ) {
      await Promise.all(this.catalog.filter(m => m.repo).map(async m => {
        try {
          const res = await fetch(`https://api.github.com/repos/${m.repo}/releases/latest`, {headers: {Accept: "application/vnd.github+json"}});
          if ( !res.ok ) return;
          const rel = await res.json();
          const version = String(rel.tag_name ?? "").replace(/^v/i, "");
          if ( version ) versions[m.id] = {version, date: String(rel.published_at ?? "").slice(0, 10)};
        } catch(e) {}
      }));
      try { localStorage.setItem(VERSIONS_KEY, JSON.stringify({at: Date.now(), versions})); } catch(e) {}
    }
    // só troca quando o release é mais novo que o que está escrito no catálogo
    this.catalog = this.catalog.map(m => (versions[m.id] && isNewer(versions[m.id].version, m.version)) ? {...m, ...versions[m.id]} : m);
  },

  /** Confere a assinatura no servidor; se o Patreon não confirmar, desconecta */
  async refreshPatron({quiet = true} = {}) {
    if ( !session().key ) return null;
    try {
      const {ok, status, data} = await api("/me", {auth: true});
      if ( status === 401 || status === 403 ) {
        await game.settings.set(MOD, "session", {});
        if ( !quiet ) ui.notifications.warn(t("toast.expired"));
        return null;
      }
      if ( !ok ) return session().patron ?? null;
      const patron = {...data.patron, key: session().key, checkedAt: new Date().toLocaleString(game.i18n.lang)};
      await game.settings.set(MOD, "session", {key: session().key, patron});
      return patron;
    } catch(err) {
      return session().patron ?? null;
    }
  },

  localModules() {
    const out = {};
    for ( const m of this.catalog ) {
      const mod = game.modules.get(m.id);
      if ( mod ) out[m.id] = {version: mod.version, active: mod.active};
    }
    return out;
  },

  updatesAvailable() {
    const p = PATREON_LOGIN ? session().patron : null, local = this.localModules();
    return this.catalog.filter(m => moduleState(m, local[m.id], p) === "update");
  }
};

/* -------------------------------------------- */
/*  Janela do Hub                               */
/* -------------------------------------------- */

const {ApplicationV2} = foundry.applications.api;

class ArcanoHubApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "arcano-hub",
    classes: ["arcanolab", "al-hub"],
    window: {title: "ALHUB.title", resizable: true},
    position: {width: 1000, height: 680},
    actions: {
      // "tab" é ação reservada do ApplicationV2 (chama changeTab), por isso o nome próprio
      "hub-tab": ArcanoHubApp.#onTab,
      filter: ArcanoHubApp.#onFilter,
      login: ArcanoHubApp.#onLogin,
      "cancel-login": ArcanoHubApp.#onCancelLogin,
      copy: ArcanoHubApp.#onCopy,
      update: ArcanoHubApp.#onUpdate,
      activate: ArcanoHubApp.#onActivate,
      changelog: ArcanoHubApp.#onChangelog,
      refresh: ArcanoHubApp.#onRefresh,
      logout: ArcanoHubApp.#onLogout
    }
  };

  /** "connect" é a tela de boas-vindas; visitante também pode abrir o Laboratório e as Anotações */
  tab = (!PATREON_LOGIN || session().patron) ? "lab" : "connect";
  filter = "all";
  copied = null;
  connecting = false;
  #poll = null;

  async _prepareContext() {
    if ( !Hub.catalog.length ) await Hub.loadCatalog();
    return {
      tab: this.tab,
      filter: this.filter,
      copied: this.copied,
      connecting: this.connecting,
      login: PATREON_LOGIN,
      patron: PATREON_LOGIN ? formatPatron(session().patron) : null,
      catalog: Hub.catalog,
      local: Hub.localModules(),
      online: Hub.online,
      lang: game.i18n.lang?.startsWith("pt") ? "pt-BR" : "en",
      assets: ASSETS,
      patreonUrl: PATREON_URL,
      discordUrl: DISCORD_URL,
      version: game.modules.get(MOD)?.version ?? "1.0.0"
    };
  }

  async _renderHTML(context) {
    return renderHub(context, t);
  }

  _replaceHTML(result, content) {
    const scroll = content.querySelector(".al-main")?.scrollTop ?? 0;
    content.innerHTML = result;
    const main = content.querySelector(".al-main");
    if ( main ) main.scrollTop = scroll;
  }

  async close(options) {
    this.#stopPoll();
    return super.close(options);
  }

  /* ---- Ações ---- */

  static #onTab(event, target) {
    this.tab = target.dataset.tab;
    this.copied = null;
    this.render();
  }

  static #onFilter(event, target) {
    this.filter = target.dataset.filter;
    this.render();
  }

  static async #onLogin() {
    let start;
    try { start = await api("/auth/start", {method: "POST", body: {world: game.world.id}}); }
    catch(err) { start = {ok: false}; }
    if ( !start.ok || !start.data?.url ) return ui.notifications.error(t("toast.offline"));
    window.open(start.data.url, "arcano-hub-login", "width=520,height=720");
    this.connecting = true;
    this.render();
    const until = Date.now() + (5 * 60 * 1000);
    this.#poll = setInterval(async () => {
      if ( Date.now() > until ) { this.#stopPoll(); this.connecting = false; ui.notifications.warn(t("toast.loginFailed")); return this.render(); }
      let r;
      try { r = await api(`/auth/poll?state=${encodeURIComponent(start.data.state)}`); } catch(err) { return; }
      if ( r.data?.status === "pending" ) return;
      this.#stopPoll();
      this.connecting = false;
      if ( r.data?.status === "done" ) {
        await game.settings.set(MOD, "session", {key: r.data.key, patron: r.data.patron});
        this.tab = "lab";
        await Hub.refreshPatron();
        ui.notifications.info(t("toast.connected", {name: r.data.patron?.name ?? "", tier: t(`tier.${r.data.patron?.tier ?? "free"}`)}));
        ArcanoHub.updateSidebarBadge();
      } else ui.notifications.warn(t("toast.loginFailed"));
      this.render();
    }, 2000);
  }

  static #onCancelLogin() {
    this.#stopPoll();
    this.connecting = false;
    this.render();
  }

  #stopPoll() {
    if ( this.#poll ) clearInterval(this.#poll);
    this.#poll = null;
  }

  static async #onCopy(event, target) {
    const mod = Hub.catalog.find(m => m.id === target.dataset.id);
    if ( !mod ) return;
    await copyText(installLink(mod));
    this.copied = mod.title;
    this.render();
  }

  static async #onUpdate(event, target) {
    const mod = Hub.catalog.find(m => m.id === target.dataset.id);
    if ( !mod ) return;
    await copyText(installLink(mod));
    foundry.applications.api.DialogV2.prompt({
      window: {title: t("update.title", {title: mod.title}), icon: "fa-solid fa-arrows-rotate"},
      classes: ["arcanolab"],
      content: `<p>${t("update.body", {title: mod.title})}</p>`,
      ok: {label: "OK"}
    });
  }

  static #onActivate() {
    const ModuleManagement = foundry.applications.sidebar?.apps?.ModuleManagement;
    if ( ModuleManagement ) new ModuleManagement().render({force: true});
  }

  static #onChangelog() {
    this.tab = "news";
    this.render();
  }

  static async #onRefresh() {
    await Promise.all([Hub.loadCatalog(), Hub.refreshPatron({quiet: false})]);
    ArcanoHub.updateSidebarBadge();
    this.render();
  }

  static async #onLogout() {
    try { await api("/auth/logout", {method: "POST", auth: true}); } catch(err) {}
    await game.settings.set(MOD, "session", {});
    this.tab = "connect";
    this.render();
  }
}

/** Data "patrono desde" no idioma do Foundry */
function formatPatron(p) {
  if ( !p ) return null;
  let since = "—";
  if ( p.since ) try {
    since = new Date(p.since).toLocaleDateString(game.i18n.lang, {month: "short", year: "numeric", timeZone: "UTC"});
  } catch(err) {}
  return {...p, since};
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch(err) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  }
}

/* -------------------------------------------- */
/*  API pública e integração com o Foundry      */
/* -------------------------------------------- */

const ArcanoHub = {
  app: null,
  open(tab) {
    this.app ??= new ArcanoHubApp();
    if ( tab ) this.app.tab = tab;
    return this.app.render({force: true});
  },
  /**
   * Ferramentas de outros módulos do Arcano Lab, mostradas no grupo "Arcano Lab" dos controles de cena.
   * @type {Map<string, {name: string, title: string, icon: string, order?: number, visible?: boolean, onClick: Function}>}
   */
  tools: new Map(),
  /**
   * Põe um botão no grupo Arcano Lab dos controles de cena.
   * `title` e `visible` podem ser valores ou funções (lidas a cada vez que a barra é montada).
   * `icon`: classe do Font Awesome ou caminho de imagem, ex. "modules/arcano-hub/assets/tools/casino.svg".
   * Ex.: game.modules.get("arcano-hub").api.registerTool({name, title, icon: "fa-solid fa-dice", onClick})
   */
  registerTool(tool) {
    if ( !tool?.name || !tool.title || !tool.icon || (typeof tool.onClick !== "function") ) {
      console.error(`${MOD} | registerTool: faltam name, title, icon ou onClick`, tool);
      return false;
    }
    this.tools.set(tool.name, tool);
    if ( ui.controls?.rendered ) ui.controls.render({reset: true});
    return true;
  },
  unregisterTool(name) {
    const had = this.tools.delete(name);
    if ( had && ui.controls?.rendered ) ui.controls.render({reset: true});
    return had;
  },
  /** Outros módulos do Arcano Lab podem perguntar o tier do mestre */
  get patron() { return session().patron ?? null; },
  updatesAvailable: () => Hub.updatesAvailable(),
  updateSidebarBadge() {
    const n = Hub.updatesAvailable().length;
    document.querySelectorAll("#settings .al-sidebar-btn .al-count").forEach(el => el.remove());
    if ( n ) document.querySelectorAll("#settings .al-sidebar-btn").forEach(btn => btn.insertAdjacentHTML("beforeend", `<span class="al-count">${n}</span>`));
  }
};

class OpenHubMenu extends ApplicationV2 {
  render() { ArcanoHub.open(); return this; }
}

Hooks.once("init", () => {
  game.settings.register(MOD, "server", {
    name: "ALHUB.settings.server.name", hint: "ALHUB.settings.server.hint",
    scope: "world", config: false, type: String, default: DEFAULT_SERVER
  });
  game.settings.register(MOD, "session", {scope: "world", config: false, type: Object, default: {}});
  game.settings.register(MOD, "notify", {
    name: "ALHUB.settings.notify.name", hint: "ALHUB.settings.notify.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.registerMenu(MOD, "open", {
    name: "ALHUB.title", label: "ALHUB.settings.open", hint: "ALHUB.settings.openHint",
    icon: "fa-solid fa-flask", type: OpenHubMenu, restricted: true
  });
  game.modules.get(MOD).api = ArcanoHub;
  globalThis.ArcanoHub = ArcanoHub;
});

/* Botão do Hub na aba de Configurações (só o mestre) */
Hooks.on("renderSettings", (app, html) => {
  if ( !game.user.isGM ) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if ( root.querySelector(".al-sidebar-btn") ) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "al-sidebar-btn";
  btn.innerHTML = `<img src="${ASSETS}/arcanolab.svg" alt=""> ${t("title")}`;
  btn.addEventListener("click", () => ArcanoHub.open());
  const anchor = root.querySelector("section.documentation, .documentation, section.info, #settings-documentation");
  if ( anchor ) anchor.before(btn);
  else root.querySelector(".settings, section")?.prepend(btn) ?? root.prepend(btn);
  ArcanoHub.updateSidebarBadge();
});

/**
 * `icon` de uma ferramenta pode ser uma classe do Font Awesome ou o caminho de uma imagem (svg, png, webp).
 * Para imagem, o Hub cria uma classe CSS com ela de fundo. Os ícones no estilo do Lab ficam em assets/tools/.
 */
function toolIcon(tool) {
  if ( !/\.(svg|png|webp)$/i.test(tool.icon) ) return tool.icon;
  const cls = `al-tool-img-${String(tool.name).replace(/[^\w-]/g, "")}`;
  let sheet = document.getElementById("al-tool-icons");
  if ( !sheet ) {
    sheet = document.createElement("style");
    sheet.id = "al-tool-icons";
    document.head.append(sheet);
  }
  const rule = `#scene-controls .${cls}::before { background-image: url("${foundry.utils.getRoute(tool.icon)}"); }`;
  if ( !sheet.textContent.includes(rule) ) sheet.textContent += `${rule}
`;
  return `al-tool-img ${cls}`;
}

/* Grupo "Arcano Lab" na barra de controles da esquerda: o Hub (só o mestre) e as ferramentas
   que os outros módulos do Arcano Lab registram com ArcanoHub.registerTool(). */
Hooks.on("getSceneControlButtons", controls => {
  const value = v => (typeof v === "function" ? v() : v);
  const tools = {
    hub: {
      name: "hub", title: t("title"), icon: "al-hub-tool", order: 0, button: true,
      visible: game.user.isGM, onChange: () => ArcanoHub.open()
    }
  };
  let order = 1;
  for ( const tool of ArcanoHub.tools.values() ) {
    tools[tool.name] = {
      name: tool.name, title: value(tool.title), icon: toolIcon(tool), order: tool.order ?? order, button: true,
      visible: value(tool.visible) ?? true, onChange: event => tool.onClick(event)
    };
    order++;
  }
  controls.arcanolab = {
    name: "arcanolab", title: "Arcano Lab", icon: "al-hub-control",
    order: Object.keys(controls).length + 1,
    visible: Object.values(tools).some(tool => tool.visible !== false),
    tools, activeTool: null
  };
});

/* Ao abrir o mundo: confere assinatura e avisa sobre updates */
Hooks.once("ready", async () => {
  if ( !game.user.isGM ) return;
  await Hub.loadCatalog();
  if ( !Hub.online && Hub.catalog.length ) console.info(`${MOD} | ${t("toast.offline")}`);
  if ( PATREON_LOGIN ) await Hub.refreshPatron({quiet: false});
  ArcanoHub.updateSidebarBadge();
  const n = Hub.updatesAvailable().length;
  if ( n && game.settings.get(MOD, "notify") ) ui.notifications.info(t("toast.updates", {n}));
});
