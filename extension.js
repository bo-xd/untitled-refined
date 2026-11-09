(function installUntitledRefined() {
  "use strict";

  if (globalThis.__untitledRefinedInstalled) return;

  const SEARCH_INPUT_SELECTOR = 'input[placeholder="Search tracks"]';
  const TRACK_ROW_SELECTOR = 'li[data-testid="project-detail-track"]';
  const TRACK_BUTTON_SELECTOR = '[data-testid="project-detail-track-button"]';
  const SELECTED_ROW_ATTRIBUTE = "data-untitled-refined-selected";
  const STYLE_ID = "untitled-refined-styles";
  const FAVORITE_BUTTON_CLASS = "untitled-refined-favorite";
  const FAVORITE_ROW_ATTRIBUTE = "data-untitled-refined-favorite";
  const FAVORITES_STORAGE_KEY = "untitled-refined:favorites";
  const FAVORITES_ONLY_ATTRIBUTE = "data-untitled-refined-favorites-only";
  const FAVORITES_BAR_CLASS = "untitled-refined-favorites-bar";
  const PLAYER_FAVORITE_CLASS = "untitled-refined-player-favorite";
  const HEART_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"/></svg>';
  const MAX_ANIMATED_ROWS = 12;
  const MAX_TRAVEL_PX = 44;
  const MOVE_DURATION_MS = 240;
  const EXACT_DURATION_MS = 420;
  const SEARCH_ENTER_DURATION_MS = 300;
  const PROJECT_ENTER_DURATION_MS = 260;
  const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";
  const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

  let scheduled = false;
  let isApplying = false;
  let lastExactKey = null;
  let animatedProjectPath = null;
  let selectedRow = null;
  const activeAnimations = new WeakMap();
  const animatedSearchInputs = new WeakSet();
  let favorites = loadFavorites();
  let favoriteIndex = buildFavoriteIndex();
  let favoritesOnly = false;
  let favoritesOnlyPath = null;
  let favoritesBar = null;
  let pinnedPath = null;
  let playerButton = null;
  let observedPlaybar = null;
  let playerSyncScheduled = false;

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[’'`]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function levenshtein(left, right) {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];

      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + substitutionCost,
        );
      }

      previous = current;
    }

    return previous[right.length];
  }

  function score(title, query) {
    const normalizedTitle = normalize(title);
    const normalizedQuery = normalize(query);

    if (!normalizedQuery) return 0;
    if (!normalizedTitle) return Number.POSITIVE_INFINITY;
    if (normalizedTitle === normalizedQuery) return 0;
    if (normalizedTitle.startsWith(`${normalizedQuery} `)) {
      return 100 + normalizedTitle.length - normalizedQuery.length;
    }

    const wordStart = normalizedTitle.indexOf(` ${normalizedQuery}`);
    if (wordStart >= 0) {
      return 200 + wordStart + normalizedTitle.length - normalizedQuery.length;
    }

    const substringIndex = normalizedTitle.indexOf(normalizedQuery);
    if (substringIndex >= 0) {
      return 300 + substringIndex + normalizedTitle.length - normalizedQuery.length;
    }

    const queryTerms = normalizedQuery.split(" ");
    const allTermsPresent = queryTerms.every((term) => normalizedTitle.includes(term));
    if (allTermsPresent) {
      const orderPenalty = queryTerms
        .map((term) => normalizedTitle.indexOf(term))
        .reduce((total, position, index, positions) => {
          if (index === 0) return total;
          return total + (position < positions[index - 1] ? 25 : 0);
        }, 0);
      return 400 + orderPenalty + Math.abs(normalizedTitle.length - normalizedQuery.length);
    }

    const distance = levenshtein(normalizedTitle, normalizedQuery);
    const scale = Math.max(normalizedTitle.length, normalizedQuery.length, 1);
    return 600 + Math.round((distance / scale) * 100) + Math.abs(normalizedTitle.length - normalizedQuery.length);
  }

  function getSearchInput() {
    return document.querySelector(SEARCH_INPUT_SELECTOR);
  }

  function getTitle(row) {
    return row.querySelector("h3")?.textContent?.trim() ?? "";
  }

  function getTrackList(rows) {
    if (rows.length === 0) return null;

    const candidate = rows[0].parentElement;
    return rows.every((row) => row.parentElement === candidate) ? candidate : null;
  }

  function getTrackRows() {
    return Array.from(document.querySelectorAll(TRACK_ROW_SELECTOR));
  }

  function getProjectPath(path = location.pathname) {
    return path.match(/^\/library\/project\/[^/?#]+/)?.[0] ?? null;
  }

  // Favorites are stored as { path, titles }: the project path plus one or more normalized
  // titles. The playbar shows "Artist - Title" while rows may show only "Title", so a
  // favorite added from the player keeps both forms and matches either.
  function loadFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]");
      if (!Array.isArray(stored)) return [];
      return stored.filter(
        (entry) => entry && typeof entry.path === "string" && Array.isArray(entry.titles),
      );
    } catch {
      return [];
    }
  }

  function buildFavoriteIndex() {
    return new Set(favorites.flatMap((entry) => entry.titles.map((title) => `${entry.path}::${title}`)));
  }

  function setFavorites(next) {
    favorites = next;
    favoriteIndex = buildFavoriteIndex();

    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // Storage unavailable (private mode, blocked site data): keep favorites for this session only.
    }

    refreshFavoriteViews();
  }

  function isFavoriteTitle(path, titles) {
    return Boolean(path) && titles.some((title) => title && favoriteIndex.has(`${path}::${title}`));
  }

  function toggleFavoriteTitles(path, titles) {
    const uniqueTitles = [...new Set(titles.filter(Boolean))];
    if (!path || uniqueTitles.length === 0) return false;

    if (isFavoriteTitle(path, uniqueTitles)) {
      setFavorites(
        favorites.filter(
          (entry) => entry.path !== path || !entry.titles.some((title) => uniqueTitles.includes(title)),
        ),
      );
      return false;
    }

    setFavorites([...favorites, { path, titles: uniqueTitles }]);
    return true;
  }

  function countProjectFavorites(path = getProjectPath()) {
    return path ? favorites.filter((entry) => entry.path === path).length : 0;
  }

  function isFavorite(row) {
    return isFavoriteTitle(getProjectPath(), [normalize(getTitle(row))]);
  }

  function popHeart(button, baseTransform = "") {
    if (!button || !canAnimate()) return;

    playAnimation(
      button,
      [
        { transform: `${baseTransform} scale(0.7)` },
        { transform: `${baseTransform} scale(1.18)`, offset: 0.55 },
        { transform: `${baseTransform} scale(1)` },
      ],
      { duration: 280, easing: EASE_OUT_QUART },
    );
  }

  function describeFavorite(button, favorite, title) {
    button.setAttribute("aria-pressed", String(favorite));
    button.setAttribute(
      "aria-label",
      `${favorite ? "Remove" : "Add"} ${title || "track"} ${favorite ? "from" : "to"} favorites`,
    );
    button.title = favorite ? "Remove from favorites" : "Add to favorites";
  }

  function renderFavorite(row) {
    const favorite = isFavorite(row);
    const button = row.querySelector(`:scope > .${FAVORITE_BUTTON_CLASS}`);

    if (favorite) row.setAttribute(FAVORITE_ROW_ATTRIBUTE, "true");
    else row.removeAttribute(FAVORITE_ROW_ATTRIBUTE);

    if (button) describeFavorite(button, favorite, getTitle(row));
  }

  function toggleFavorite(row) {
    const added = toggleFavoriteTitles(getProjectPath(), [normalize(getTitle(row))]);
    if (added) popHeart(row.querySelector(`:scope > .${FAVORITE_BUTTON_CLASS}`), "translateY(-50%)");
  }

  function refreshFavoriteViews() {
    getTrackRows().forEach(renderFavorite);
    if (favoritesOnly && countProjectFavorites() === 0) setFavoritesOnly(false);
    renderFavoritesBar();
    syncPlayerFavorite();
    scheduleRanking();
  }

  function decorateRows() {
    getTrackRows().forEach((row) => {
      if (!row.querySelector(`:scope > .${FAVORITE_BUTTON_CLASS}`)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = FAVORITE_BUTTON_CLASS;
        button.innerHTML = HEART_SVG;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFavorite(row);
        });
        row.append(button);
      }

      renderFavorite(row);
    });
  }

  function getNavigableRows() {
    const rows = getTrackRows();
    return favoritesOnly ? rows.filter(isFavorite) : rows;
  }

  function setFavoritesOnly(enabled) {
    favoritesOnly = enabled;
    favoritesOnlyPath = enabled ? getProjectPath() : null;
    document.documentElement.toggleAttribute(FAVORITES_ONLY_ATTRIBUTE, enabled);
    if (enabled && selectedRow && !isFavorite(selectedRow)) clearSelectedRow();
    renderFavoritesBar();
  }

  function renderFavoritesBar(list = getTrackList(getTrackRows())) {
    const count = countProjectFavorites();

    if (!list || count === 0) {
      favoritesBar?.remove();
      return;
    }

    if (!favoritesBar) {
      favoritesBar = document.createElement("button");
      favoritesBar.type = "button";
      favoritesBar.className = FAVORITES_BAR_CLASS;
      favoritesBar.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setFavoritesOnly(!favoritesOnly);
      });
    }

    const label = `Favorites only · ${count}`;
    if (favoritesBar.dataset.label !== label) {
      favoritesBar.dataset.label = label;
      favoritesBar.innerHTML = `${HEART_SVG}<span>${label}</span>`;
    }
    favoritesBar.setAttribute("aria-pressed", String(favoritesOnly));
    favoritesBar.title = favoritesOnly ? "Show all tracks" : "Show only favorite tracks";

    if (favoritesBar.nextElementSibling !== list) list.before(favoritesBar);
  }

  function getPlayer() {
    const playbar = document.getElementById("playbar");
    if (!playbar) return null;

    const title = playbar.querySelector(".playbar-title span")?.textContent?.trim() ?? "";
    const href = playbar.querySelector('a[href*="/library/project/"]')?.getAttribute("href") ?? "";
    let path = null;
    try {
      path = getProjectPath(new URL(href, location.origin).pathname);
    } catch {
      path = null;
    }

    const playButton = playbar.querySelector('button[aria-label="Pause"], button[aria-label="Play"]');
    return { playbar, title, path, controls: playButton?.parentElement ?? null };
  }

  function getPlayerTitles(title) {
    const separator = title.indexOf(" - ");
    return [normalize(title), separator >= 0 ? normalize(title.slice(separator + 3)) : ""].filter(Boolean);
  }

  const playerObserver = new MutationObserver(schedulePlayerSync);

  function schedulePlayerSync() {
    if (playerSyncScheduled) return;
    playerSyncScheduled = true;
    requestAnimationFrame(() => {
      playerSyncScheduled = false;
      syncPlayerFavorite();
    });
  }

  function syncPlayerFavorite() {
    const player = getPlayer();
    if (!player?.controls) return;

    if (observedPlaybar !== player.playbar) {
      playerObserver.disconnect();
      playerObserver.observe(player.playbar, { childList: true, subtree: true, characterData: true });
      observedPlaybar = player.playbar;
    }

    if (!playerButton) {
      playerButton = document.createElement("button");
      playerButton.type = "button";
      playerButton.className =
        `${PLAYER_FAVORITE_CLASS} flex h-44 w-44 items-center justify-center transition-opacity duration-150 hover:opacity-80`;
      playerButton.innerHTML = HEART_SVG;
      playerButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = getPlayer();
        if (!current) return;
        const added = toggleFavoriteTitles(current.path, getPlayerTitles(current.title));
        if (added) popHeart(playerButton);
      });
    }

    if (playerButton.parentElement !== player.controls || player.controls.firstElementChild !== playerButton) {
      player.controls.prepend(playerButton);
    }

    const available = Boolean(player.title && player.path);
    const favorite = available && isFavoriteTitle(player.path, getPlayerTitles(player.title));
    playerButton.hidden = !available;
    playerButton.classList.toggle("text-yellow", favorite);
    describeFavorite(playerButton, favorite, player.title);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ${TRACK_ROW_SELECTOR}[${SELECTED_ROW_ATTRIBUTE}="true"] {
        background-color: var(--color-shading, rgba(127, 127, 127, 0.16)) !important;
        border-color: color-mix(in srgb, currentColor 30%, transparent) !important;
        transition: background-color 140ms ease-out, border-color 140ms ease-out !important;
      }

      ${TRACK_ROW_SELECTOR} {
        position: relative;
      }

      .${FAVORITE_BUTTON_CLASS} {
        position: absolute;
        top: 50%;
        right: 56px;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        opacity: 0;
        transform: translateY(-50%);
        transition: opacity 140ms ease-out, background-color 140ms ease-out;
      }

      .${FAVORITE_BUTTON_CLASS} svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linejoin: round;
      }

      .${FAVORITE_BUTTON_CLASS}[aria-pressed="true"] svg {
        fill: currentColor;
      }

      .${FAVORITE_BUTTON_CLASS}:hover {
        background-color: color-mix(in srgb, currentColor 12%, transparent);
      }

      ${TRACK_ROW_SELECTOR}:hover .${FAVORITE_BUTTON_CLASS},
      ${TRACK_ROW_SELECTOR}[${SELECTED_ROW_ATTRIBUTE}="true"] .${FAVORITE_BUTTON_CLASS},
      ${TRACK_ROW_SELECTOR}[${FAVORITE_ROW_ATTRIBUTE}="true"] .${FAVORITE_BUTTON_CLASS},
      .${FAVORITE_BUTTON_CLASS}:focus-visible {
        opacity: 1;
      }

      html[${FAVORITES_ONLY_ATTRIBUTE}] ${TRACK_ROW_SELECTOR}:not([${FAVORITE_ROW_ATTRIBUTE}="true"]) {
        display: none !important;
      }

      .${FAVORITES_BAR_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
        padding: 4px 12px 4px 10px;
        border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 13px;
        line-height: 18px;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 140ms ease-out, background-color 140ms ease-out;
      }

      .${FAVORITES_BAR_CLASS}:hover,
      .${FAVORITES_BAR_CLASS}[aria-pressed="true"] {
        opacity: 1;
      }

      .${FAVORITES_BAR_CLASS}[aria-pressed="true"] {
        background-color: color-mix(in srgb, currentColor 12%, transparent);
      }

      .${FAVORITES_BAR_CLASS} svg,
      .${PLAYER_FAVORITE_CLASS} svg {
        flex: none;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linejoin: round;
      }

      .${FAVORITES_BAR_CLASS}[aria-pressed="true"] svg,
      .${PLAYER_FAVORITE_CLASS}[aria-pressed="true"] svg {
        fill: currentColor;
      }

      .${PLAYER_FAVORITE_CLASS} svg {
        width: 20px;
        height: 20px;
      }

      .${PLAYER_FAVORITE_CLASS}[hidden] {
        display: none !important;
      }

      @media (prefers-reduced-motion: reduce) {
        ${TRACK_ROW_SELECTOR}[${SELECTED_ROW_ATTRIBUTE}="true"],
        .${FAVORITES_BAR_CLASS},
        .${FAVORITE_BUTTON_CLASS} {
          transition: none !important;
        }
      }
    `;
    (document.head ?? document.documentElement).append(style);
  }

  function clearSelectedRow() {
    if (!selectedRow) return;
    selectedRow.removeAttribute(SELECTED_ROW_ATTRIBUTE);
    selectedRow = null;
  }

  function selectTrackRow(row, { moveFocus = false, scroll = true } = {}) {
    if (selectedRow !== row) {
      clearSelectedRow();
      selectedRow = row;
      selectedRow.setAttribute(SELECTED_ROW_ATTRIBUTE, "true");

      if (canAnimate()) {
        playAnimation(
          selectedRow,
          [
            { transform: "scale(0.995)", filter: "brightness(1.12)" },
            { transform: "scale(1)", filter: "brightness(1)" },
          ],
          { duration: 160, easing: EASE_OUT_QUART },
        );
      }
    }

    if (scroll) selectedRow.scrollIntoView({ block: "nearest" });

    if (moveFocus) {
      selectedRow.querySelector(TRACK_BUTTON_SELECTOR)?.focus({ preventScroll: true });
    }
  }

  function updateDisplayedIndex(row, index) {
    if (!Number.isFinite(index)) return;
    const button = row.querySelector(TRACK_BUTTON_SELECTOR);
    const label = button?.querySelector(":scope > div:first-child span");

    if (label && /^\d+$/.test(label.textContent?.trim() ?? "")) {
      const nextIndex = String(index + 1);
      if (label.textContent !== nextIndex) label.textContent = nextIndex;
    }
  }

  function canAnimate() {
    return (
      typeof Element.prototype.animate === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function stopAnimation(element) {
    const animation = activeAnimations.get(element);
    if (!animation) return;
    animation.cancel();
    activeAnimations.delete(element);
  }

  function playAnimation(element, keyframes, options) {
    stopAnimation(element);
    const animation = element.animate(keyframes, options);
    activeAnimations.set(element, animation);
    animation.addEventListener(
      "finish",
      () => {
        if (activeAnimations.get(element) === animation) activeAnimations.delete(element);
      },
      { once: true },
    );
    animation.addEventListener(
      "cancel",
      () => {
        if (activeAnimations.get(element) === animation) activeAnimations.delete(element);
      },
      { once: true },
    );
  }

  function findDoneButton(input) {
    let searchArea = input.parentElement;

    while (searchArea && searchArea !== document.body) {
      const doneButton = Array.from(searchArea.querySelectorAll("button")).find(
        (button) => button.textContent?.trim().toLocaleLowerCase() === "done",
      );
      if (doneButton) return doneButton;
      searchArea = searchArea.parentElement;
    }

    return null;
  }

  function animateSearchEntrance() {
    const input = getSearchInput();
    if (!input || animatedSearchInputs.has(input)) return;

    animatedSearchInputs.add(input);
    if (!canAnimate()) return;

    const field = input.parentElement;
    if (!field) return;

    playAnimation(
      field,
      [
        {
          transform: "translateX(18px) scaleX(0.86)",
          transformOrigin: "right center",
          opacity: 0.18,
          filter: "blur(5px)",
        },
        {
          transform: "translateX(0) scaleX(1)",
          transformOrigin: "right center",
          opacity: 1,
          filter: "blur(0)",
        },
      ],
      {
        duration: SEARCH_ENTER_DURATION_MS,
        easing: EASE_OUT_EXPO,
      },
    );

    const doneButton = findDoneButton(input);
    if (doneButton) {
      playAnimation(
        doneButton,
        [
          { transform: "translateX(8px)", opacity: 0 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        {
          delay: 45,
          duration: 210,
          easing: EASE_OUT_QUART,
          fill: "backwards",
        },
      );
    }
  }

  function findProjectSurface() {
    const row = document.querySelector(TRACK_ROW_SELECTOR);
    if (!row) return null;

    let surface = row.parentElement;
    const fallback = surface;

    while (surface && surface !== document.body) {
      if (surface.querySelector("h1, h2") && surface.querySelector("img")) return surface;
      surface = surface.parentElement;
    }

    return fallback;
  }

  function animateProjectEntrance() {
    if (!location.pathname.startsWith("/library/project/")) {
      animatedProjectPath = null;
      return;
    }

    if (animatedProjectPath === location.pathname) return;

    const surface = findProjectSurface();
    if (!surface) return;

    animatedProjectPath = location.pathname;
    if (!canAnimate()) return;

    playAnimation(
      surface,
      [
        { opacity: 0.12, transform: "translateY(8px) scale(0.996)", filter: "blur(3px)" },
        { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
      ],
      {
        duration: PROJECT_ENTER_DURATION_MS,
        easing: EASE_OUT_EXPO,
      },
    );
  }

  function animateRanking(rankedRows, previousPositions, exactRow) {
    if (!canAnimate()) return;

    rankedRows.slice(0, MAX_ANIMATED_ROWS).forEach((row) => {
      const previousTop = previousPositions.get(row);
      const currentTop = row.getBoundingClientRect().top;
      const rawDelta = typeof previousTop === "number" ? previousTop - currentTop : 0;
      const delta = Math.max(-MAX_TRAVEL_PX, Math.min(MAX_TRAVEL_PX, rawDelta));
      const isExact = row === exactRow;

      if (Math.abs(delta) < 0.5 && !isExact) return;

      playAnimation(
        row,
        [
          {
            transform: `translateY(${delta}px) scale(${isExact ? 0.985 : 1})`,
            opacity: isExact ? 0.78 : 0.84,
            filter: isExact ? "brightness(1.22)" : "brightness(1)",
          },
          {
            transform: "translateY(0) scale(1)",
            opacity: 1,
            filter: "brightness(1)",
          },
        ],
        {
          duration: isExact ? EXACT_DURATION_MS : MOVE_DURATION_MS,
          easing: EASE_OUT_QUART,
        },
      );
    });
  }

  function getOriginalOrder(row) {
    const order = Number.parseInt(row.dataset.untitledRefinedOrder ?? "", 10);
    return Number.isNaN(order) ? Number.POSITIVE_INFINITY : order;
  }

  function recordOriginalOrder(rows) {
    rows.forEach((row, index) => {
      if (row.dataset.untitledRefinedOrder === undefined) row.dataset.untitledRefinedOrder = String(index);
    });
  }

  // Search: score tier first (exact, prefix, word, substring, terms, fuzzy), then favorites,
  // then the precise score. An exact match always wins; favorites win close calls.
  function rankTracks(rows, query) {
    return rows
      .map((row, index) => {
        const value = score(getTitle(row), query);
        return {
          row,
          index,
          value,
          tier: value === 0 ? -1 : Math.floor(value / 100),
          favorite: isFavorite(row),
        };
      })
      .sort(
        (left, right) =>
          left.tier - right.tier ||
          Number(right.favorite) - Number(left.favorite) ||
          left.value - right.value ||
          left.index - right.index,
      )
      .map(({ row }) => row);
  }

  // No search: favorites pinned to the top, everything else in Untitled's original order.
  function pinFavorites(rows) {
    return rows
      .map((row, index) => ({ row, index, favorite: isFavorite(row), order: getOriginalOrder(row) }))
      .sort(
        (left, right) =>
          Number(right.favorite) - Number(left.favorite) ||
          left.order - right.order ||
          left.index - right.index,
      )
      .map(({ row }) => row);
  }

  function applyRanking() {
    scheduled = false;
    if (isApplying) return;

    const input = getSearchInput();
    const query = input?.value?.trim() ?? "";
    const path = getProjectPath();
    const rows = getTrackRows();
    const list = getTrackList(rows);

    renderFavoritesBar(list);
    if (!query) {
      lastExactKey = null;
      recordOriginalOrder(rows);
    }

    if (!list || rows.length < 2) return;
    if (!query && countProjectFavorites(path) === 0 && pinnedPath !== path) return;

    const rankedRows = query ? rankTracks(rows, query) : pinFavorites(rows);
    const needsReorder = rankedRows.some((row, index) => row !== rows[index]);
    const exactRow = query ? rankedRows.find((row) => score(getTitle(row), query) === 0) ?? null : null;
    const exactKey = exactRow
      ? `${normalize(query)}:${exactRow.dataset.trackSlug ?? getTitle(exactRow)}`
      : null;
    const shouldEmphasizeExact = Boolean(exactKey && exactKey !== lastExactKey);
    const animatedRows = new Set(rankedRows.slice(0, MAX_ANIMATED_ROWS));
    const previousPositions = new Map();

    if (canAnimate() && (needsReorder || shouldEmphasizeExact)) {
      animatedRows.forEach((row) => {
        stopAnimation(row);
        previousPositions.set(row, row.getBoundingClientRect().top);
      });
    }

    isApplying = true;
    try {
      if (needsReorder) {
        const fragment = document.createDocumentFragment();
        rankedRows.forEach((row) => fragment.append(row));
        list.append(fragment);
        if (!query) pinnedPath = path;
      }

      rankedRows.forEach((row, index) => updateDisplayedIndex(row, query ? index : getOriginalOrder(row)));
      if (query) {
        input.dataset.untitledRefinedActive = "true";
        input.title = "Exact title matches are ranked first";
      }
      lastExactKey = exactKey;

      if (previousPositions.size > 0) {
        animateRanking(rankedRows, previousPositions, shouldEmphasizeExact ? exactRow : null);
      }
    } finally {
      isApplying = false;
    }
  }

  function scheduleRanking() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyRanking);
  }

  const observer = new MutationObserver((mutations) => {
    if (isApplying) return;

    animateSearchEntrance();
    animateProjectEntrance();
    decorateRows();
    schedulePlayerSync();
    if (favoritesOnly && getProjectPath() !== favoritesOnlyPath) setFavoritesOnly(false);
    if (!getSearchInput()) clearSelectedRow();

    const trackListChanged = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) => {
        if (!(node instanceof Element)) return false;
        return node.matches(TRACK_ROW_SELECTOR) || Boolean(node.querySelector(TRACK_ROW_SELECTOR));
      }),
    );

    if (trackListChanged || getSearchInput()) scheduleRanking();
  });

  document.addEventListener(
    "input",
    (event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(SEARCH_INPUT_SELECTOR)) {
        clearSelectedRow();
        scheduleRanking();
      }
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;

      const focusedRow = event.target instanceof Element ? event.target.closest(TRACK_ROW_SELECTOR) : null;
      const plainKey = !event.altKey && !event.ctrlKey && !event.metaKey;
      const favoriteFromRow = focusedRow && plainKey && !event.shiftKey && event.code === "KeyF";
      const favoriteFromSearch =
        plainKey && event.shiftKey && event.key === "Enter" &&
        event.target instanceof Element && event.target.matches(SEARCH_INPUT_SELECTOR) &&
        selectedRow?.isConnected;

      if (favoriteFromRow || favoriteFromSearch) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(focusedRow ?? selectedRow);
        return;
      }

      const input = getSearchInput();
      if (!input) return;

      const rows = getNavigableRows();
      if (rows.length === 0) return;

      const targetRow = event.target instanceof Element ? event.target.closest(TRACK_ROW_SELECTOR) : null;
      const fromInput = event.target === input;
      if (!fromInput && !targetRow) return;

      if (["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();

        const selectedIndex = selectedRow ? rows.indexOf(selectedRow) : -1;
        const focusedIndex = targetRow ? rows.indexOf(targetRow) : -1;
        const currentIndex = selectedIndex >= 0 ? selectedIndex : focusedIndex;
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = currentIndex < 0
          ? (direction > 0 ? 0 : rows.length - 1)
          : Math.max(0, Math.min(rows.length - 1, currentIndex + direction));

        selectTrackRow(rows[nextIndex], { moveFocus: Boolean(targetRow) });
        return;
      }

      if (fromInput && event.key === "Enter" && input.value.trim()) {
        event.preventDefault();
        const row = selectedRow && rows.includes(selectedRow) ? selectedRow : rows[0];
        selectTrackRow(row);
        row.querySelector(TRACK_BUTTON_SELECTOR)?.click();
      }
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(`.${FAVORITE_BUTTON_CLASS}`)) return;
      const row = event.target.closest(TRACK_ROW_SELECTOR);
      if (row) selectTrackRow(row, { scroll: false });
    },
    true,
  );

  window.addEventListener("storage", (event) => {
    if (event.key !== FAVORITES_STORAGE_KEY) return;
    favorites = loadFavorites();
    favoriteIndex = buildFavoriteIndex();
    refreshFavoriteViews();
  });

  installStyles();
  decorateRows();
  syncPlayerFavorite();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  animateSearchEntrance();
  animateProjectEntrance();
  scheduleRanking();

  Object.defineProperty(globalThis, "__untitledRefinedInstalled", {
    configurable: true,
    value: true,
  });
})();
