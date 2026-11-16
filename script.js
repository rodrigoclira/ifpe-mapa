const CATEGORY_LABELS = {
  tecnicoIntegrado: "Técnico Integrado",
  tecnicoSubsequente: "Técnico Subsequente",
  superior: "Graduação / Superior",
  outros: "Outros / Pós-graduação",
};

const TYPE_LABELS = {
  campus: "Campus",
  polo_ead: "Polo EAD",
};

const THEME_STORAGE_KEY = "ifpe-theme";
const MOBILE_QUERY = window.matchMedia("(max-width: 900px)");
const DARK_SCHEME_QUERY = window.matchMedia("(prefers-color-scheme: dark)");

function getEffectiveTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return DARK_SCHEME_QUERY.matches ? "dark" : "light";
}

const map = L.map("map").setView([-8.3, -37.0], 7);

const TILE_LAYERS = {
  light: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
  dark: L.layerGroup([
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 16,
        attribution:
          "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community",
      }
    ),
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16 }
    ),
  ]),
};

let activeTileLayer = TILE_LAYERS[getEffectiveTheme()].addTo(map);

function switchTileLayer(theme) {
  const next = TILE_LAYERS[theme];
  if (next === activeTileLayer) return;
  map.removeLayer(activeTileLayer);
  activeTileLayer = next.addTo(map);
}

function createIcon(tipo) {
  const colorVar = tipo === "polo_ead" ? "--ead-dot" : "--accent";
  const color = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
  return L.divIcon({
    className: "unit-marker",
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    popupAnchor: [0, -6],
  });
}

function buildPopupHtml(unit) {
  const typeClass = unit.tipo === "polo_ead" ? "popup-card--polo_ead" : "popup-card--campus";
  let html = `<div class="popup-card ${typeClass}">`;
  html += `<div class="popup-card__header">`;
  html += `<span class="popup-card__badge">${TYPE_LABELS[unit.tipo] || "Unidade"}</span>`;
  html += `<h3 class="popup-card__title">${unit.nome}</h3>`;
  html += `</div>`;

  html += `<div class="popup-card__body">`;
  html += `<p class="popup-card__address">${unit.cidade} — ${unit.endereco}</p>`;

  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const cursos = unit.cursos?.[key];
    if (cursos && cursos.length) {
      html += `<div class="popup-card__section">`;
      html += `<span class="popup-card__section-label">${label}</span>`;
      html += `<div class="popup-card__chips">`;
      html += cursos.map((c) => `<span class="chip">${c}</span>`).join("");
      html += `</div></div>`;
    }
  }

  html += `<a class="popup-card__cta" href="${unit.portalUrl}" target="_blank" rel="noopener">Ver no portal do IFPE →</a>`;
  html += `</div></div>`;
  return html;
}

function initThemeToggle() {
  const themeToggleBtn = document.getElementById("theme-toggle");

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
    switchTileLayer(theme);
    themeToggleBtn.setAttribute("aria-pressed", String(theme === "dark"));
  }

  themeToggleBtn.addEventListener("click", () => {
    const next = getEffectiveTheme() === "dark" ? "light" : "dark";
    applyTheme(next, true);
  });

  DARK_SCHEME_QUERY.addEventListener("change", (e) => {
    if (localStorage.getItem(THEME_STORAGE_KEY)) return;
    switchTileLayer(e.matches ? "dark" : "light");
  });

  themeToggleBtn.setAttribute("aria-pressed", String(getEffectiveTheme() === "dark"));
}

function initDrawer() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("drawer-overlay");
  const drawerToggle = document.getElementById("drawer-toggle");

  function openDrawer() {
    sidebar.classList.add("open");
    overlay.classList.add("visible");
    drawerToggle.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    sidebar.classList.remove("open");
    overlay.classList.remove("visible");
    drawerToggle.setAttribute("aria-expanded", "false");
  }

  drawerToggle.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeDrawer() : openDrawer();
  });

  overlay.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  return { closeDrawer };
}

function getAllCourses(unit) {
  return Object.values(unit.cursos || {}).flat();
}

async function init() {
  const response = await fetch("campi.json");
  const units = await response.json();

  const listEl = document.getElementById("unit-list");
  const searchInput = document.getElementById("search-input");
  const courseSuggestions = document.getElementById("course-suggestions");
  const filterButtons = document.querySelectorAll(".filter-btn");
  const { closeDrawer } = initDrawer();

  const markersById = new Map();
  let activeFilter = "todos";

  const allCourses = Array.from(new Set(units.flatMap(getAllCourses))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  courseSuggestions.innerHTML = allCourses.map((course) => `<option value="${course}"></option>`).join("");

  units.forEach((unit) => {
    const marker = L.marker([unit.lat, unit.lon], { icon: createIcon(unit.tipo) }).addTo(map);
    marker.bindPopup(buildPopupHtml(unit), { className: "unit-popup", maxWidth: 280, minWidth: 240 });
    markersById.set(unit.id, marker);
  });

  function renderList() {
    const query = searchInput.value.trim().toLowerCase();
    listEl.innerHTML = "";

    const filtered = units
      .filter((unit) => activeFilter === "todos" || unit.tipo === activeFilter)
      .map((unit) => {
        if (!query) return { unit, matchedCourse: null };
        if (unit.nome.toLowerCase().includes(query) || unit.cidade.toLowerCase().includes(query)) {
          return { unit, matchedCourse: null };
        }
        const matchedCourse = getAllCourses(unit).find((course) => course.toLowerCase().includes(query));
        return matchedCourse ? { unit, matchedCourse } : null;
      })
      .filter(Boolean);

    if (!filtered.length) {
      listEl.innerHTML = '<li class="empty-state">Nenhuma unidade ou curso encontrado.</li>';
      return;
    }

    filtered.forEach(({ unit, matchedCourse }) => {
      const li = document.createElement("li");
      li.className = "unit-item";
      const dotClass = unit.tipo === "polo_ead" ? "dot-ead" : "dot-campus";
      const subtitle = matchedCourse ? `Curso: ${matchedCourse}` : unit.cidade;
      li.innerHTML = `
        <button type="button">
          <span class="dot ${dotClass}"></span>
          <span class="unit-text">
            <strong>${unit.nome}</strong>
            <span>${subtitle}</span>
          </span>
        </button>
      `;
      li.querySelector("button").addEventListener("click", () => {
        const marker = markersById.get(unit.id);
        map.flyTo(marker.getLatLng(), 13, { duration: 0.8 });
        marker.openPopup();
        if (MOBILE_QUERY.matches) closeDrawer();
      });
      listEl.appendChild(li);
    });
  }

  searchInput.addEventListener("input", renderList);
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      renderList();
    });
  });

  renderList();
}

initThemeToggle();
init();
