/* =========================================================================
   VINUM SACRUM — Application Logic
   ========================================================================= */

const state = {
  data: null,
  query: "",
  continent: "",
  influence: "",
  view: "atlas",
  modalStack: [], // for back-navigation
  currentMap: null,
};

// Helpers ------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const escapeHTML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Extract a compact founding year/era for use on order cards.
// Examples:
//   "1209–1210 AD (oral approval by Innocent III); formally 1223 ..."  -> "1209–1210 AD"
//   "c. 529 AD"                                                          -> "c. 529 AD"
//   "6th century"                                                        -> "6th century"
function shortFoundedDate(s) {
  if (!s) return "—";
  const str = String(s).trim();
  // Prefer a 4-digit year (optionally a range), optionally with AD/BC/CE/BCE suffix.
  let m = str.match(/(?:c\.\s*)?\d{3,4}(?:\s*[–—-]\s*\d{3,4})?(?:\s*(?:AD|BC|CE|BCE))?/i);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  // Then try any 1-4 digit year (covers ancient dates like "33 AD").
  m = str.match(/(?:c\.\s*)?\d{1,4}(?:\s*(?:AD|BC|CE|BCE))/i);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  // Fallback: century phrase like "6th century"
  const c = str.match(/\d{1,2}(?:st|nd|rd|th)\s+century/i);
  if (c) return c[0];
  // Last resort: first short clause
  return str.split(/[(;,]/)[0].trim().slice(0, 30);
}

// Pull the parenthetical / secondary clause out of a founding string so it
// can be shown as a smaller subtitle. Returns "" if there's nothing extra.
function foundedDateDetail(s) {
  if (!s) return "";
  const str = String(s).trim();
  const short = shortFoundedDate(s);
  // Remove the short date from the front, then strip leading punctuation.
  let rest = str;
  const idx = str.indexOf(short);
  if (idx >= 0) rest = str.slice(idx + short.length);
  rest = rest.replace(/^[\s.,;:—–-]+/, "").trim();
  // Drop wrapping parens if the whole remainder is one parenthetical.
  if (/^\([^()]*\)$/.test(rest)) rest = rest.slice(1, -1).trim();
  return rest;
}

function paragraphs(text) {
  if (!text) return "";
  return String(text)
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHTML(p.trim())}</p>`)
    .join("");
}

// Lookups ------------------------------------------------------------------
function findSaintByIdOrName(idOrName) {
  if (!state.data || !idOrName) return null;
  // Normalize: expand 'St.' / 'St ' to 'Saint', drop punctuation, lowercase
  const expand = (str) =>
    String(str)
      .replace(/\bSt\.?\b/gi, "Saint")
      .replace(/\bSts\.?\b/gi, "Saints")
      .trim();
  const norm = slugify(expand(idOrName));
  const normRaw = slugify(idOrName);
  // Direct id/name
  let s = state.data.saints.find(
    (x) =>
      slugify(x.id || "") === norm ||
      slugify(x.name) === norm ||
      slugify(x.id || "") === normRaw ||
      slugify(x.name) === normRaw
  );
  if (s) return s;
  // Fuzzy: lookup map
  const lookup = state.data._saint_name_to_id || {};
  for (const [name, id] of Object.entries(lookup)) {
    const ns = slugify(expand(name));
    if (ns === norm || ns === normRaw) {
      return state.data.saints.find((x) => x.id === id);
    }
  }
  // Substring match on expanded names
  const inputExpanded = expand(idOrName).toLowerCase();
  s = state.data.saints.find((x) => {
    const nm = x.name.toLowerCase();
    return (
      nm.includes(inputExpanded) ||
      inputExpanded.includes(nm) ||
      // strip 'Saint ' prefix and compare
      inputExpanded.replace(/^saints?\s+/, "") ===
        nm.replace(/^saints?\s+/, "")
    );
  });
  return s || null;
}

function findOrderByIdOrName(idOrName) {
  if (!state.data || !idOrName) return null;
  const norm = slugify(idOrName);
  return state.data.orders.find(
    (o) =>
      slugify(o.id || "") === norm ||
      slugify(o.name) === norm ||
      slugify(o.abbreviation || "") === norm
  );
}

function findRegion(idOrCombo) {
  if (!state.data) return null;
  const norm = slugify(idOrCombo);
  return state.data.regions.find(
    (r) =>
      slugify(r.id || "") === norm ||
      slugify(`${r.region_name}-${r.country}`) === norm
  );
}

// ==========================================================================
// Boot
// ==========================================================================
async function init() {
  try {
    const res = await fetch("data.json");
    state.data = await res.json();
  } catch (err) {
    console.error("Failed to load data", err);
    $("#main").innerHTML =
      '<p class="view__empty">The atlas could not be opened. Please reload the page.</p>';
    return;
  }
  populateContinents();
  bindEvents();
  render();
  updateFooterStats();
}

function populateContinents() {
  const cs = new Set(state.data.countries.map((c) => c.continent));
  const sel = $("#continentFilter");
  Array.from(cs).sort().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function bindEvents() {
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach((b) => b.classList.remove("nav-btn--active"));
      btn.classList.add("nav-btn--active");
      state.view = btn.dataset.view;
      $$(".view").forEach((v) => v.classList.remove("view--active"));
      $(`#view-${state.view}`).classList.add("view--active");
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    });
  });

  $("#searchInput").addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    render();
  });
  $("#continentFilter").addEventListener("change", (e) => { state.continent = e.target.value; render(); });
  $("#influenceFilter").addEventListener("change", (e) => { state.influence = e.target.value; render(); });
  $("#clearBtn").addEventListener("click", () => {
    state.query = ""; state.continent = ""; state.influence = "";
    $("#searchInput").value = ""; $("#continentFilter").value = ""; $("#influenceFilter").value = "";
    render();
  });

  // Modal close
  $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

// ==========================================================================
// Filtering
// ==========================================================================
function regionMatchesQuery(r, q) {
  if (!q) return true;
  q = q.toLowerCase();
  if (r.region_name.toLowerCase().includes(q)) return true;
  if (r.country.toLowerCase().includes(q)) return true;
  if ((r.catholic_story || "").toLowerCase().includes(q)) return true;
  if ((r.signature_wines || []).some(
    (w) => typeof w === "object" && (
      (w.name && w.name.toLowerCase().includes(q)) ||
      (w.grape && w.grape.toLowerCase().includes(q)) ||
      (w.style && w.style.toLowerCase().includes(q))
    )
  )) return true;
  if ((r.saints || []).some((s) => String(s).toLowerCase().includes(q))) return true;
  if ((r.religious_orders || []).some((o) => String(o).toLowerCase().includes(q))) return true;
  return false;
}

function getFilteredCountries() {
  const q = state.query.toLowerCase();
  return state.data.countries.filter((c) => {
    if (state.continent && c.continent !== state.continent) return false;
    if (state.influence === "catholic" && !c.has_catholic_influence) return false;
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if ((c.overview || "").toLowerCase().includes(q)) return true;
    if (c.continent.toLowerCase().includes(q)) return true;
    const regions = state.data.regions.filter((r) => r.country === c.name);
    return regions.some((r) => regionMatchesQuery(r, q));
  });
}

function getFilteredRegions() {
  const q = state.query;
  return state.data.regions.filter((r) => {
    if (state.continent) {
      const country = state.data.countries.find((c) => c.name === r.country);
      if (!country || country.continent !== state.continent) return false;
    }
    return regionMatchesQuery(r, q);
  });
}

function getFilteredSaints() {
  const q = state.query.toLowerCase();
  if (!q) return state.data.saints;
  return state.data.saints.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true;
    if ((s.patron_of || "").toLowerCase().includes(q)) return true;
    if ((s.story || "").toLowerCase().includes(q)) return true;
    if ((s.century || "").toLowerCase().includes(q)) return true;
    if ((s.miracles || []).some((m) => String(m).toLowerCase().includes(q))) return true;
    const b = s.biography;
    if (b) {
      const fields = ["early_life","ministry","wine_connection","legacy","veneration","iconography","death_or_passing","patron_of_full"];
      if (fields.some((f) => (b[f] || "").toLowerCase().includes(q))) return true;
      if ((b.miracles || []).some((m) => (m.title || "").toLowerCase().includes(q) || (m.narrative || "").toLowerCase().includes(q))) return true;
    }
    return false;
  });
}

function getFilteredOrders() {
  const q = state.query.toLowerCase();
  if (!q) return state.data.orders;
  return state.data.orders.filter((o) => {
    if (o.name.toLowerCase().includes(q)) return true;
    if ((o.motto || "").toLowerCase().includes(q)) return true;
    if ((o.wine_story || o.biography || "").toLowerCase().includes(q)) return true;
    if ((o.founder || "").toLowerCase().includes(q)) return true;
    if ((o.key_wine_regions || []).some((r) => r.toLowerCase().includes(q))) return true;
    const h = o.history;
    if (h) {
      const fields = ["founding","spirituality_and_rule","expansion","wine_legacy","decline_and_survival","modern_day","habit_description"];
      if (fields.some((f) => (h[f] || "").toLowerCase().includes(q))) return true;
      if ((h.famous_members || []).some((m) => (m.name || "").toLowerCase().includes(q))) return true;
      if ((h.key_houses || []).some((kh) => (kh.name || "").toLowerCase().includes(q))) return true;
    }
    return false;
  });
}

// ==========================================================================
// Renderers
// ==========================================================================
function render() {
  if (state.view === "atlas") renderAtlas();
  if (state.view === "regions") renderRegions();
  if (state.view === "saints") renderSaints();
  if (state.view === "orders") renderOrders();
}

function renderAtlas() {
  const countries = getFilteredCountries();
  const grid = $("#atlasGrid");
  const empty = $("#atlasEmpty");
  $("#countryCount").textContent = state.data.countries.length;

  if (countries.length === 0) { grid.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;

  const byCont = {};
  countries.forEach((c) => { (byCont[c.continent] = byCont[c.continent] || []).push(c); });
  const order = ["Europe", "Asia", "Africa", "North America", "South America", "Oceania"];
  const sortedConts = Object.keys(byCont).sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  grid.innerHTML = sortedConts.map((cont) => {
    const list = byCont[cont].sort((a, b) => a.name.localeCompare(b.name));
    return `
      <section class="continent-section">
        <div class="continent-section__header">
          <h3 class="continent-section__title">${escapeHTML(cont)}</h3>
          <span class="continent-section__count">${list.length} ${list.length === 1 ? "nation" : "nations"}</span>
        </div>
        <div class="country-grid">
          ${list.map((c) => `
            <article class="country-card" data-country="${escapeHTML(c.name)}" data-catholic="${c.has_catholic_influence}">
              <span class="country-card__cross" title="Catholic-influenced wine tradition">✠</span>
              <h4 class="country-card__name">${escapeHTML(c.name)}</h4>
              <p class="country-card__meta">${c.production_hl ? Number(c.production_hl).toLocaleString() + " hL/yr" : "Emerging producer"}</p>
            </article>`).join("")}
        </div>
      </section>`;
  }).join("");

  $$(".country-card", grid).forEach((el) => el.addEventListener("click", () => openCountry(el.dataset.country)));
}

function renderRegions() {
  const regions = getFilteredRegions();
  const grid = $("#regionsGrid");
  const empty = $("#regionsEmpty");
  if (regions.length === 0) { grid.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;

  grid.innerHTML = regions.map((r) => {
    const wines = (r.signature_wines || []).slice(0, 4).map((w) =>
      typeof w === "string" ? w : `${w.name}${w.grape ? ` (${w.grape})` : ""}`
    );
    const excerpt = (r.catholic_story || "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    return `
      <article class="region-card" data-region-id="${escapeHTML(r.id)}">
        <p class="region-card__country">${escapeHTML(r.country)}</p>
        <h3 class="region-card__name">${escapeHTML(r.region_name)}</h3>
        <p class="region-card__excerpt">${escapeHTML(excerpt)}</p>
        ${wines.length ? `<p class="region-card__wines"><strong>Known for</strong>${escapeHTML(wines.join(" · "))}</p>` : ""}
      </article>`;
  }).join("");

  $$(".region-card", grid).forEach((el) => el.addEventListener("click", () => openRegion(el.dataset.regionId)));
}

function renderSaints() {
  const saints = getFilteredSaints();
  const grid = $("#saintsGrid");
  const empty = $("#saintsEmpty");
  if (saints.length === 0) { grid.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;

  grid.innerHTML = saints.map((s) => {
    const img = s.local_image || s.wikimedia_image_url || "";
    return `
      <article class="saint-card" data-saint-id="${escapeHTML(s.id || slugify(s.name))}">
        <div class="saint-card__image-wrap">
          ${img ? `<img class="saint-card__image" src="${escapeHTML(img)}" alt="${escapeHTML(s.name)}" loading="lazy" />` : ""}
        </div>
        <div class="saint-card__body">
          <h3 class="saint-card__name">${escapeHTML(s.name)}</h3>
          ${s.patron_of ? `<p class="saint-card__patron">Patron of ${escapeHTML(s.patron_of)}</p>` : ""}
          <p class="saint-card__feast">${escapeHTML(s.feast_day || "")}${s.century ? " · " + escapeHTML(s.century) : ""}</p>
        </div>
      </article>`;
  }).join("");

  $$(".saint-card", grid).forEach((el) => el.addEventListener("click", () => openSaint(el.dataset.saintId)));
}

function renderOrders() {
  const orders = getFilteredOrders();
  const list = $("#ordersList");
  const empty = $("#ordersEmpty");
  if (orders.length === 0) { list.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;

  list.innerHTML = orders.map((o) => {
    const excerpt = (o.wine_story || o.biography || "").split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    const thumb = o.local_image ? `<img class="order-card__thumb" src="${escapeHTML(o.local_image)}" alt="" loading="lazy"/>` : `<div class="order-card__thumb" style="background:var(--parchment-300);"></div>`;
    return `
      <article class="order-card" data-order-id="${escapeHTML(o.id || slugify(o.name))}">
        ${thumb}
        <div>
          <h3 class="order-card__name">${escapeHTML(o.name)}</h3>
          ${o.motto ? `<p class="order-card__motto">"${escapeHTML(o.motto)}"</p>` : ""}
          <p class="order-card__excerpt">${escapeHTML(excerpt)}</p>
        </div>
        <div class="order-card__date"><span class="order-card__date-label">Founded</span><strong>${escapeHTML(shortFoundedDate(o.founded))}</strong></div>
      </article>`;
  }).join("");

  $$(".order-card", list).forEach((el) => el.addEventListener("click", () => openOrder(el.dataset.orderId)));
}

// ==========================================================================
// Modal
// ==========================================================================
function openModal(html) {
  $("#modalContent").innerHTML = html;
  const modal = $("#modal");
  modal.hidden = false;
  // Reset scroll position on every scrollable container in the modal tree.
  // The actual scroller is .modal (overflow-y:auto); .modal__sheet is reset
  // defensively in case future layouts move the scroll to the sheet.
  modal.scrollTop = 0;
  const sheet = $(".modal__sheet");
  if (sheet) sheet.scrollTop = 0;
  // Some browsers restore scroll asynchronously; re-pin to top after layout.
  requestAnimationFrame(() => {
    modal.scrollTop = 0;
    if (sheet) sheet.scrollTop = 0;
  });
  document.body.style.overflow = "hidden";
  // Wire cross-links
  $$(".cross-link", $("#modalContent")).forEach((link) => {
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      const kind = link.dataset.kind;
      const id = link.dataset.id;
      if (!id) return;
      if (kind === "saint") openSaint(id);
      else if (kind === "order") openOrder(id);
      else if (kind === "region") openRegion(id);
      else if (kind === "country") openCountry(id);
    });
  });
  // Wire member cards
  $$(".member-card.is-linked", $("#modalContent")).forEach((card) => {
    card.addEventListener("click", () => {
      const kind = card.dataset.kind;
      const id = card.dataset.id;
      if (kind === "saint") openSaint(id);
      else if (kind === "order") openOrder(id);
    });
  });
  // Wire "View on map" buttons
  $$(".action-btn[data-action='view-map']", $("#modalContent")).forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = $("#" + btn.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function closeModal() {
  // Tear down any active map first
  if (state.currentMap) {
    try { state.currentMap.remove(); } catch (_) {}
    state.currentMap = null;
  }
  $("#modal").hidden = true;
  document.body.style.overflow = "";
}

// ==========================================================================
// Detail openers
// ==========================================================================
function openCountry(name) {
  const c = state.data.countries.find((x) => x.name === name);
  if (!c) return;
  const regions = state.data.regions.filter((r) => r.country === name);

  let html = `
    <p class="modal-overline">${escapeHTML(c.continent)}</p>
    <h2>${escapeHTML(c.name)}</h2>
    <p>${escapeHTML(c.overview || "")}</p>
    <div class="saint-meta">
      <div class="saint-meta__item"><span class="saint-meta__label">Production</span><span class="saint-meta__value">${
        c.production_hl ? Number(c.production_hl).toLocaleString() + " hectolitres/year" : "Emerging"
      }</span></div>
      <div class="saint-meta__item"><span class="saint-meta__label">Catholic Heritage</span><span class="saint-meta__value">${
        c.has_catholic_influence ? "Yes — see regions below" : "Limited / not predominant"
      }</span></div>
    </div>
  `;

  if (regions.length) {
    html += `<h3>Sacred Wine Regions</h3>`;
    html += regions.map((r) => {
      const excerpt = (r.catholic_story || "").split(/(?<=[.!?])\s+/).slice(0, 1).join(" ");
      return `
        <div style="padding: 0.75rem 0; border-bottom: 1px dotted var(--parchment-400);">
          <span class="cross-link" data-kind="region" data-id="${escapeHTML(r.id)}">${escapeHTML(r.region_name)}</span>
          <p style="margin: 0.5rem 0 0; font-size: 0.95rem; color: var(--ink-700); font-style: italic;">${escapeHTML(excerpt)}</p>
        </div>`;
    }).join("");
  } else {
    html += `<p style="font-style: italic; color: var(--ink-500);">Detailed region narratives for ${escapeHTML(c.name)} are forthcoming in a future edition of this atlas.</p>`;
  }
  openModal(html);
}

// ----- REGION (with interactive map) -----------------------------------
function openRegion(idOrName) {
  const r = findRegion(idOrName);
  if (!r) return;

  const saintLinks = (r.saints || []).map((sid) => {
    const s = findSaintByIdOrName(sid);
    if (!s) return `<span class="cross-link" style="opacity:.6;cursor:default;">${escapeHTML(sid)}</span>`;
    return `<span class="cross-link" data-kind="saint" data-id="${escapeHTML(s.id || slugify(s.name))}">${escapeHTML(s.name)}</span>`;
  }).join("");

  const orderLinks = (r.religious_orders || []).map((oid) => {
    const o = findOrderByIdOrName(oid);
    if (!o) return `<span class="cross-link" style="opacity:.6;cursor:default;">${escapeHTML(oid)}</span>`;
    return `<span class="cross-link" data-kind="order" data-id="${escapeHTML(o.id || slugify(o.name))}">${escapeHTML(o.name)}</span>`;
  }).join("");

  const wines = (r.signature_wines || []).map((w) => {
    if (typeof w === "string") return `<span class="wine-pill">${escapeHTML(w)}</span>`;
    const parts = [];
    if (w.name) parts.push(`<strong>${escapeHTML(w.name)}</strong>`);
    if (w.grape) parts.push(escapeHTML(w.grape));
    if (w.style) parts.push(`<em>${escapeHTML(w.style)}</em>`);
    return `<span class="wine-pill">${parts.join(" · ")}</span>`;
  }).join("");

  const story = paragraphs(r.catholic_story);
  const mapId = `region-map-${r.id}`;
  const hasMap = r.map && r.map.center;

  const html = `
    <p class="modal-overline">${escapeHTML(r.country)}</p>
    <h2>${escapeHTML(r.region_name)}</h2>
    <div class="story">${story}</div>

    ${wines ? `
      <h3>Wines of the Region</h3>
      <div class="wine-pills">${wines}</div>
      ${hasMap ? `<div class="wine-actions">
        <button class="action-btn" data-action="view-map" data-target="${mapId}">⟶ View Appellation Map</button>
      </div>` : ""}
    ` : ""}

    ${hasMap ? `
      <h3 id="${mapId}-heading">The Appellation Map</h3>
      <div class="region-map-wrap">
        <div class="region-map" id="${mapId}"></div>
        <div class="map-legend">
          <span class="map-legend__item"><span class="map-legend__swatch" style="color:var(--oxblood-700)"></span>Abbey / Monastery</span>
          <span class="map-legend__item"><span class="map-legend__swatch" style="color:var(--gold-600)"></span>Cathedral / Palace</span>
          <span class="map-legend__item"><span class="map-legend__swatch" style="color:var(--vine-700)"></span>Vineyard / Cru</span>
          <span class="map-legend__item"><span class="map-legend__swatch" style="color:var(--indigo-700)"></span>Town / City</span>
        </div>
      </div>
    ` : ""}

    ${saintLinks ? `<h3>Patron Saints</h3><div>${saintLinks}</div>` : ""}
    ${orderLinks ? `<h3>Religious Orders</h3><div>${orderLinks}</div>` : ""}
  `;
  openModal(html);
  if (hasMap) initRegionMap(mapId, r.map);
}

function initRegionMap(elementId, mapCfg) {
  // Wait for leaflet and DOM
  const attempt = (tries) => {
    if (typeof L === "undefined") {
      if (tries > 0) return setTimeout(() => attempt(tries - 1), 200);
      return;
    }
    const el = document.getElementById(elementId);
    if (!el) return;

    if (state.currentMap) {
      try { state.currentMap.remove(); } catch (_) {}
      state.currentMap = null;
    }

    const map = L.map(elementId, {
      center: mapCfg.center,
      zoom: mapCfg.zoom || 9,
      scrollWheelZoom: false,
    });
    state.currentMap = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    // Add landmark markers
    const labels = { abbey: "✠", monastery: "✠", cathedral: "✝", palace: "♛", vineyard: "🍇", city: "●" };
    (mapCfg.landmarks || []).forEach((lm) => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="atlas-marker atlas-marker--${lm.type}">${labels[lm.type] || "●"}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -10],
      });
      L.marker([lm.lat, lm.lng], { icon })
        .addTo(map)
        .bindPopup(`<strong>${lm.name}</strong><em>${lm.type}</em>`);
    });

    // Fit bounds to landmarks if any
    if (mapCfg.landmarks && mapCfg.landmarks.length > 1) {
      const bounds = L.latLngBounds(mapCfg.landmarks.map((l) => [l.lat, l.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: mapCfg.zoom + 1 });
    }

    // Force a resize after the modal animation
    setTimeout(() => map.invalidateSize(), 200);
  };
  attempt(20);
}

// ----- SAINT (full biography) ------------------------------------------
function openSaint(idOrName) {
  const s = findSaintByIdOrName(idOrName);
  if (!s) return;

  const img = s.local_image || s.wikimedia_image_url || "";
  const b = s.biography || null;

  // Find regions that reference this saint
  const sidNorm = slugify(s.id || s.name);
  const linkedRegions = state.data.regions.filter((r) =>
    (r.saints || []).some((x) => slugify(x) === sidNorm)
  );
  const regionLinks = linkedRegions.map((r) =>
    `<span class="cross-link" data-kind="region" data-id="${escapeHTML(r.id)}">${escapeHTML(r.region_name)}, ${escapeHTML(r.country)}</span>`
  ).join("");

  let bodyHTML = "";

  if (b) {
    // Famous quote (if any)
    if (b.famous_quote) {
      bodyHTML += `<div class="famous-quote">"${escapeHTML(b.famous_quote)}"<span class="famous-quote__attr">— ${escapeHTML(s.name)}</span></div>`;
    }

    if (b.early_life) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">I · Early Life</p>
        <h3 class="bio-section__title">Birth, Family &amp; Formation</h3>
        ${paragraphs(b.early_life)}
      </section>`;
    }
    if (b.ministry) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">II · Ministry</p>
        <h3 class="bio-section__title">The Public Work</h3>
        ${paragraphs(b.ministry)}
      </section>`;
    }
    if (b.death_or_passing) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">III · Passing</p>
        <h3 class="bio-section__title">Martyrdom &amp; Final Days</h3>
        ${paragraphs(b.death_or_passing)}
      </section>`;
    }
    if (b.miracles && b.miracles.length) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">IV · Wonders</p>
        <h3 class="bio-section__title">Miracles &amp; Legends</h3>
        <ol class="miracles-list">
          ${b.miracles.map((m) => `
            <li>
              <span class="miracle-title">${escapeHTML(m.title || "")}</span>
              <p class="miracle-narrative">${escapeHTML(m.narrative || "")}</p>
            </li>`).join("")}
        </ol>
      </section>`;
    }
    if (b.wine_connection) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">V · The Vine</p>
        <h3 class="bio-section__title">Patron of the Wine-Maker</h3>
        ${paragraphs(b.wine_connection)}
      </section>`;
    }
    if (b.veneration) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">VI · Veneration</p>
        <h3 class="bio-section__title">Cult, Relics &amp; Feast</h3>
        ${paragraphs(b.veneration)}
      </section>`;
    }
    if (b.iconography) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">VII · Iconography</p>
        <h3 class="bio-section__title">How the Saint is Depicted</h3>
        ${paragraphs(b.iconography)}
      </section>`;
    }
    if (b.legacy) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">VIII · Legacy</p>
        <h3 class="bio-section__title">Enduring Influence</h3>
        ${paragraphs(b.legacy)}
      </section>`;
    }
    if (b.key_dates && b.key_dates.length) {
      bodyHTML += `<section class="bio-section">
        <p class="bio-section__label">IX · Chronicle</p>
        <h3 class="bio-section__title">Key Dates</h3>
        <ul class="timeline">
          ${b.key_dates.map((kd) => `
            <li><span class="timeline-year">${escapeHTML(kd.year || "—")}</span> ${escapeHTML(kd.event || "")}</li>
          `).join("")}
        </ul>
      </section>`;
    }
    if (b.patron_of_full) {
      bodyHTML += `<div class="callout">
        <p class="callout__label">Patronages</p>
        <p>${escapeHTML(b.patron_of_full)}</p>
      </div>`;
    }
  } else {
    // Fallback to original short story
    bodyHTML += paragraphs(s.story || "");
    if (s.miracles && s.miracles.length) {
      bodyHTML += `<h3>Miracles &amp; Legends</h3><ul>${s.miracles.map((m) => `<li>${escapeHTML(m)}</li>`).join("")}</ul>`;
    }
  }

  if (regionLinks) {
    bodyHTML += `<section class="bio-section">
      <p class="bio-section__label">Cross-references</p>
      <h3 class="bio-section__title">Honoured in These Regions</h3>
      <div>${regionLinks}</div>
    </section>`;
  }

  const html = `
    <div class="saint-modal">
      <div>
        <div class="saint-modal__image-wrap">
          ${img ? `<img class="saint-modal__image" src="${escapeHTML(img)}" alt="${escapeHTML(s.name)}" />` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--ink-500);font-style:italic;">No portrait available</div>`}
        </div>
        <p class="saint-modal__caption">Public domain — Wikimedia Commons</p>
      </div>
      <div>
        <p class="modal-overline">Saint of the Vine</p>
        <h2>${escapeHTML(s.name)}</h2>
        <div class="saint-meta">
          ${s.feast_day ? `<div class="saint-meta__item"><span class="saint-meta__label">Feast Day</span><span class="saint-meta__value">${escapeHTML(s.feast_day)}</span></div>` : ""}
          ${s.century ? `<div class="saint-meta__item"><span class="saint-meta__label">Era</span><span class="saint-meta__value">${escapeHTML(s.century)}</span></div>` : ""}
          ${s.patron_of ? `<div class="saint-meta__item"><span class="saint-meta__label">Patron Of</span><span class="saint-meta__value">${escapeHTML(s.patron_of)}</span></div>` : ""}
        </div>
      </div>
    </div>
    ${bodyHTML}
  `;
  openModal(html);
}

// ----- ORDER (full history) --------------------------------------------
function openOrder(idOrName) {
  const o = findOrderByIdOrName(idOrName);
  if (!o) return;
  const h = o.history || null;

  // Notable members — try to link to a saint
  const memberCards = (h?.famous_members || o.notable_members || []).map((m) => {
    if (typeof m === "string") {
      // Try to link by name
      const s = findSaintByIdOrName(m);
      if (s) {
        return `<div class="member-card is-linked" data-kind="saint" data-id="${escapeHTML(s.id || slugify(s.name))}">
          <span class="member-card__name is-linked">${escapeHTML(m)}</span>
        </div>`;
      }
      return `<div class="member-card"><span class="member-card__name">${escapeHTML(m)}</span></div>`;
    }
    // object {name, lived, significance}
    const s = findSaintByIdOrName(m.name);
    const linked = !!s;
    return `<div class="member-card${linked ? " is-linked" : ""}" ${linked ? `data-kind="saint" data-id="${escapeHTML(s.id || slugify(s.name))}"` : ""}>
      <span class="member-card__name${linked ? " is-linked" : ""}">${escapeHTML(m.name || "")}</span>
      ${m.lived ? `<span class="member-card__meta">${escapeHTML(m.lived)}</span>` : ""}
      ${m.significance ? `<p class="member-card__sig">${escapeHTML(m.significance)}</p>` : ""}
    </div>`;
  }).join("");

  const keyHouses = (h?.key_houses || []).map((kh) => `
    <div class="member-card">
      <span class="member-card__name">${escapeHTML(kh.name || "")}</span>
      ${kh.location || kh.founded ? `<span class="member-card__meta">${[kh.location, kh.founded ? "founded " + kh.founded : ""].filter(Boolean).join(" · ")}</span>` : ""}
      ${kh.wine_significance ? `<p class="member-card__sig">${escapeHTML(kh.wine_significance)}</p>` : ""}
    </div>`).join("");

  // Cross-link any regions that name this order
  const oidNorm = slugify(o.id || o.name);
  const linkedRegions = state.data.regions.filter((r) =>
    (r.religious_orders || []).some((x) => slugify(x) === oidNorm)
  );
  const regionLinks = linkedRegions.map((r) =>
    `<span class="cross-link" data-kind="region" data-id="${escapeHTML(r.id)}">${escapeHTML(r.region_name)}, ${escapeHTML(r.country)}</span>`
  ).join("");

  let html = "";
  // Hero image
  if (o.local_image) {
    html += `<div class="order-hero">
      <img class="order-hero__img" src="${escapeHTML(o.local_image)}" alt="" />
      ${o.image_caption ? `<div class="order-hero__caption">${escapeHTML(o.image_caption)}</div>` : ""}
    </div>`;
  }

  html += `<p class="modal-overline">Religious Order</p>
    <h2>${escapeHTML(o.name)}</h2>
    ${o.motto ? `<p style="font-style:italic;color:var(--gold-600);font-size:1.2rem;margin-top:-0.5rem;">"${escapeHTML(o.motto)}"</p>` : ""}
    <div class="saint-meta">
      ${o.founded ? `<div class="saint-meta__item"><span class="saint-meta__label">Founded</span><span class="saint-meta__value">${escapeHTML(o.founded)}</span></div>` : ""}
      ${o.founder ? `<div class="saint-meta__item"><span class="saint-meta__label">Founder</span><span class="saint-meta__value">${escapeHTML(o.founder)}</span></div>` : ""}
      ${o.founded_at ? `<div class="saint-meta__item"><span class="saint-meta__label">Place</span><span class="saint-meta__value">${escapeHTML(o.founded_at)}</span></div>` : ""}
      ${o.rule ? `<div class="saint-meta__item"><span class="saint-meta__label">Rule</span><span class="saint-meta__value">${escapeHTML(o.rule)}</span></div>` : ""}
    </div>`;

  if (h) {
    if (h.founding) html += `<section class="bio-section"><p class="bio-section__label">I · Founding</p><h3 class="bio-section__title">Origins of the Order</h3>${paragraphs(h.founding)}</section>`;
    if (h.spirituality_and_rule) html += `<section class="bio-section"><p class="bio-section__label">II · Spirituality</p><h3 class="bio-section__title">The Rule &amp; Daily Life</h3>${paragraphs(h.spirituality_and_rule)}</section>`;
    if (h.habit_description) html += `<div class="callout"><p class="callout__label">The Habit</p><p>${escapeHTML(h.habit_description)}</p></div>`;
    if (h.expansion) html += `<section class="bio-section"><p class="bio-section__label">III · Expansion</p><h3 class="bio-section__title">Across Christendom</h3>${paragraphs(h.expansion)}</section>`;
    if (h.wine_legacy) html += `<section class="bio-section"><p class="bio-section__label">IV · The Vine</p><h3 class="bio-section__title">Wine Legacy of the Order</h3>${paragraphs(h.wine_legacy)}</section>`;
    if (h.decline_and_survival) html += `<section class="bio-section"><p class="bio-section__label">V · Trials</p><h3 class="bio-section__title">Decline &amp; Survival</h3>${paragraphs(h.decline_and_survival)}</section>`;
    if (h.modern_day) html += `<section class="bio-section"><p class="bio-section__label">VI · Today</p><h3 class="bio-section__title">The Order in the Modern Era</h3>${paragraphs(h.modern_day)}</section>`;
    if (keyHouses) html += `<section class="bio-section"><p class="bio-section__label">VII · Houses</p><h3 class="bio-section__title">Key Houses &amp; Estates</h3><div class="members-grid">${keyHouses}</div></section>`;
    if (memberCards) html += `<section class="bio-section"><p class="bio-section__label">VIII · The Saints</p><h3 class="bio-section__title">Notable Members</h3><p style="font-size:0.95rem;font-style:italic;color:var(--ink-500);margin-bottom:1rem;">Names highlighted in burgundy lead to a full biography.</p><div class="members-grid">${memberCards}</div></section>`;
    if (h.key_dates && h.key_dates.length) {
      html += `<section class="bio-section"><p class="bio-section__label">IX · Chronicle</p><h3 class="bio-section__title">Key Dates</h3>
        <ul class="timeline">${h.key_dates.map((kd) => `<li><span class="timeline-year">${escapeHTML(kd.year || "—")}</span> ${escapeHTML(kd.event || "")}</li>`).join("")}</ul>
      </section>`;
    }
  } else {
    // Fallback to original short content
    html += `<h3>The Order &amp; the Vine</h3>${paragraphs(o.wine_story || o.biography || "")}`;
    if (memberCards) html += `<h3>Notable Members</h3><div class="members-grid">${memberCards}</div>`;
  }

  if (regionLinks) {
    html += `<section class="bio-section"><p class="bio-section__label">Cross-references</p><h3 class="bio-section__title">Wine Regions Shaped by This Order</h3><div>${regionLinks}</div></section>`;
  }

  openModal(html);
}

// ==========================================================================
// Footer stats
// ==========================================================================
function updateFooterStats() {
  const d = state.data;
  $("#footStats").textContent = `${d.countries.length} nations · ${d.regions.length} regions · ${d.saints.length} saints · ${d.orders.length} orders`;
}

document.addEventListener("DOMContentLoaded", init);
