(function installUntitledRefined() {
  "use strict";

  if (globalThis.__untitledRefinedInstalled) return;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const SEARCH_INPUT_SELECTOR = 'input[placeholder="Search tracks"]';
  const TRACK_ROW_SELECTOR = 'li[data-testid="project-detail-track"]';
  const TRACK_BUTTON_SELECTOR = '[data-testid="project-detail-track-button"]';
  const ROW_ACTIONS_ANCHOR = '[aria-label="Track more options"]';

  const PREFIX = "untitled-refined";
  const STYLE_ID = `${PREFIX}-styles`;
  const CONTROL_ATTRIBUTE = `data-${PREFIX}-control`;
  const SELECTED_ROW_ATTRIBUTE = `data-${PREFIX}-selected`;
  const FAVORITE_ROW_ATTRIBUTE = `data-${PREFIX}-favorite`;
  const COLLAPSED_ROW_ATTRIBUTE = `data-${PREFIX}-collapsed`;
  const FILTERED_ROW_ATTRIBUTE = `data-${PREFIX}-filtered`;
  const VIEW_HIDDEN_ATTRIBUTE = `data-${PREFIX}-view-hidden`;

  const FAVORITE_BUTTON_CLASS = `${PREFIX}-favorite`;
  const FAVORITE_INLINE_CLASS = `${PREFIX}-favorite-inline`;
  const PLAYS_CLASS = `${PREFIX}-plays`;
  const VERSIONS_CLASS = `${PREFIX}-versions`;
  const TOOLBAR_CLASS = `${PREFIX}-toolbar`;
  const PILL_CLASS = `${PREFIX}-pill`;
  const PLAYER_FAVORITE_CLASS = `${PREFIX}-player-favorite`;
  const LAUNCHER_CLASS = `${PREFIX}-launcher`;
  const PANEL_CLASS = `${PREFIX}-panel`;
  const TOAST_CLASS = `${PREFIX}-toast`;
  const NEW_CLASS = `${PREFIX}-new`;
  const EDIT_CLASS = `${PREFIX}-edit`;
  const META_CLASS = `${PREFIX}-meta`;
  const EDITOR_CLASS = `${PREFIX}-editor`;
  const PLAYER_PLAYS_CLASS = `${PREFIX}-player-plays`;

  const STORAGE = {
    favorites: `${PREFIX}:favorites`,
    plays: `${PREFIX}:plays`,
    resume: `${PREFIX}:resume`,
    settings: `${PREFIX}:settings`,
    tags: `${PREFIX}:tags`,
    notes: `${PREFIX}:notes`,
    projects: `${PREFIX}:projects`,
    stats: `${PREFIX}:stats`,
  };

  const PLAY_COUNT_SECONDS = 30;
  const MAX_PLAY_ENTRIES = 3000;
  const RESUME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  const RESUME_MIN_SECONDS = 15;
  const RESUME_PROMPT_DELAY_MS = 4000;
  const VERSION_PATTERN = /\s*[[(]\s*v(?:ersion)?\s*\.?\s*(\d+)\s*[\])]\s*$/i;

  const MAX_ANIMATED_ROWS = 12;
  const MAX_TRAVEL_PX = 44;
  const MOVE_DURATION_MS = 240;
  const EXACT_DURATION_MS = 420;
  const SEARCH_ENTER_DURATION_MS = 300;
  const PROJECT_ENTER_DURATION_MS = 260;
  const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";
  const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

  const ICONS = {
    heart:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"/></svg>',
    play:
      '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    layers:
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
    pencil:
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    note:
      '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
    tag:
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.2"/></svg>',
    chart:
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let scheduled = false;
  let isApplying = false;
  let lastExactKey = null;
  let animatedProjectPath = null;
  let selectedRow = null;
  let searchWasOpen = false;
  let pinnedPath = null;
  let favoritesOnly = false;
  let newOnly = false;
  let tagFilter = null;
  let viewPath = null;
  let groupsAvailable = false;
  let toolbar = null;
  let playerButton = null;
  let observedPlaybar = null;
  let playerSyncScheduled = false;
  let launcher = null;
  let panel = null;
  let panelTab = "favorites";
  let toastElement = null;
  let toastTimer = null;
  let resumePromptShown = false;
  let playback = null;
  let lastResumeSave = { key: null, position: -Infinity };
  let panelSearchQuery = "";
  let queue = null;
  let sleepTimer = null;
  let loop = null;
  let editor = null;
  let playerPlays = null;
  let pendingListen = 0;
  let lastListenFlush = Date.now();
  const visitSnapshots = new Map();

  const activeAnimations = new WeakMap();
  const animatedSearchInputs = new WeakSet();
  const expandedGroups = new Set();

  let legacyFavorites = new Set();
  let favorites = loadFavorites();
  let favoriteIndex = buildFavoriteIndex();
  let plays = loadJSON(STORAGE.plays, {});
  let settings = {
    groupVersions: false,
    sortByPlays: false,
    resumePrompt: true,
    shortcuts: true,
    showPlays: true,
    showNew: true,
    ...loadJSON(STORAGE.settings, {}),
  };
  let tags = loadJSON(STORAGE.tags, {});
  let notes = loadJSON(STORAGE.notes, {});
  let projects = loadJSON(STORAGE.projects, {});
  let stats = { seconds: 0, byProject: {}, ...loadJSON(STORAGE.stats, {}) };

  // ---------------------------------------------------------------------------
  // Generic helpers
  // ---------------------------------------------------------------------------

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase()
      .replace(/[’'`]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function loadJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode, blocked site data): keep data for this session only.
    }
  }

  function removeStored(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  }

  function el(tag, props = {}, ...children) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (name === "className") element.className = value;
      else if (name === "html") element.innerHTML = value;
      else if (name.startsWith("on")) element.addEventListener(name.slice(2).toLowerCase(), value);
      else element.setAttribute(name, value === true ? "" : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }

  function controlButton(className, props = {}, ...children) {
    return el("button", { type: "button", className, [CONTROL_ATTRIBUTE]: true, ...props }, ...children);
  }

  function setAttributeFlag(element, name, enabled) {
    if (enabled && element.getAttribute(name) !== "true") element.setAttribute(name, "true");
    else if (!enabled && element.hasAttribute(name)) element.removeAttribute(name);
  }

  function parseClock(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return null;
    const parts = trimmed.split(":").map(Number);
    if (parts.length === 0 || parts.some(Number.isNaN)) return null;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = String(total % 60).padStart(2, "0");
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
  }

  function timeAgo(timestamp) {
    const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(check, timeoutMs = 8000, intervalMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = check();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
  }

  // ---------------------------------------------------------------------------
  // Search scoring
  // ---------------------------------------------------------------------------

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

  // Filter words inside a search: "v2" keeps only [V2] versions, "feat"/"ft" keeps only
  // features. Untitled filters by title before the extension sees the list, so filters
  // can only narrow what its own search already returned.
  function parseQuery(rawQuery) {
    const filters = { version: null, feature: false, tag: null };
    const words = rawQuery.split(/\s+/).filter(Boolean);
    const remaining = [];

    for (const word of words) {
      const version = word.match(/^v(\d+)$/i);
      if (version) filters.version = Number(version[1]);
      else if (/^#\S+/.test(word)) filters.tag = cleanTag(word);
      else if (/^(feat|ft)\.?$/i.test(word)) filters.feature = true;
      else remaining.push(word);
    }

    filters.active = filters.version !== null || filters.feature || Boolean(filters.tag);
    return { text: remaining.join(" "), filters };
  }

  function matchesFilters(row, filters) {
    if (!filters.active) return true;
    const title = getTitle(row);
    if (filters.version !== null && parseVersion(title).version !== filters.version) return false;
    if (filters.feature && !/\b(feat|ft)\b\.?/i.test(title)) return false;
    if (filters.tag && !rowTags(row).includes(filters.tag)) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Page model
  // ---------------------------------------------------------------------------

  function getSearchInput() {
    return document.querySelector(SEARCH_INPUT_SELECTOR);
  }

  function getTitle(row) {
    return row.querySelector("h3")?.textContent?.trim() ?? "";
  }

  function getTrackRows() {
    return Array.from(document.querySelectorAll(TRACK_ROW_SELECTOR));
  }

  function getTrackList(rows) {
    if (rows.length === 0) return null;

    const candidate = rows[0].parentElement;
    return rows.every((row) => row.parentElement === candidate) ? candidate : null;
  }

  function getProjectPath(path = location.pathname) {
    return path.match(/^\/library\/project\/[^/?#]+/)?.[0] ?? null;
  }

  function getProjectName() {
    const heading = Array.from(document.querySelectorAll("h1")).find((h1) => h1.textContent.trim());
    return heading?.textContent.trim() ?? "";
  }

  function rowKey(row, path = getProjectPath()) {
    return `${path}::${normalize(getTitle(row))}`;
  }

  function findRowByTitles(titles) {
    return getTrackRows().find((row) => titles.includes(normalize(getTitle(row)))) ?? null;
  }

  function isRowVisible(row) {
    return (
      row.isConnected &&
      !row.hasAttribute(COLLAPSED_ROW_ATTRIBUTE) &&
      !row.hasAttribute(FILTERED_ROW_ATTRIBUTE) &&
      !row.hasAttribute(VIEW_HIDDEN_ATTRIBUTE)
    );
  }

  function isHiddenByView(row) {
    return (
      (favoritesOnly && !isFavorite(row)) ||
      (newOnly && !isNew(row)) ||
      (Boolean(tagFilter) && !rowTags(row).includes(tagFilter))
    );
  }

  function getNavigableRows() {
    return getTrackRows().filter(isRowVisible);
  }

  function getRowActions(row) {
    const anchor = row.querySelector(ROW_ACTIONS_ANCHOR);
    const actions = anchor?.parentElement;
    return actions && actions !== row ? actions : null;
  }

  function parseVersion(title) {
    const match = title.match(VERSION_PATTERN);
    if (!match) return { base: normalize(title), version: Number.POSITIVE_INFINITY, tagged: false };
    return { base: normalize(title.slice(0, match.index)), version: Number(match[1]), tagged: true };
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  function getPlayer() {
    const playbar = document.getElementById("playbar");
    if (!playbar) return null;

    const title = playbar.querySelector(".playbar-title span")?.textContent?.trim() ?? "";
    const project = playbar.querySelector(".playbar-subtitle span")?.textContent?.trim() ?? "";
    const href = playbar.querySelector('a[href*="/library/project/"]')?.getAttribute("href") ?? "";
    let path = null;
    try {
      path = getProjectPath(new URL(href, location.origin).pathname);
    } catch {
      path = null;
    }

    const playButton = playbar.querySelector('button[aria-label="Pause"], button[aria-label="Play"]');
    const [position, duration] = (playbar.querySelector(".timestamp")?.textContent ?? "")
      .split("/")
      .map(parseClock);

    return {
      playbar,
      title,
      project,
      path,
      playButton,
      controls: playButton?.parentElement ?? null,
      position: position ?? null,
      duration: duration ?? null,
    };
  }

  function getPlayerTitles(title) {
    const separator = title.indexOf(" - ");
    return [normalize(title), separator >= 0 ? normalize(title.slice(separator + 3)) : ""].filter(Boolean);
  }

  function getSiblingControl(player, direction) {
    let sibling = player.playButton;
    do {
      sibling = direction > 0 ? sibling?.nextElementSibling : sibling?.previousElementSibling;
    } while (sibling && sibling.classList.contains(PLAYER_FAVORITE_CLASS));
    return sibling instanceof HTMLButtonElement ? sibling : null;
  }

  function skipTrack(direction) {
    const player = getPlayer();
    if (!player?.playButton) return;
    getSiblingControl(player, direction)?.click();
  }

  // Seeking is delegated to seek.js, which runs in the page's own world and calls the
  // scrubber's React handlers. Resolves true only if the player actually moved there.
  async function seekPlayer(seconds) {
    if (!document.querySelector("#playbar input[type=range]")) return false;
    dispatchEvent(new CustomEvent("untitled-refined:seek", { detail: seconds }));
    const moved = await waitFor(() => {
      const position = getPlayer()?.position;
      return position !== null && position !== undefined && Math.abs(position - seconds) <= 3;
    }, 2500);
    return Boolean(moved);
  }

  function getPlayingRow() {
    const marked = document.querySelector(`${TRACK_ROW_SELECTOR} .soundbars`)?.closest(TRACK_ROW_SELECTOR);
    if (marked) return marked;

    const player = getPlayer();
    if (!player?.title || player.path !== getProjectPath()) return null;
    return findRowByTitles(getPlayerTitles(player.title));
  }

  // ---------------------------------------------------------------------------
  // Navigation and playback helpers
  // ---------------------------------------------------------------------------

  // React Router listens to popstate, so a pushState + popstate pair navigates in place
  // without a page reload (verified against untitled.stream).
  function navigateTo(path) {
    if (getProjectPath() === path) return;

    const current = history.state;
    const next =
      current && typeof current.idx === "number"
        ? { ...current, idx: current.idx + 1, key: Math.random().toString(36).slice(2, 10) }
        : current;
    history.pushState(next, "", path);
    dispatchEvent(new PopStateEvent("popstate", { state: next }));
  }

  function revealRow(row) {
    if (isHiddenByView(row)) {
      setView({ favoritesOnly: false, newOnly: false, tagFilter: null });
      row.removeAttribute(VIEW_HIDDEN_ATTRIBUTE);
    }
    row.removeAttribute(FILTERED_ROW_ATTRIBUTE);

    if (row.hasAttribute(COLLAPSED_ROW_ATTRIBUTE)) {
      expandedGroups.add(`${getProjectPath()}::${parseVersion(getTitle(row)).base}`);
      row.removeAttribute(COLLAPSED_ROW_ATTRIBUTE);
      scheduleRanking();
    }
  }

  function scrollRowIntoView(row) {
    const rect = row.getBoundingClientRect();
    const far = Math.abs(rect.top - innerHeight / 2) > innerHeight * 2;
    row.scrollIntoView({ block: "center", behavior: canAnimate() && !far ? "smooth" : "auto" });
  }

  function flashRow(row) {
    if (!canAnimate()) return;
    playAnimation(
      row,
      [
        { filter: "brightness(1.6)", transform: "scale(0.99)" },
        { filter: "brightness(1)", transform: "scale(1)" },
      ],
      { duration: 700, easing: EASE_OUT_QUART },
    );
  }

  async function goToTrack(target, { play = false, seekTo = null } = {}) {
    navigateTo(target.path);
    const titles = target.titles?.length ? target.titles : getPlayerTitles(target.label ?? "");
    const row = await waitFor(() => (getProjectPath() === target.path ? findRowByTitles(titles) : null));

    if (!row) {
      toast(`Couldn’t find “${target.label ?? titles[0]}” in that project`);
      return;
    }

    revealRow(row);
    await sleep(60);
    selectTrackRow(row, { scroll: false });
    scrollRowIntoView(row);
    flashRow(row);

    if (!play) return;

    row.querySelector(TRACK_BUTTON_SELECTOR)?.click();
    if (seekTo === null) return;

    const ready = await waitFor(() => {
      const player = getPlayer();
      return player && titles.some((title) => getPlayerTitles(player.title).includes(title)) && player.duration
        ? player
        : null;
    });
    if (!ready) return;
    await sleep(400);
    const moved = await seekPlayer(seekTo);
    if (!moved) toast(`Couldn’t jump automatically. Click the waveform at ${formatClock(seekTo)} to continue.`, { duration: 8000 });
  }

  async function jumpToPlaying() {
    const player = getPlayer();
    if (!player?.title || !player.path) {
      toast("Nothing is playing");
      return;
    }

    if (player.path === getProjectPath()) {
      const row = getPlayingRow();
      if (row) {
        revealRow(row);
        await sleep(60);
        scrollRowIntoView(row);
        selectTrackRow(row, { scroll: false });
        flashRow(row);
        return;
      }
    }

    await goToTrack({ path: player.path, titles: getPlayerTitles(player.title), label: player.title });
  }

  // ---------------------------------------------------------------------------
  // Favorites
  // ---------------------------------------------------------------------------

  // Favorites are { path, titles, label, project, added }: the project path plus one or more
  // normalized titles. The playbar can show "Artist - Title" while a row shows only
  // "Title", so a favorite added from the player keeps both forms and matches either.
  function loadFavorites() {
    const stored = loadJSON(STORAGE.favorites, []);
    if (!Array.isArray(stored)) return [];
    legacyFavorites = new Set(stored.filter((entry) => typeof entry === "string"));
    return stored.filter((entry) => entry && typeof entry.path === "string" && Array.isArray(entry.titles));
  }

  function buildFavoriteIndex() {
    return new Set(favorites.flatMap((entry) => entry.titles.map((title) => `${entry.path}::${title}`)));
  }

  function setFavorites(next, { refresh = true } = {}) {
    favorites = next;
    favoriteIndex = buildFavoriteIndex();
    saveJSON(STORAGE.favorites, [...legacyFavorites, ...favorites]);
    if (refresh) refreshViews();
  }

  function isFavoriteTitle(path, titles) {
    return Boolean(path) && titles.some((title) => title && favoriteIndex.has(`${path}::${title}`));
  }

  function isFavorite(row) {
    return isFavoriteTitle(getProjectPath(), [normalize(getTitle(row))]);
  }

  function countProjectFavorites(path = getProjectPath()) {
    return path ? favorites.filter((entry) => entry.path === path).length : 0;
  }

  function toggleFavoriteTitles(path, titles, meta = {}) {
    const uniqueTitles = [...new Set(titles.filter(Boolean))];
    if (!path || uniqueTitles.length === 0) return false;

    if (isFavoriteTitle(path, uniqueTitles)) {
      const removed = favorites.filter(
        (entry) => entry.path === path && entry.titles.some((title) => uniqueTitles.includes(title)),
      );
      setFavorites(favorites.filter((entry) => !removed.includes(entry)));
      const label = removed[0]?.label ?? meta.label ?? uniqueTitles[0];
      toast(`Removed “${label}” from favorites`, {
        action: "Undo",
        onAction: () => setFavorites([...favorites, ...removed]),
      });
      return false;
    }

    setFavorites([
      ...favorites,
      { path, titles: uniqueTitles, label: meta.label ?? uniqueTitles[0], project: meta.project ?? "", added: Date.now() },
    ]);
    return true;
  }

  function toggleFavorite(row) {
    const added = toggleFavoriteTitles(getProjectPath(), [normalize(getTitle(row))], {
      label: getTitle(row),
      project: getProjectName(),
    });
    if (added) popHeart(row.querySelector(`.${FAVORITE_BUTTON_CLASS}`));
  }

  function togglePlayerFavorite() {
    const player = getPlayer();
    if (!player?.title || !player.path) {
      toast("Nothing is playing");
      return;
    }

    const added = toggleFavoriteTitles(player.path, getPlayerTitles(player.title), {
      label: player.title,
      project: player.project,
    });
    if (added) {
      popHeart(playerButton);
      toast(`Added “${player.title}” to favorites`);
    }
  }

  // Earlier builds stored "path::trackSlug" strings, and entries without a label or project
  // name. Fill those in once the matching row is on screen.
  function upgradeFavorites(rows) {
    const path = getProjectPath();
    if (!path) return;

    let changed = false;
    const next = [...favorites];
    const project = getProjectName();

    rows.forEach((row) => {
      const title = getTitle(row);
      const normalized = normalize(title);

      if (legacyFavorites.size > 0) {
        const legacyKey = `${path}::${row.dataset.trackSlug || normalized}`;
        if (legacyFavorites.has(legacyKey)) {
          legacyFavorites.delete(legacyKey);
          if (!isFavoriteTitle(path, [normalized])) {
            next.push({ path, titles: [normalized], label: title, project, added: Date.now() });
          }
          changed = true;
        }
      }

      const entry = next.find((item) => item.path === path && item.titles.includes(normalized));
      if (entry && (!entry.label || entry.label === normalized || !entry.project)) {
        const index = next.indexOf(entry);
        next[index] = { ...entry, label: title, project: entry.project || project };
        changed = next[index].label !== entry.label || next[index].project !== entry.project || changed;
      }
    });

    if (changed) setFavorites(next);
  }

  // ---------------------------------------------------------------------------
  // Play counts, recently played, and resume
  // ---------------------------------------------------------------------------

  function getPlayCount(row, path = getProjectPath()) {
    return plays[rowKey(row, path)]?.count ?? 0;
  }

  function projectHasPlays(path = getProjectPath()) {
    return Boolean(path) && Object.values(plays).some((entry) => entry.path === path);
  }

  let playKeyCache = { signature: null, value: null };

  function playKeyFor(player) {
    const signature = `${player.path}|${player.title}|${getProjectPath()}|${getTrackRows().length}`;
    if (playKeyCache.signature === signature) return playKeyCache.value;
    playKeyCache = { signature, value: computePlayKey(player) };
    return playKeyCache.value;
  }

  function computePlayKey(player) {
    const titles = getPlayerTitles(player.title);
    if (player.path === getProjectPath()) {
      const row = findRowByTitles(titles);
      if (row) return { key: rowKey(row, player.path), label: getTitle(row), titles };
    }
    return { key: `${player.path}::${titles[0]}`, label: player.title, titles };
  }

  function recordPlay(info) {
    const previous = plays[info.key];
    plays[info.key] = {
      path: info.path,
      titles: info.titles,
      label: info.label,
      project: info.project,
      count: (previous?.count ?? 0) + 1,
      last: Date.now(),
    };

    const keys = Object.keys(plays);
    if (keys.length > MAX_PLAY_ENTRIES) {
      keys
        .sort((left, right) => plays[left].last - plays[right].last)
        .slice(0, keys.length - MAX_PLAY_ENTRIES)
        .forEach((key) => delete plays[key]);
    }

    saveJSON(STORAGE.plays, plays);
    if (info.path === getProjectPath()) refreshViews();
    else if (panel) renderPanel();
  }

  // Called on every playbar change (the timestamp ticks once per second). A play counts
  // after 30 seconds of actual listening, or half the track if it is shorter.
  function trackPlayback(player) {
    if (!player?.title || !player.path || player.position === null) return;

    const identity = playKeyFor(player);
    if (!playback || playback.key !== identity.key) {
      flushListening();
      const previous = playback;
      playback = {
        ...identity,
        path: player.path,
        project: player.project,
        last: player.position,
        listened: 0,
        counted: false,
        nearEnd: false,
      };
      handleTrackChange(previous, identity, player);
    }

    const delta = player.position - playback.last;
    if (delta > 0 && delta <= 3) {
      playback.listened += delta;
      pendingListen += delta;
    }
    if (delta < -5 && player.position < 3) {
      playback.listened = 0;
      playback.counted = false;
    }
    playback.last = player.position;
    playback.nearEnd = Boolean(player.duration && player.position >= player.duration - 3);

    const threshold = player.duration ? Math.min(PLAY_COUNT_SECONDS, player.duration / 2) : PLAY_COUNT_SECONDS;
    if (!playback.counted && playback.listened >= threshold) {
      playback.counted = true;
      recordPlay(playback);
    }

    if (delta > 0) {
      hideResumePrompt();
      saveResumePoint(player, identity);
      checkSleepTimer(player);
      checkLoop(player, identity);
      checkQueueEnd(player, identity);
      if (Date.now() - lastListenFlush > 30000) flushListening();
    }
  }

  function saveResumePoint(player, identity) {
    const nearEnd = player.duration && player.position >= player.duration - RESUME_MIN_SECONDS;
    if (nearEnd) {
      removeStored(STORAGE.resume);
      lastResumeSave = { key: identity.key, position: player.position };
      return;
    }

    if (lastResumeSave.key === identity.key && Math.abs(player.position - lastResumeSave.position) < 5) return;
    lastResumeSave = { key: identity.key, position: player.position };
    saveJSON(STORAGE.resume, {
      path: player.path,
      titles: identity.titles,
      label: identity.label,
      project: player.project,
      position: player.position,
      duration: player.duration,
      at: Date.now(),
    });
  }

  function maybeOfferResume() {
    if (resumePromptShown) return;
    resumePromptShown = true;
    if (!settings.resumePrompt) return;

    const player = getPlayer();
    if (player?.title) return;

    const saved = loadJSON(STORAGE.resume, null);
    if (!saved?.path || !saved.position || Date.now() - saved.at > RESUME_MAX_AGE_MS) return;
    if (saved.position < RESUME_MIN_SECONDS) return;

    toast(`Resume “${saved.label}” at ${formatClock(saved.position)}`, {
      action: "Resume",
      duration: 15000,
      kind: "resume",
      onAction: () => goToTrack(saved, { play: true, seekTo: saved.position }),
    });
  }

  function hideResumePrompt() {
    if (toastElement?.dataset.kind === "resume") hideToast();
  }

  // ---------------------------------------------------------------------------
  // Track metadata: tags, notes, and "new since last visit"
  // ---------------------------------------------------------------------------

  function trackId(row) {
    return row.dataset.projectTrackId || rowKey(row);
  }

  function cleanTag(text) {
    return String(text ?? "")
      .trim()
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9 _-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 30);
  }

  function parseTagInput(text) {
    return [...new Set(String(text ?? "").split(/[,\n]/).map(cleanTag).filter(Boolean))];
  }

  function rowTags(row) {
    return tags[rowKey(row)] ?? [];
  }

  function allTags() {
    const counts = new Map();
    Object.values(tags).forEach((list) => list.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return new Map([...counts.entries()].sort((left, right) => right[1] - left[1]));
  }

  function setTrackMeta(key, tagList, note) {
    if (tagList.length > 0) tags[key] = tagList;
    else delete tags[key];
    if (note) notes[key] = note;
    else delete notes[key];
    saveJSON(STORAGE.tags, tags);
    saveJSON(STORAGE.notes, notes);
    if (tagFilter && !Object.values(tags).some((list) => list.includes(tagFilter))) tagFilter = null;
    refreshViews();
  }

  // The first time a project renders in this page session, remember which tracks were
  // already known; anything else is "new since your last visit" for the whole session.
  function recordVisit(path, rows) {
    if (!path || rows.length === 0) return;

    const previous = projects[path];
    if (!visitSnapshots.has(path)) {
      visitSnapshots.set(path, { hadHistory: Boolean(previous?.seen?.length), seen: new Set(previous?.seen ?? []) });
    }

    const ids = rows.map(trackId);
    const signature = `${ids.length}:${getProjectName()}`;
    if (previous?.signature === signature) return;

    projects[path] = {
      name: getProjectName() || previous?.name || "",
      tracks: rows.map(getTitle),
      seen: [...new Set([...(previous?.seen ?? []), ...ids])],
      lastVisit: Date.now(),
      signature,
    };
    saveJSON(STORAGE.projects, projects);
  }

  function isNew(row) {
    if (!settings.showNew) return false;
    const snapshot = visitSnapshots.get(getProjectPath());
    return Boolean(snapshot?.hadHistory && !snapshot.seen.has(trackId(row)));
  }

  function editTarget() {
    if (selectedRow?.isConnected && getProjectPath()) {
      return { key: rowKey(selectedRow), label: getTitle(selectedRow) };
    }
    const player = getPlayer();
    if (player?.title && player.path) {
      const identity = playKeyFor(player);
      return { key: identity.key, label: identity.label };
    }
    return null;
  }

  function closeEditor() {
    editor?.remove();
    editor = null;
  }

  function openEditor(target) {
    if (!target) {
      toast("Select a track (J/K) or play one first");
      return;
    }
    closeEditor();

    const tagInput = el("input", {
      type: "text",
      className: `${EDITOR_CLASS}-input`,
      placeholder: "gym, best, demo",
      "aria-label": "Tags, separated by commas",
    });
    tagInput.value = (tags[target.key] ?? []).join(", ");

    const noteInput = el("textarea", {
      className: `${EDITOR_CLASS}-input`,
      rows: 3,
      placeholder: "Add a note…",
      "aria-label": "Note",
    });
    noteInput.value = notes[target.key] ?? "";

    const save = () => {
      setTrackMeta(target.key, parseTagInput(tagInput.value), noteInput.value.trim());
      closeEditor();
      toast(`Saved “${target.label}”`);
    };

    const suggestions = [...allTags().keys()].slice(0, 12).map((tag) =>
      el(
        "button",
        {
          type: "button",
          className: `${EDITOR_CLASS}-chip`,
          onClick: () => {
            const current = parseTagInput(tagInput.value);
            const next = current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag];
            tagInput.value = next.join(", ");
            tagInput.focus();
          },
        },
        `#${tag}`,
      ),
    );

    editor = el(
      "div",
      {
        className: `${EDITOR_CLASS} bg-playbar backdrop-blur-2xl shadow-2xl`,
        role: "dialog",
        "aria-label": `Edit ${target.label}`,
        [CONTROL_ATTRIBUTE]: true,
      },
      el("h3", { className: `${EDITOR_CLASS}-title` }, target.label),
      el("label", { className: `${EDITOR_CLASS}-label` }, "Tags", tagInput),
      suggestions.length > 0 && el("div", { className: `${EDITOR_CLASS}-chips` }, suggestions),
      el("label", { className: `${EDITOR_CLASS}-label` }, "Note", noteInput),
      el(
        "div",
        { className: `${EDITOR_CLASS}-actions` },
        el("span", { className: `${EDITOR_CLASS}-hint` }, "Enter saves tags · Ctrl+Enter saves"),
        el("button", { type: "button", className: `${EDITOR_CLASS}-button`, onClick: closeEditor }, "Cancel"),
        el("button", { type: "button", className: `${EDITOR_CLASS}-button ${EDITOR_CLASS}-primary`, onClick: save }, "Save"),
      ),
    );

    // Keep typing (Space, arrows) away from Untitled's own player shortcuts.
    editor.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditor();
      } else if (event.key === "Enter" && (event.target === tagInput || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
      }
    });

    document.body.append(editor);
    tagInput.focus();
  }

  // ---------------------------------------------------------------------------
  // Queue, sleep timer, loop, and version compare
  // ---------------------------------------------------------------------------

  function pausePlayback() {
    const player = getPlayer();
    if (player?.playButton?.getAttribute("aria-label") === "Pause") player.playButton.click();
  }

  function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function startQueue({ shuffle = false } = {}) {
    if (favorites.length === 0) {
      toast("Add some favorites first");
      return;
    }

    const ordered = [...favorites].sort(
      (left, right) =>
        (left.project || "").localeCompare(right.project || "") || (left.added ?? 0) - (right.added ?? 0),
    );
    queue = { items: shuffle ? shuffled(ordered) : ordered, index: -1, shuffle, expecting: null };
    toast(`Playing ${queue.items.length} favorite${queue.items.length === 1 ? "" : "s"}${shuffle ? ", shuffled" : ""}`);
    advanceQueue(1);
  }

  function stopQueue(message) {
    if (!queue) return;
    queue = null;
    if (message) toast(message);
    if (panel) renderPanel();
  }

  function advanceQueue(step) {
    if (!queue) return;

    const nextIndex = Math.max(0, queue.index + step);
    if (nextIndex >= queue.items.length) {
      stopQueue("Finished playing your favorites");
      return;
    }

    queue.index = nextIndex;
    const entry = queue.items[nextIndex];
    queue.expecting = { path: entry.path, titles: entry.titles, since: Date.now() };
    goToTrack(entry, { play: true });
    if (panel) renderPanel();
  }

  function isQueueTrack(identity) {
    const entry = queue?.items[queue.index];
    return Boolean(entry && entry.path === playback?.path && entry.titles.some((title) => identity.titles.includes(title)));
  }

  // Runs when the playing track changes. Our own queue navigation is expected; a change
  // right at the end of a track is Untitled auto-advancing; anything else is the user
  // choosing another track, which ends the queue.
  function handleTrackChange(previous, identity, player) {
    if (loop && loop.key !== identity.key) loop = null;

    if (sleepTimer?.endOfTrack && previous && sleepTimer.endOfTrack === previous.key) {
      sleepTimer = null;
      pausePlayback();
      toast("Sleep timer: paused after the track ended");
    }

    if (!queue || !previous) return;

    if (queue.expecting) {
      const arrived =
        queue.expecting.path === player.path && identity.titles.some((title) => queue.expecting.titles.includes(title));
      if (arrived || Date.now() - queue.expecting.since > 20000) queue.expecting = null;
      return;
    }

    if (previous.nearEnd) advanceQueue(1);
    else stopQueue("Queue stopped because another track started");
  }

  function checkQueueEnd(player, identity) {
    if (!queue || queue.expecting || !player.duration) return;
    if (player.position >= player.duration - 1 && isQueueTrack(identity)) advanceQueue(1);
  }

  function setSleepTimer(option) {
    if (option === null) {
      sleepTimer = null;
      toast("Sleep timer off");
    } else if (option === "end") {
      const player = getPlayer();
      if (!player?.title) {
        toast("Nothing is playing");
        return;
      }
      sleepTimer = { endOfTrack: playKeyFor(player).key };
      toast("Pausing when this track ends");
    } else {
      sleepTimer = { until: Date.now() + option * 60000, minutes: option };
      toast(`Pausing in ${option} minutes`);
    }
    if (panel) renderPanel();
  }

  function checkSleepTimer(player) {
    if (!sleepTimer) return;
    const ended = sleepTimer.endOfTrack && player.duration && player.position >= player.duration - 1;
    const expired = sleepTimer.until && Date.now() >= sleepTimer.until;
    if (!ended && !expired) return;
    sleepTimer = null;
    pausePlayback();
    toast("Sleep timer: paused playback");
    if (panel) renderPanel();
  }

  function setLoopPoint(which) {
    const player = getPlayer();
    if (!player?.title || player.position === null) {
      toast("Nothing is playing");
      return;
    }

    const key = playKeyFor(player).key;
    if (which === "clear") {
      loop = null;
      toast("Loop off");
    } else if (which === "start") {
      loop = { key, start: player.position, end: null, seeking: false };
      toast(`Loop starts at ${formatClock(player.position)}. Press ] where it should end`);
    } else if (!loop || loop.key !== key) {
      toast("Press [ first to set where the loop starts");
    } else if (player.position <= loop.start + 1) {
      toast("The loop end must be after its start");
    } else {
      loop.end = player.position;
      toast(`Looping ${formatClock(loop.start)}–${formatClock(loop.end)} · press \\ to stop`);
    }
  }

  function checkLoop(player, identity) {
    if (!loop?.end || loop.seeking || loop.key !== identity.key || player.position < loop.end) return;

    loop.seeking = true;
    seekPlayer(loop.start).then((moved) => {
      if (!loop) return;
      loop.seeking = false;
      if (!moved) {
        loop = null;
        toast("Couldn’t loop: jumping back in the track isn’t working");
      }
    });
  }

  // A/B compare: switch to the next version of the same song at the same position.
  function switchVersion() {
    const player = getPlayer();
    if (!player?.title || !player.path) {
      toast("Nothing is playing");
      return;
    }
    if (player.path !== getProjectPath()) {
      toast("Open the song’s project to compare its versions");
      return;
    }

    const current = findRowByTitles(getPlayerTitles(player.title));
    const base = parseVersion(current ? getTitle(current) : player.title).base;
    const versions = getTrackRows()
      .filter((row) => parseVersion(getTitle(row)).base === base)
      .sort((left, right) => getOriginalOrder(left) - getOriginalOrder(right));

    if (versions.length < 2 || !current) {
      toast("This song has no other versions here");
      return;
    }

    const next = versions[(versions.indexOf(current) + 1) % versions.length];
    const position = player.position ?? 0;
    toast(`Switching to “${getTitle(next)}”${position > 2 ? ` at ${formatClock(position)}` : ""}`);
    goToTrack(
      { path: player.path, titles: [normalize(getTitle(next))], label: getTitle(next) },
      { play: true, seekTo: position > 2 ? position : null },
    );
  }

  function flushListening() {
    if (pendingListen <= 0 || !playback) return;

    stats.seconds = (stats.seconds ?? 0) + pendingListen;
    stats.byProject = stats.byProject ?? {};
    stats.byProject[playback.path] = (stats.byProject[playback.path] ?? 0) + pendingListen;
    saveJSON(STORAGE.stats, stats);

    if (plays[playback.key]) {
      plays[playback.key].seconds = (plays[playback.key].seconds ?? 0) + pendingListen;
      saveJSON(STORAGE.plays, plays);
    }

    pendingListen = 0;
    lastListenFlush = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  function updateSettings(patch) {
    settings = { ...settings, ...patch };
    saveJSON(STORAGE.settings, settings);
    scheduleRanking();
  }

  // ---------------------------------------------------------------------------
  // Row decoration
  // ---------------------------------------------------------------------------

  function decorateRow(row) {
    if (row.querySelector(`.${FAVORITE_BUTTON_CLASS}`)) return false;

    const heart = controlButton(FAVORITE_BUTTON_CLASS, {
      html: ICONS.heart,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(row);
      },
    });
    const edit = controlButton(EDIT_CLASS, {
      html: ICONS.pencil,
      title: "Tags and note (E)",
      "aria-label": `Edit tags and note for ${getTitle(row)}`,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor({ key: rowKey(row), label: getTitle(row) });
      },
    });
    const newBadge = el("span", { className: NEW_CLASS, [CONTROL_ATTRIBUTE]: true, hidden: true, title: "Added since your last visit" }, "New");
    const playsBadge = el("span", { className: PLAYS_CLASS, [CONTROL_ATTRIBUTE]: true, hidden: true });
    const versionsBadge = controlButton(VERSIONS_CLASS, {
      hidden: true,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = versionsBadge.dataset.group;
        if (!key) return;
        if (expandedGroups.has(key)) expandedGroups.delete(key);
        else expandedGroups.add(key);
        scheduleRanking();
      },
    });

    const actions = getRowActions(row);
    if (actions) {
      heart.classList.add(FAVORITE_INLINE_CLASS);
      edit.classList.add(FAVORITE_INLINE_CLASS);
      actions.prepend(newBadge, versionsBadge, playsBadge, edit, heart);
    } else {
      row.append(newBadge, versionsBadge, playsBadge, edit, heart);
    }

    // Tags and note show under the title; display only (the title area is the play button).
    const titleColumn = row.querySelector("h3")?.parentElement;
    if (titleColumn) titleColumn.append(el("div", { className: META_CLASS, [CONTROL_ATTRIBUTE]: true, hidden: true }));
    return true;
  }

  function renderRow(row) {
    const favorite = isFavorite(row);
    setAttributeFlag(row, FAVORITE_ROW_ATTRIBUTE, favorite);

    const heart = row.querySelector(`.${FAVORITE_BUTTON_CLASS}`);
    if (heart) describeFavorite(heart, favorite, getTitle(row));

    const newBadge = row.querySelector(`.${NEW_CLASS}`);
    if (newBadge) newBadge.hidden = !isNew(row);

    const playsBadge = row.querySelector(`.${PLAYS_CLASS}`);
    if (playsBadge) {
      const count = getPlayCount(row);
      playsBadge.hidden = count === 0 || !settings.showPlays;
      const text = String(count);
      if (playsBadge.dataset.count !== text) {
        playsBadge.dataset.count = text;
        playsBadge.innerHTML = `${ICONS.play}<span>${text}</span>`;
        playsBadge.title = `Played ${count} time${count === 1 ? "" : "s"}`;
      }
    }

    const meta = row.querySelector(`.${META_CLASS}`);
    if (meta) {
      const key = rowKey(row);
      const tagList = tags[key] ?? [];
      const note = notes[key] ?? "";
      const signature = `${tagList.join(",")}|${note}`;
      if (meta.dataset.signature !== signature) {
        meta.dataset.signature = signature;
        meta.replaceChildren(
          ...tagList.map((tag) => el("span", { className: `${META_CLASS}-tag` }, `#${tag}`)),
          note ? el("span", { className: `${META_CLASS}-note`, title: note, html: ICONS.note }) : "",
          note ? el("span", { className: `${META_CLASS}-note-text`, title: note }, note) : "",
        );
      }
      meta.hidden = tagList.length === 0 && !note;
    }
  }

  function decorateRows() {
    const rows = getTrackRows();
    let added = false;
    rows.forEach((row) => {
      if (decorateRow(row)) {
        added = true;
        renderRow(row);
      }
    });
    if (added) upgradeFavorites(rows);
  }

  function refreshViews() {
    getTrackRows().forEach(renderRow);
    if (favoritesOnly && countProjectFavorites() === 0) favoritesOnly = false;
    syncPlayer();
    if (panel) renderPanel();
    scheduleRanking();
  }

  function describeFavorite(button, favorite, title) {
    button.setAttribute("aria-pressed", String(favorite));
    button.setAttribute(
      "aria-label",
      `${favorite ? "Remove" : "Add"} ${title || "track"} ${favorite ? "from" : "to"} favorites`,
    );
    button.title = favorite ? "Remove from favorites" : "Add to favorites";
  }

  function popHeart(button) {
    if (!button || !canAnimate()) return;
    playAnimation(
      button,
      [
        { transform: "scale(0.7)" },
        { transform: "scale(1.18)", offset: 0.55 },
        { transform: "scale(1)" },
      ],
      { duration: 280, easing: EASE_OUT_QUART },
    );
  }

  // ---------------------------------------------------------------------------
  // Toolbar above the track list
  // ---------------------------------------------------------------------------

  function setView(patch) {
    if ("favoritesOnly" in patch) favoritesOnly = patch.favoritesOnly;
    if ("newOnly" in patch) newOnly = patch.newOnly;
    if ("tagFilter" in patch) tagFilter = patch.tagFilter;
    viewPath = favoritesOnly || newOnly || tagFilter ? getProjectPath() : null;
    scheduleRanking();
  }

  function setFavoritesOnly(enabled) {
    setView({ favoritesOnly: enabled });
  }

  function pill(id, { icon, label, pressed, title, onClick }) {
    let button = toolbar.querySelector(`[data-pill="${id}"]`);
    if (!button) {
      button = controlButton(PILL_CLASS, { "data-pill": id, onClick });
      toolbar.append(button);
    }
    const signature = `${icon}|${label}`;
    if (button.dataset.signature !== signature) {
      button.dataset.signature = signature;
      button.innerHTML = `${ICONS[icon]}<span></span>`;
      button.querySelector("span").textContent = label;
    }
    button.setAttribute("aria-pressed", String(Boolean(pressed)));
    button.title = title;
    return button;
  }

  function renderToolbar(list, { query, resultCount, rows }) {
    const favoriteCount = countProjectFavorites();
    const hasPlays = projectHasPlays();
    const newCount = settings.showNew ? rows.filter(isNew).length : 0;
    const tagCounts = new Map();
    rows.forEach((row) => rowTags(row).forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)));
    const show =
      Boolean(list) && (favoriteCount > 0 || groupsAvailable || hasPlays || query || newCount > 0 || tagCounts.size > 0 || newOnly);

    if (!show) {
      toolbar?.remove();
      return;
    }

    if (!toolbar) toolbar = el("div", { className: TOOLBAR_CLASS, [CONTROL_ATTRIBUTE]: true });

    const wanted = new Set();
    if (favoriteCount > 0) {
      wanted.add("favorites");
      pill("favorites", {
        icon: "heart",
        label: `Favorites only · ${favoriteCount}`,
        pressed: favoritesOnly,
        title: favoritesOnly ? "Show all tracks" : "Show only favorite tracks",
        onClick: () => setFavoritesOnly(!favoritesOnly),
      });
    }
    if (newCount > 0 || newOnly) {
      wanted.add("new");
      pill("new", {
        icon: "sparkle",
        label: `New · ${newCount}`,
        pressed: newOnly,
        title: newOnly ? "Show all tracks" : "Show only tracks added since your last visit",
        onClick: () => setView({ newOnly: !newOnly }),
      });
    }
    [...tagCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .forEach(([tag, count]) => {
        const id = `tag-${tag}`;
        wanted.add(id);
        pill(id, {
          icon: "tag",
          label: `#${tag} · ${count}`,
          pressed: tagFilter === tag,
          title: tagFilter === tag ? "Show all tracks" : `Show only tracks tagged #${tag}`,
          onClick: () => setView({ tagFilter: tagFilter === tag ? null : tag }),
        });
      });
    if (groupsAvailable && !query) {
      wanted.add("versions");
      pill("versions", {
        icon: "layers",
        label: "Group versions",
        pressed: settings.groupVersions,
        title: "Show only the newest version of each song",
        onClick: () => updateSettings({ groupVersions: !settings.groupVersions }),
      });
    }
    if (hasPlays && !query) {
      wanted.add("plays");
      pill("plays", {
        icon: "chart",
        label: "Most played",
        pressed: settings.sortByPlays,
        title: "Sort by how often you have played each track",
        onClick: () => updateSettings({ sortByPlays: !settings.sortByPlays }),
      });
    }

    let count = toolbar.querySelector(`.${PREFIX}-count`);
    if (query) {
      wanted.add("count");
      if (!count) {
        count = el("span", { className: `${PREFIX}-count`, "data-pill": "count", "aria-live": "polite" });
        toolbar.append(count);
      }
      const text = `${resultCount} result${resultCount === 1 ? "" : "s"}`;
      if (count.textContent !== text) count.textContent = text;
    }

    toolbar.querySelectorAll("[data-pill]").forEach((child) => {
      if (!wanted.has(child.dataset.pill)) child.remove();
    });

    if (toolbar.nextElementSibling !== list) list.before(toolbar);
  }

  // ---------------------------------------------------------------------------
  // Global favorites / recent panel
  // ---------------------------------------------------------------------------

  function ensureLauncher() {
    if (!document.body) return;
    if (!launcher) {
      launcher = controlButton(`${LAUNCHER_CLASS} bg-playbar backdrop-blur-2xl shadow-2xl`, {
        html: ICONS.heart,
        "aria-label": "Untitled Refined: favorites, recent, search, stats (Shift+F)",
        title: "Favorites, recent, search, stats (Shift+F)",
        onClick: (event) => {
          event.stopPropagation();
          togglePanel();
        },
      });
    }
    if (!launcher.isConnected) document.body.append(launcher);
    if (panel && !panel.isConnected) document.body.append(panel);
    if (editor && !editor.isConnected) document.body.append(editor);
    launcher.setAttribute("aria-expanded", String(Boolean(panel)));
    launcher.classList.toggle(`${LAUNCHER_CLASS}-busy`, Boolean(queue || sleepTimer || loop?.end));
  }

  function togglePanel(force, tab) {
    const open = force ?? !panel;
    if (!open) {
      panel?.remove();
      panel = null;
      ensureLauncher();
      return;
    }

    if (tab) panelTab = tab;
    if (panel) {
      renderPanel();
      return;
    }

    panel = el("div", {
      className: `${PANEL_CLASS} bg-playbar backdrop-blur-2xl shadow-2xl`,
      role: "dialog",
      "aria-label": "Untitled Refined",
      [CONTROL_ATTRIBUTE]: true,
    });
    // Keep typing in the panel away from Untitled's own player shortcuts.
    panel.addEventListener("keydown", (event) => {
      if (isEditableTarget(event.target)) event.stopPropagation();
      if (event.key === "Escape") togglePanel(false);
    });
    document.body.append(panel);
    renderPanel();
    ensureLauncher();

    if (canAnimate()) {
      panel.animate(
        [
          { opacity: 0, transform: "translateY(8px) scale(0.98)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 200, easing: EASE_OUT_EXPO },
      );
    }
  }

  function trackItem({ label, detail, onPlay, onRemove }) {
    return el(
      "li",
      { className: `${PANEL_CLASS}-item` },
      el(
        "button",
        { type: "button", className: `${PANEL_CLASS}-play`, title: `Play ${label}`, onClick: onPlay },
        el("span", { className: `${PANEL_CLASS}-label` }, label),
        el("span", { className: `${PANEL_CLASS}-detail` }, detail),
      ),
      onRemove &&
        el(
          "button",
          {
            type: "button",
            className: `${PANEL_CLASS}-remove`,
            title: "Remove from favorites",
            "aria-label": `Remove ${label} from favorites`,
            onClick: onRemove,
          },
          "×",
        ),
    );
  }

  function playFromPanel(target) {
    togglePanel(false);
    goToTrack(target, { play: true });
  }

  function panelButton(label, onClick, { title, pressed, primary } = {}) {
    return el(
      "button",
      {
        type: "button",
        className: `${PANEL_CLASS}-action${primary ? ` ${PANEL_CLASS}-primary` : ""}`,
        title,
        "aria-pressed": pressed === undefined ? undefined : String(Boolean(pressed)),
        onClick,
      },
      label,
    );
  }

  function formatDuration(seconds) {
    const minutes = Math.round((seconds ?? 0) / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  function renderFavoritesTab() {
    if (favorites.length === 0) {
      return el("p", { className: `${PANEL_CLASS}-empty` }, "No favorites yet. Tap the heart on a track or in the player.");
    }

    const controls = queue
      ? el(
          "div",
          { className: `${PANEL_CLASS}-bar` },
          el("span", {}, `Playing ${queue.index + 1} of ${queue.items.length}${queue.shuffle ? " · shuffled" : ""}`),
          panelButton("Previous", () => advanceQueue(-1)),
          panelButton("Next", () => advanceQueue(1)),
          panelButton("Stop", () => stopQueue()),
        )
      : el(
          "div",
          { className: `${PANEL_CLASS}-bar` },
          panelButton("▶ Play all", () => startQueue(), { primary: true }),
          panelButton("Shuffle", () => startQueue({ shuffle: true })),
        );

    const current = queue?.items[queue.index];
    const byProject = new Map();
    [...favorites]
      .sort((left, right) => (right.added ?? 0) - (left.added ?? 0))
      .forEach((entry) => {
        const name = entry.project || "Unknown project";
        if (!byProject.has(name)) byProject.set(name, []);
        byProject.get(name).push(entry);
      });

    return el(
      "div",
      {},
      controls,
      [...byProject.entries()].map(([project, entries]) =>
        el(
          "section",
          {},
          el("h4", { className: `${PANEL_CLASS}-group` }, project),
          el(
            "ul",
            {},
            entries.map((entry) => {
              const play = plays[`${entry.path}::${entry.titles[0]}`];
              const item = trackItem({
                label: entry.label || entry.titles[0],
                detail: play?.count ? `${play.count} play${play.count === 1 ? "" : "s"}` : "",
                onPlay: () => playFromPanel(entry),
                onRemove: () => toggleFavoriteTitles(entry.path, entry.titles, entry),
              });
              if (entry === current) item.classList.add(`${PANEL_CLASS}-current`);
              return item;
            }),
          ),
        ),
      ),
    );
  }

  function renderRecentTab() {
    const recent = Object.values(plays)
      .sort((left, right) => right.last - left.last)
      .slice(0, 25);

    if (recent.length === 0) {
      return el("p", { className: `${PANEL_CLASS}-empty` }, "Tracks you listen to for 30 seconds or more show up here.");
    }

    return el(
      "ul",
      {},
      recent.map((entry) =>
        trackItem({
          label: entry.label,
          detail: `${entry.project ? `${entry.project} · ` : ""}${entry.count}× · ${timeAgo(entry.last)}`,
          onPlay: () => playFromPanel(entry),
        }),
      ),
    );
  }

  // Searches every project you've opened (titles are remembered per project), plus tags
  // and notes when the query starts with # or matches a note.
  function searchEverywhere(query) {
    const normalizedQuery = normalize(query);
    const tagQuery = query.trim().startsWith("#") ? cleanTag(query) : null;
    const results = [];

    Object.entries(projects).forEach(([path, project]) => {
      (project.tracks ?? []).forEach((title) => {
        const key = `${path}::${normalize(title)}`;
        let value;
        if (tagQuery) {
          if (!(tags[key] ?? []).some((tag) => tag.startsWith(tagQuery))) return;
          value = 0;
        } else {
          value = score(title, query);
          const note = notes[key];
          if (value >= 600 && note && normalize(note).includes(normalizedQuery)) value = 500;
          if (value >= 600) return;
        }
        results.push({ path, title, project: project.name, value, key });
      });
    });

    return results.sort((left, right) => left.value - right.value || left.title.localeCompare(right.title)).slice(0, 40);
  }

  function renderSearchTab() {
    const input = el("input", {
      type: "search",
      className: `${PANEL_CLASS}-search`,
      placeholder: "Search every project you’ve opened…",
      "aria-label": "Search all projects",
    });
    input.value = panelSearchQuery;
    const results = el("div", { className: `${PANEL_CLASS}-results` });

    const update = () => {
      panelSearchQuery = input.value;
      const query = input.value.trim();
      if (!query) {
        const count = Object.values(projects).reduce((total, project) => total + (project.tracks?.length ?? 0), 0);
        results.replaceChildren(
          el(
            "p",
            { className: `${PANEL_CLASS}-empty` },
            count
              ? `Searching ${count} tracks across ${Object.keys(projects).length} project${Object.keys(projects).length === 1 ? "" : "s"} you’ve opened. Use #tag to search your tags.`
              : "Open a project and its tracks become searchable here.",
          ),
        );
        return;
      }
      const found = searchEverywhere(query);
      results.replaceChildren(
        found.length === 0
          ? el("p", { className: `${PANEL_CLASS}-empty` }, "No matches")
          : el(
              "ul",
              {},
              found.map((result) =>
                trackItem({
                  label: result.title,
                  detail: [result.project, ...(tags[result.key] ?? []).map((tag) => `#${tag}`)].filter(Boolean).join(" · "),
                  onPlay: () => playFromPanel({ path: result.path, titles: [normalize(result.title)], label: result.title }),
                }),
              ),
            ),
      );
    };

    input.addEventListener("input", update);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") results.querySelector(`.${PANEL_CLASS}-play`)?.click();
    });
    update();
    return el("div", {}, input, results);
  }

  function renderStatsTab() {
    const entries = Object.values(plays);
    if (entries.length === 0) {
      return el("p", { className: `${PANEL_CLASS}-empty` }, "Listen to a few tracks and your stats show up here.");
    }

    const totalPlays = entries.reduce((total, entry) => total + entry.count, 0);
    const topTracks = [...entries].sort((left, right) => right.count - left.count).slice(0, 10);
    const byProject = new Map();
    entries.forEach((entry) => {
      const name = entry.project || "Unknown project";
      byProject.set(name, (byProject.get(name) ?? 0) + entry.count);
    });
    const topProjects = [...byProject.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
    const max = topTracks[0]?.count ?? 1;

    const figure = (value, label) =>
      el("div", { className: `${PANEL_CLASS}-figure` }, el("strong", {}, value), el("span", {}, label));

    return el(
      "div",
      {},
      el(
        "div",
        { className: `${PANEL_CLASS}-figures` },
        figure(String(totalPlays), "plays"),
        figure(formatDuration(stats.seconds), "listened"),
        figure(String(entries.length), "tracks"),
      ),
      el("h4", { className: `${PANEL_CLASS}-group` }, "Top tracks"),
      el(
        "ul",
        {},
        topTracks.map((entry) => {
          const item = trackItem({
            label: entry.label,
            detail: `${entry.count}×${entry.seconds ? ` · ${formatDuration(entry.seconds)}` : ""}${entry.project ? ` · ${entry.project}` : ""}`,
            onPlay: () => playFromPanel(entry),
          });
          item.style.setProperty("--bar", `${Math.round((entry.count / max) * 100)}%`);
          item.classList.add(`${PANEL_CLASS}-ranked`);
          return item;
        }),
      ),
      el("h4", { className: `${PANEL_CLASS}-group` }, "Top projects"),
      el(
        "ul",
        { className: `${PANEL_CLASS}-plain` },
        topProjects.map(([name, count]) =>
          el("li", {}, el("span", {}, name), el("span", { className: `${PANEL_CLASS}-detail` }, `${count} plays`)),
        ),
      ),
    );
  }

  const SHORTCUTS = [
    ["L", "Favorite the playing track"],
    ["Shift+N / Shift+P", "Next / previous (in the queue when one is playing)"],
    ["J / K, Enter", "Move through the list, play"],
    [".", "Jump to the playing track"],
    ["E", "Tags and note for the selected or playing track"],
    ["V", "Switch to the next version at the same spot"],
    ["[  ]  \\", "Loop start, loop end, stop looping"],
    ["Shift+F", "Open this panel"],
    ["?", "Show these shortcuts"],
    ["Space, ←/→, ↑/↓", "Untitled’s own: play/pause, skip 10s, volume"],
  ];

  function renderMoreTab() {
    let sleepStatus = "Off";
    if (sleepTimer?.until) sleepStatus = `Pausing in ${Math.max(1, Math.ceil((sleepTimer.until - Date.now()) / 60000))} min`;
    if (sleepTimer?.endOfTrack) sleepStatus = "Pausing when this track ends";

    const toggle = (key, label, detail) => {
      const input = el("input", { type: "checkbox" });
      input.checked = Boolean(settings[key]);
      input.addEventListener("change", () => {
        settings = { ...settings, [key]: input.checked };
        saveJSON(STORAGE.settings, settings);
        refreshViews();
      });
      return el(
        "label",
        { className: `${PANEL_CLASS}-setting` },
        input,
        el("span", {}, el("strong", {}, label), el("small", {}, detail)),
      );
    };

    return el(
      "div",
      {},
      el("h4", { className: `${PANEL_CLASS}-group` }, `Sleep timer · ${sleepStatus}`),
      el(
        "div",
        { className: `${PANEL_CLASS}-bar` },
        [15, 30, 60].map((minutes) =>
          panelButton(`${minutes} min`, () => setSleepTimer(minutes), { pressed: sleepTimer?.minutes === minutes }),
        ),
        panelButton("End of track", () => setSleepTimer("end"), { pressed: Boolean(sleepTimer?.endOfTrack) }),
        sleepTimer && panelButton("Off", () => setSleepTimer(null)),
      ),
      el("h4", { className: `${PANEL_CLASS}-group` }, "Settings"),
      toggle("resumePrompt", "Offer to resume", "After a reload, continue the last track"),
      toggle("shortcuts", "Keyboard shortcuts", "L, J/K, E, V, [ ] and the rest"),
      toggle("showPlays", "Play counts on tracks", "The small ▶ number on each row"),
      toggle("showNew", "Mark new tracks", "“New” on tracks added since your last visit"),
      el("h4", { className: `${PANEL_CLASS}-group` }, "Your data"),
      el(
        "div",
        { className: `${PANEL_CLASS}-bar` },
        panelButton("Copy favorites", copyFavorites, { title: "Copy favorites as text" }),
        panelButton("Back up", downloadBackup, { title: "Download favorites, tags, notes and play counts" }),
        panelButton("Restore", restoreBackup, { title: "Restore from a backup file" }),
      ),
      el("h4", { className: `${PANEL_CLASS}-group` }, "Shortcuts"),
      el(
        "dl",
        { className: `${PANEL_CLASS}-shortcuts` },
        SHORTCUTS.map(([keys, label]) => [el("dt", {}, keys), el("dd", {}, label)]),
      ),
    );
  }

  function renderPanel() {
    if (!panel) return;
    const body = panel.querySelector(`.${PANEL_CLASS}-body`);
    const scrollTop = body?.scrollTop ?? 0;
    const searchFocused = document.activeElement?.classList?.contains(`${PANEL_CLASS}-search`);

    const tab = (id, label) =>
      el(
        "button",
        {
          type: "button",
          role: "tab",
          className: `${PANEL_CLASS}-tab`,
          "aria-selected": String(panelTab === id),
          onClick: () => {
            panelTab = id;
            renderPanel();
            if (id === "search") panel.querySelector(`.${PANEL_CLASS}-search`)?.focus();
          },
        },
        label,
      );

    const content = {
      favorites: renderFavoritesTab,
      recent: renderRecentTab,
      search: renderSearchTab,
      stats: renderStatsTab,
      more: renderMoreTab,
    }[panelTab] ?? renderFavoritesTab;

    panel.replaceChildren(
      el(
        "header",
        { className: `${PANEL_CLASS}-header` },
        el(
          "div",
          { role: "tablist", className: `${PANEL_CLASS}-tabs` },
          tab("favorites", `Favorites${favorites.length ? ` ${favorites.length}` : ""}`),
          tab("recent", "Recent"),
          tab("search", "Search"),
          tab("stats", "Stats"),
          tab("more", "More"),
        ),
        el(
          "button",
          { type: "button", className: `${PANEL_CLASS}-close`, "aria-label": "Close", onClick: () => togglePanel(false) },
          "×",
        ),
      ),
      el("div", { className: `${PANEL_CLASS}-body` }, content()),
    );

    const nextBody = panel.querySelector(`.${PANEL_CLASS}-body`);
    if (nextBody) nextBody.scrollTop = scrollTop;
    if (searchFocused) {
      const input = panel.querySelector(`.${PANEL_CLASS}-search`);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
    ensureLauncher();
  }

  async function copyFavorites() {
    if (favorites.length === 0) {
      toast("No favorites to copy");
      return;
    }

    const lines = favorites.map((entry) => `${entry.label || entry.titles[0]}${entry.project ? ` — ${entry.project}` : ""}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast(`Copied ${lines.length} favorite${lines.length === 1 ? "" : "s"}`);
    } catch {
      toast("Couldn’t access the clipboard");
    }
  }

  function downloadBackup() {
    flushListening();
    const data = { app: PREFIX, version: 2, exported: new Date().toISOString(), favorites, plays, settings, tags, notes, stats };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = el("a", { href: url, download: `untitled-refined-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup downloaded");
  }

  function restoreBackup() {
    const input = el("input", { type: "file", accept: "application/json,.json", hidden: true });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      try {
        const data = JSON.parse(await file.text());
        if (data?.app !== PREFIX || !Array.isArray(data.favorites)) throw new Error("Not a backup");

        const merged = [...favorites];
        let added = 0;
        data.favorites
          .filter((entry) => entry && typeof entry.path === "string" && Array.isArray(entry.titles))
          .forEach((entry) => {
            if (merged.some((item) => item.path === entry.path && item.titles.some((t) => entry.titles.includes(t)))) return;
            merged.push(entry);
            added += 1;
          });

        Object.entries(data.plays ?? {}).forEach(([key, entry]) => {
          if (!entry || typeof entry.count !== "number") return;
          const current = plays[key];
          if (!current || entry.count > current.count) plays[key] = { ...entry, last: Math.max(entry.last ?? 0, current?.last ?? 0) };
        });
        Object.entries(data.tags ?? {}).forEach(([key, list]) => {
          if (Array.isArray(list)) tags[key] = [...new Set([...(tags[key] ?? []), ...list.map(cleanTag).filter(Boolean)])];
        });
        Object.entries(data.notes ?? {}).forEach(([key, note]) => {
          if (typeof note === "string" && note && !notes[key]) notes[key] = note;
        });
        if (data.stats && (data.stats.seconds ?? 0) > (stats.seconds ?? 0)) stats = { ...stats, ...data.stats };

        saveJSON(STORAGE.plays, plays);
        saveJSON(STORAGE.tags, tags);
        saveJSON(STORAGE.notes, notes);
        saveJSON(STORAGE.stats, stats);
        setFavorites(merged);
        toast(`Restored ${added} new favorite${added === 1 ? "" : "s"}, plus tags, notes and plays`);
      } catch {
        toast("That file isn’t an Untitled Refined backup");
      }
    });
    document.body.append(input);
    input.click();
  }

  // ---------------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------------

  function hideToast() {
    clearTimeout(toastTimer);
    toastElement?.remove();
    toastElement = null;
  }

  function toast(message, { action, onAction, duration = 5000, kind = "info" } = {}) {
    hideToast();
    if (!document.body) return;

    toastElement = el(
      "div",
      { className: `${TOAST_CLASS} bg-playbar backdrop-blur-2xl shadow-2xl`, role: "status", "data-kind": kind, [CONTROL_ATTRIBUTE]: true },
      el("span", {}, message),
      action &&
        el(
          "button",
          {
            type: "button",
            onClick: () => {
              hideToast();
              onAction?.();
            },
          },
          action,
        ),
      el("button", { type: "button", className: `${TOAST_CLASS}-close`, "aria-label": "Dismiss", onClick: hideToast }, "×"),
    );
    document.body.append(toastElement);

    if (canAnimate()) {
      toastElement.animate(
        [
          { opacity: 0, transform: "translate(-50%, -8px)" },
          { opacity: 1, transform: "translate(-50%, 0)" },
        ],
        { duration: 220, easing: EASE_OUT_EXPO },
      );
    }
    toastTimer = setTimeout(hideToast, duration);
  }

  // ---------------------------------------------------------------------------
  // Player decoration and tracking
  // ---------------------------------------------------------------------------

  const playerObserver = new MutationObserver(schedulePlayerSync);

  function schedulePlayerSync() {
    if (playerSyncScheduled) return;
    playerSyncScheduled = true;
    requestAnimationFrame(() => {
      playerSyncScheduled = false;
      syncPlayer();
    });
  }

  function syncPlayer() {
    const player = getPlayer();
    if (!player?.controls) return;

    if (observedPlaybar !== player.playbar) {
      playerObserver.disconnect();
      playerObserver.observe(player.playbar, { childList: true, subtree: true, characterData: true });
      observedPlaybar = player.playbar;
    }

    if (!playerButton) {
      playerButton = controlButton(
        `${PLAYER_FAVORITE_CLASS} flex h-44 w-44 items-center justify-center transition-opacity duration-150 hover:opacity-80`,
        {
          html: ICONS.heart,
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePlayerFavorite();
          },
        },
      );
    }

    if (!playerPlays) {
      playerPlays = el("span", {
        className: `${PLAYER_PLAYS_CLASS} hidden items-center sm:flex`,
        [CONTROL_ATTRIBUTE]: true,
      });
    }

    if (player.controls.firstElementChild !== playerPlays || playerPlays.nextElementSibling !== playerButton) {
      player.controls.prepend(playerPlays, playerButton);
    }

    const available = Boolean(player.title && player.path);
    const favorite = available && isFavoriteTitle(player.path, getPlayerTitles(player.title));
    playerButton.hidden = !available;
    playerButton.classList.toggle("text-yellow", favorite);
    describeFavorite(playerButton, favorite, player.title);

    const count = available ? plays[playKeyFor(player).key]?.count ?? 0 : 0;
    const showCount = count > 0 && settings.showPlays;
    playerPlays.classList.toggle(`${PLAYER_PLAYS_CLASS}-empty`, !showCount);
    const countText = showCount ? String(count) : "";
    if (playerPlays.dataset.count !== countText) {
      playerPlays.dataset.count = countText;
      playerPlays.innerHTML = showCount ? `${ICONS.play}<span>${countText}</span>` : "";
      playerPlays.title = showCount ? `Played ${count} time${count === 1 ? "" : "s"}` : "";
    }

    trackPlayback(player);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

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

      ${TRACK_ROW_SELECTOR}[${VIEW_HIDDEN_ATTRIBUTE}="true"],
      ${TRACK_ROW_SELECTOR}[${COLLAPSED_ROW_ATTRIBUTE}="true"],
      ${TRACK_ROW_SELECTOR}[${FILTERED_ROW_ATTRIBUTE}="true"] {
        display: none !important;
      }

      /* Row heart */
      .${FAVORITE_BUTTON_CLASS} {
        position: absolute;
        top: 50%;
        right: 56px;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        margin-top: -14px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        opacity: 0;
        transition: opacity 140ms ease-out, background-color 140ms ease-out;
      }

      .${FAVORITE_BUTTON_CLASS}.${FAVORITE_INLINE_CLASS} {
        position: static;
        width: 24px;
        height: 24px;
        margin-top: 0;
        border-radius: 4px;
      }

      .${FAVORITE_BUTTON_CLASS}:hover,
      .${VERSIONS_CLASS}:hover {
        background-color: color-mix(in srgb, currentColor 12%, transparent);
      }

      .${EDIT_CLASS} {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        opacity: 0;
        transition: opacity 140ms ease-out, background-color 140ms ease-out;
      }

      .${EDIT_CLASS} svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linejoin: round;
        stroke-linecap: round;
      }

      .${EDIT_CLASS}:hover {
        background-color: color-mix(in srgb, currentColor 12%, transparent);
      }

      ${TRACK_ROW_SELECTOR}:hover .${EDIT_CLASS},
      ${TRACK_ROW_SELECTOR}[${SELECTED_ROW_ATTRIBUTE}="true"] .${EDIT_CLASS},
      .${EDIT_CLASS}:focus-visible {
        opacity: 1;
      }

      .${NEW_CLASS} {
        padding: 1px 7px;
        border-radius: 999px;
        background-color: var(--color-yellow, #fdd000);
        color: #000;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 16px;
      }

      .${NEW_CLASS}[hidden],
      .${META_CLASS}[hidden] {
        display: none !important;
      }

      .${META_CLASS} {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        margin-top: 2px;
        font-size: 12px;
        line-height: 16px;
        opacity: 0.75;
      }

      .${META_CLASS}-tag {
        font-weight: 600;
      }

      .${META_CLASS}-note {
        display: inline-flex;
      }

      .${META_CLASS}-note svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
      }

      .${META_CLASS}-note-text {
        max-width: 28ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      ${TRACK_ROW_SELECTOR}:hover .${FAVORITE_BUTTON_CLASS},
      ${TRACK_ROW_SELECTOR}[${SELECTED_ROW_ATTRIBUTE}="true"] .${FAVORITE_BUTTON_CLASS},
      ${TRACK_ROW_SELECTOR}[${FAVORITE_ROW_ATTRIBUTE}="true"] .${FAVORITE_BUTTON_CLASS},
      .${FAVORITE_BUTTON_CLASS}:focus-visible {
        opacity: 1;
      }

      .${FAVORITE_BUTTON_CLASS} svg,
      .${PILL_CLASS} svg,
      .${PLAYER_FAVORITE_CLASS} svg,
      .${LAUNCHER_CLASS} svg {
        flex: none;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linejoin: round;
        stroke-linecap: round;
      }

      .${FAVORITE_BUTTON_CLASS}[aria-pressed="true"] svg,
      .${PILL_CLASS}[data-pill="favorites"][aria-pressed="true"] svg,
      .${PLAYER_FAVORITE_CLASS}[aria-pressed="true"] svg,
      .${LAUNCHER_CLASS}[aria-expanded="true"] svg {
        fill: currentColor;
      }

      /* Play count and version badges */
      .${PLAYS_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        opacity: 0.75;
      }

      .${PLAYS_CLASS} svg {
        fill: currentColor;
      }

      .${PLAYS_CLASS}[hidden],
      .${VERSIONS_CLASS}[hidden] {
        display: none !important;
      }

      .${VERSIONS_CLASS} {
        height: 22px;
        padding: 0 8px;
        border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 12px;
        line-height: 20px;
        white-space: nowrap;
        cursor: pointer;
      }

      .${VERSIONS_CLASS}[aria-expanded="true"] {
        background-color: color-mix(in srgb, currentColor 12%, transparent);
      }

      /* Toolbar */
      .${TOOLBAR_CLASS} {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }

      .${PILL_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
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

      .${PILL_CLASS}:hover,
      .${PILL_CLASS}[aria-pressed="true"] {
        opacity: 1;
      }

      .${PILL_CLASS}[aria-pressed="true"] {
        background-color: color-mix(in srgb, currentColor 12%, transparent);
      }

      .${PREFIX}-count {
        margin-left: auto;
        font-size: 13px;
        opacity: 0.6;
        font-variant-numeric: tabular-nums;
      }

      /* Player play count */
      .${PLAYER_PLAYS_CLASS} {
        gap: 3px;
        padding: 0 4px;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        opacity: 0.7;
      }

      .${PLAYER_PLAYS_CLASS} svg {
        fill: currentColor;
      }

      .${PLAYER_PLAYS_CLASS}.${PLAYER_PLAYS_CLASS}-empty {
        display: none !important;
      }

      /* Player heart */
      .${PLAYER_FAVORITE_CLASS} svg {
        width: 20px;
        height: 20px;
      }

      .${PLAYER_FAVORITE_CLASS}[hidden] {
        display: none !important;
      }

      /* Launcher and panel */
      .${LAUNCHER_CLASS} {
        position: fixed;
        left: 24px;
        bottom: 24px;
        z-index: 2147483000;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        color: #fff;
        cursor: pointer;
        transition: transform 160ms ${EASE_OUT_QUART}, opacity 160ms ease-out;
        opacity: 0.85;
      }

      .${LAUNCHER_CLASS}:hover,
      .${LAUNCHER_CLASS}[aria-expanded="true"] {
        opacity: 1;
        transform: scale(1.05);
      }

      .${LAUNCHER_CLASS} svg {
        width: 20px;
        height: 20px;
      }

      .${LAUNCHER_CLASS}-busy::after {
        content: "";
        position: absolute;
        top: 7px;
        right: 7px;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background-color: var(--color-yellow, #fdd000);
      }

      .${PANEL_CLASS}-tabs {
        display: flex;
        gap: 2px;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .${PANEL_CLASS}-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        margin: 4px 4px 8px;
      }

      .${PANEL_CLASS}-bar > span {
        margin-right: auto;
        font-size: 13px;
        opacity: 0.75;
      }

      .${PANEL_CLASS}-action[aria-pressed="true"],
      .${PANEL_CLASS}-primary {
        background-color: rgba(255, 255, 255, 0.14);
        opacity: 1;
      }

      .${PANEL_CLASS}-current {
        background-color: rgba(253, 208, 0, 0.14);
      }

      .${PANEL_CLASS}-search {
        box-sizing: border-box;
        width: calc(100% - 8px);
        margin: 4px 4px 6px;
        padding: 8px 12px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        font: inherit;
        outline: none;
      }

      .${PANEL_CLASS}-search:focus {
        border-color: rgba(255, 255, 255, 0.4);
      }

      .${PANEL_CLASS}-figures {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin: 6px 4px 4px;
      }

      .${PANEL_CLASS}-figure {
        display: flex;
        flex-direction: column;
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
      }

      .${PANEL_CLASS}-figure strong {
        font-size: 18px;
        font-variant-numeric: tabular-nums;
      }

      .${PANEL_CLASS}-figure span {
        font-size: 12px;
        opacity: 0.6;
      }

      .${PANEL_CLASS}-ranked {
        background-image: linear-gradient(to right, rgba(255, 255, 255, 0.07) var(--bar), transparent var(--bar));
        margin-bottom: 2px;
      }

      .${PANEL_CLASS}-plain li {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
      }

      .${PANEL_CLASS}-setting {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 12px;
        cursor: pointer;
      }

      .${PANEL_CLASS}-setting:hover {
        background-color: rgba(255, 255, 255, 0.06);
      }

      .${PANEL_CLASS}-setting input {
        margin-top: 3px;
        accent-color: var(--color-yellow, #fdd000);
      }

      .${PANEL_CLASS}-setting span {
        display: flex;
        flex-direction: column;
      }

      .${PANEL_CLASS}-setting small {
        font-size: 12px;
        opacity: 0.55;
      }

      .${PANEL_CLASS}-shortcuts {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 12px;
        margin: 4px 8px 8px;
        font-size: 12px;
      }

      .${PANEL_CLASS}-shortcuts dt {
        font-weight: 600;
        white-space: nowrap;
      }

      .${PANEL_CLASS}-shortcuts dd {
        margin: 0;
        opacity: 0.65;
      }

      /* Tag and note editor */
      .${EDITOR_CLASS} {
        position: fixed;
        top: 15vh;
        left: 50%;
        z-index: 2147483001;
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: min(420px, calc(100vw - 32px));
        padding: 16px;
        border-radius: 20px;
        color: #fff;
        font-size: 14px;
        transform: translateX(-50%);
      }

      .${EDITOR_CLASS}-title {
        margin: 0;
        overflow: hidden;
        font-size: 15px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${EDITOR_CLASS}-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        opacity: 0.85;
      }

      .${EDITOR_CLASS}-input {
        box-sizing: border-box;
        width: 100%;
        padding: 8px 12px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        font: inherit;
        font-size: 14px;
        resize: vertical;
        outline: none;
      }

      .${EDITOR_CLASS}-input:focus {
        border-color: rgba(255, 255, 255, 0.4);
      }

      .${EDITOR_CLASS}-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: -4px;
      }

      .${EDITOR_CLASS}-chip,
      .${EDITOR_CLASS}-button {
        padding: 3px 10px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }

      .${EDITOR_CLASS}-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .${EDITOR_CLASS}-hint {
        margin-right: auto;
        font-size: 11px;
        opacity: 0.45;
      }

      .${EDITOR_CLASS}-button {
        padding: 6px 14px;
        font-size: 13px;
      }

      .${EDITOR_CLASS}-primary {
        background: #fff;
        color: #000;
        font-weight: 600;
      }

      .${PANEL_CLASS} {
        position: fixed;
        left: 24px;
        bottom: 80px;
        z-index: 2147483000;
        display: flex;
        flex-direction: column;
        width: min(380px, calc(100vw - 32px));
        max-height: min(70vh, 600px);
        border-radius: 20px;
        color: #fff;
        font-size: 14px;
        overflow: hidden;
      }

      .${PANEL_CLASS}-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 10px 6px 12px;
      }

      .${PANEL_CLASS}-tab,
      .${PANEL_CLASS}-close,
      .${PANEL_CLASS}-action,
      .${PANEL_CLASS}-remove,
      .${PANEL_CLASS}-play,
      .${TOAST_CLASS} button {
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }

      .${PANEL_CLASS}-tab {
        flex: none;
        padding: 5px 10px;
        font-size: 13px;
        border-radius: 999px;
        opacity: 0.6;
      }

      .${PANEL_CLASS}-tab[aria-selected="true"] {
        background-color: rgba(255, 255, 255, 0.12);
        opacity: 1;
      }

      .${PANEL_CLASS}-close {
        width: 28px;
        height: 28px;
        border-radius: 999px;
        font-size: 18px;
        opacity: 0.7;
      }

      .${PANEL_CLASS}-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0 6px 6px;
        overscroll-behavior: contain;
      }

      .${PANEL_CLASS} ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .${PANEL_CLASS}-group {
        margin: 10px 8px 4px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        opacity: 0.55;
      }

      .${PANEL_CLASS}-item {
        display: flex;
        align-items: center;
        border-radius: 12px;
      }

      .${PANEL_CLASS}-item:hover {
        background-color: rgba(255, 255, 255, 0.08);
      }

      .${PANEL_CLASS}-play {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        padding: 7px 8px;
        text-align: left;
      }

      .${PANEL_CLASS}-label,
      .${PANEL_CLASS}-detail {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${PANEL_CLASS}-label {
        font-weight: 600;
      }

      .${PANEL_CLASS}-detail {
        font-size: 12px;
        opacity: 0.6;
      }

      .${PANEL_CLASS}-detail:empty {
        display: none;
      }

      .${PANEL_CLASS}-remove {
        width: 28px;
        height: 28px;
        margin-right: 4px;
        border-radius: 999px;
        font-size: 16px;
        opacity: 0;
      }

      .${PANEL_CLASS}-item:hover .${PANEL_CLASS}-remove,
      .${PANEL_CLASS}-remove:focus-visible {
        opacity: 0.7;
      }

      .${PANEL_CLASS}-empty {
        margin: 16px 10px;
        opacity: 0.6;
      }

      .${PANEL_CLASS}-footer {
        padding: 8px 12px 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .${PANEL_CLASS}-actions {
        display: flex;
        gap: 4px;
        margin: 0 -8px;
      }

      .${PANEL_CLASS}-action {
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 13px;
        opacity: 0.75;
      }

      .${PANEL_CLASS}-action:hover,
      .${PANEL_CLASS}-close:hover,
      .${PANEL_CLASS}-tab:hover {
        background-color: rgba(255, 255, 255, 0.1);
        opacity: 1;
      }

      .${PANEL_CLASS}-hint {
        margin: 6px 0 0;
        font-size: 11px;
        line-height: 1.4;
        opacity: 0.45;
      }

      /* Toast */
      .${TOAST_CLASS} {
        position: fixed;
        top: 20px;
        left: 50%;
        z-index: 2147483001;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: calc(100vw - 32px);
        padding: 8px 8px 8px 16px;
        border-radius: 999px;
        color: #fff;
        font-size: 14px;
        transform: translateX(-50%);
      }

      .${TOAST_CLASS} span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${TOAST_CLASS} button {
        flex: none;
        padding: 4px 12px;
        border-radius: 999px;
        background-color: rgba(255, 255, 255, 0.14);
        font-weight: 600;
      }

      .${TOAST_CLASS} .${TOAST_CLASS}-close {
        padding: 4px 9px;
        background: transparent;
        font-weight: 400;
        opacity: 0.6;
      }

      @media (prefers-reduced-motion: reduce) {
        ${TRACK_ROW_SELECTOR}[${SELECTED_ROW_ATTRIBUTE}="true"],
        .${PILL_CLASS},
        .${LAUNCHER_CLASS},
        .${FAVORITE_BUTTON_CLASS} {
          transition: none !important;
        }
      }
    `;
    (document.head ?? document.documentElement).append(style);
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

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

  function moveSelection(direction, { moveFocus = false, fallbackRow = null } = {}) {
    const rows = getNavigableRows();
    if (rows.length === 0) return;

    const selectedIndex = selectedRow ? rows.indexOf(selectedRow) : -1;
    const fallbackIndex = fallbackRow ? rows.indexOf(fallbackRow) : -1;
    const currentIndex = selectedIndex >= 0 ? selectedIndex : fallbackIndex;
    const nextIndex =
      currentIndex < 0
        ? direction > 0 ? 0 : rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, currentIndex + direction));

    selectTrackRow(rows[nextIndex], { moveFocus });
  }

  function playRow(row) {
    selectTrackRow(row);
    row.querySelector(TRACK_BUTTON_SELECTOR)?.click();
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

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

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
    const forget = () => {
      if (activeAnimations.get(element) === animation) activeAnimations.delete(element);
    };
    animation.addEventListener("finish", forget, { once: true });
    animation.addEventListener("cancel", forget, { once: true });
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
        { transform: "translateX(18px) scaleX(0.86)", transformOrigin: "right center", opacity: 0.18, filter: "blur(5px)" },
        { transform: "translateX(0) scaleX(1)", transformOrigin: "right center", opacity: 1, filter: "blur(0)" },
      ],
      { duration: SEARCH_ENTER_DURATION_MS, easing: EASE_OUT_EXPO },
    );

    const doneButton = findDoneButton(input);
    if (doneButton) {
      playAnimation(
        doneButton,
        [
          { transform: "translateX(8px)", opacity: 0 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { delay: 45, duration: 210, easing: EASE_OUT_QUART, fill: "backwards" },
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
      { duration: PROJECT_ENTER_DURATION_MS, easing: EASE_OUT_EXPO },
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
          { transform: "translateY(0) scale(1)", opacity: 1, filter: "brightness(1)" },
        ],
        { duration: isExact ? EXACT_DURATION_MS : MOVE_DURATION_MS, easing: EASE_OUT_QUART },
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Ordering, grouping, and filtering
  // ---------------------------------------------------------------------------

  function getOriginalOrder(row) {
    const order = Number.parseInt(row.dataset.untitledRefinedOrder ?? "", 10);
    return Number.isNaN(order) ? Number.POSITIVE_INFINITY : order;
  }

  function recordOriginalOrder(rows) {
    rows.forEach((row, index) => {
      if (row.dataset.untitledRefinedOrder === undefined) row.dataset.untitledRefinedOrder = String(index);
    });
  }

  // Versions of one song share a title apart from a trailing "[V2]" tag. Favorites stay
  // out of groups so a pinned favorite never hides anything. Untitled lists tracks newest
  // first, so the representative is the version highest in the original order. (Version
  // numbers alone mislead: an untagged original is often older than a later "[V1]".)
  function buildGroups(rows) {
    const path = getProjectPath();
    const byBase = new Map();

    rows.forEach((row) => {
      if (isFavorite(row)) return;
      const info = parseVersion(getTitle(row));
      if (!byBase.has(info.base)) byBase.set(info.base, []);
      byBase.get(info.base).push({ row, ...info });
    });

    const byRow = new Map();
    byBase.forEach((members, base) => {
      if (members.length < 2 || !members.some((member) => member.tagged)) return;
      members.sort((left, right) => getOriginalOrder(left.row) - getOriginalOrder(right.row));
      const group = { key: `${path}::${base}`, rep: members[0].row, members: members.map((member) => member.row) };
      group.members.forEach((row) => byRow.set(row, group));
    });

    return byRow;
  }

  function orderRows(rows, groups) {
    const base = rows
      .map((row, index) => ({
        row,
        index,
        favorite: isFavorite(row),
        plays: settings.sortByPlays ? getPlayCount(row) : 0,
        order: getOriginalOrder(row),
      }))
      .sort(
        (left, right) =>
          Number(right.favorite) - Number(left.favorite) ||
          right.plays - left.plays ||
          left.order - right.order ||
          left.index - right.index,
      )
      .map(({ row }) => row);

    if (!groups || groups.size === 0) return base;

    const ordered = [];
    const emitted = new Set();
    base.forEach((row) => {
      const group = groups.get(row);
      if (!group) {
        ordered.push(row);
        return;
      }
      if (emitted.has(group)) return;
      emitted.add(group);
      ordered.push(...group.members);
    });
    return ordered;
  }

  // Search: score tier first (exact, prefix, word, substring, terms, fuzzy), then favorites,
  // then the precise score. An exact match always wins; favorites win close calls.
  function rankTracks(rows, query) {
    return rows
      .map((row, index) => {
        const value = score(getTitle(row), query);
        return { row, index, value, tier: value === 0 ? -1 : Math.floor(value / 100), favorite: isFavorite(row) };
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

  function applyVisibility(rows, filters, groups) {
    rows.forEach((row) => {
      setAttributeFlag(row, FILTERED_ROW_ATTRIBUTE, !matchesFilters(row, filters));
      setAttributeFlag(row, VIEW_HIDDEN_ATTRIBUTE, isHiddenByView(row));

      const group = groups?.get(row) ?? null;
      const expanded = Boolean(group && expandedGroups.has(group.key));
      setAttributeFlag(row, COLLAPSED_ROW_ATTRIBUTE, Boolean(group && row !== group.rep && !expanded));

      const badge = row.querySelector(`.${VERSIONS_CLASS}`);
      if (!badge) return;

      const others = group && row === group.rep ? group.members.length - 1 : 0;
      badge.hidden = others === 0;
      if (others === 0) return;

      const text = expanded ? "Hide versions" : `+${others} version${others === 1 ? "" : "s"}`;
      if (badge.textContent !== text) badge.textContent = text;
      badge.dataset.group = group.key;
      badge.setAttribute("aria-expanded", String(expanded));
      badge.title = expanded ? "Collapse older versions" : `Show ${others} older version${others === 1 ? "" : "s"}`;
    });
  }

  function applyRanking() {
    scheduled = false;
    if (isApplying) return;

    const input = getSearchInput();
    const rawQuery = input?.value?.trim() ?? "";
    const { text: queryText, filters } = parseQuery(rawQuery);
    const path = getProjectPath();
    const rows = getTrackRows();
    const list = getTrackList(rows);

    if (!rawQuery) {
      lastExactKey = null;
      recordOriginalOrder(rows);
      recordVisit(path, rows);
      groupsAvailable = rows.length > 1 && buildGroups(rows).size > 0;
    }

    const groups = !rawQuery && settings.groupVersions ? buildGroups(rows) : null;
    applyVisibility(rows, filters, groups);
    rows.forEach((row) => {
      const badge = row.querySelector(`.${NEW_CLASS}`);
      if (badge) badge.hidden = !isNew(row);
    });
    renderToolbar(list, {
      query: rawQuery,
      rows,
      resultCount: rows.filter((row) => !row.hasAttribute(FILTERED_ROW_ATTRIBUTE) && !row.hasAttribute(VIEW_HIDDEN_ATTRIBUTE)).length,
    });
    if (selectedRow && !isRowVisible(selectedRow)) clearSelectedRow();

    if (!list || rows.length < 2) return;

    const customOrder =
      countProjectFavorites(path) > 0 || Boolean(groups) || (settings.sortByPlays && projectHasPlays(path));
    if (!rawQuery && !customOrder && pinnedPath !== path) return;

    const scoringQuery = queryText || rawQuery;
    const rankedRows = rawQuery ? rankTracks(rows, scoringQuery) : orderRows(rows, groups);
    const needsReorder = rankedRows.some((row, index) => row !== rows[index]);
    const exactRow = rawQuery ? rankedRows.find((row) => score(getTitle(row), scoringQuery) === 0) ?? null : null;
    const exactKey = exactRow ? `${normalize(scoringQuery)}:${exactRow.dataset.trackSlug ?? getTitle(exactRow)}` : null;
    const shouldEmphasizeExact = Boolean(exactKey && exactKey !== lastExactKey);
    const previousPositions = new Map();

    if (canAnimate() && (needsReorder || shouldEmphasizeExact)) {
      rankedRows.slice(0, MAX_ANIMATED_ROWS).forEach((row) => {
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
        if (!rawQuery) pinnedPath = path;
      }

      rankedRows.forEach((row, index) => updateDisplayedIndex(row, rawQuery ? index : getOriginalOrder(row)));
      if (rawQuery) {
        input.dataset.untitledRefinedActive = "true";
        input.title = "Exact title matches are ranked first. Add v2 or feat to filter.";
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

  // ---------------------------------------------------------------------------
  // Observers and events
  // ---------------------------------------------------------------------------

  const observer = new MutationObserver((mutations) => {
    if (isApplying) return;

    installStyles();
    ensureLauncher();
    animateSearchEntrance();
    animateProjectEntrance();
    decorateRows();
    schedulePlayerSync();

    if (viewPath && getProjectPath() !== viewPath) setView({ favoritesOnly: false, newOnly: false, tagFilter: null });

    const searchOpen = Boolean(getSearchInput());
    if (searchWasOpen && !searchOpen) clearSelectedRow();
    if (selectedRow && !selectedRow.isConnected) selectedRow = null;
    searchWasOpen = searchOpen;

    const trackListChanged = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) => {
        if (!(node instanceof Element)) return false;
        return node.matches(TRACK_ROW_SELECTOR) || Boolean(node.querySelector(TRACK_ROW_SELECTOR));
      }),
    );

    if (trackListChanged || searchOpen) scheduleRanking();
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

  // Untitled already binds Space (play/pause), ←/→ (skip 10s) and ↑/↓ (volume) globally,
  // so the extension's own shortcuts stay off those keys outside the search field.
  function handleGlobalShortcut(event) {
    if (isEditableTarget(event.target)) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    const key = event.key;
    const onPage = event.target === document.body || event.target === document.documentElement || !(event.target instanceof Element);

    if (key === "Escape" && (panel || editor)) {
      if (editor) closeEditor();
      else togglePanel(false);
      return true;
    }
    if (event.shiftKey && event.code === "KeyF") {
      togglePanel();
      return true;
    }
    if (key === "?") {
      togglePanel(true, "more");
      panel?.querySelector(`.${PANEL_CLASS}-shortcuts`)?.scrollIntoView({ block: "start" });
      return true;
    }
    if (!settings.shortcuts) return false;
    if (!event.shiftKey && event.code === "KeyE") {
      openEditor(editTarget());
      return true;
    }
    if (!event.shiftKey && event.code === "KeyV") {
      switchVersion();
      return true;
    }
    if (!event.shiftKey && key === "[") {
      setLoopPoint("start");
      return true;
    }
    if (!event.shiftKey && key === "]") {
      setLoopPoint("end");
      return true;
    }
    if (!event.shiftKey && key === "\\") {
      setLoopPoint("clear");
      return true;
    }
    if (!event.shiftKey && event.code === "KeyL") {
      togglePlayerFavorite();
      return true;
    }
    if (event.shiftKey && event.code === "KeyN") {
      if (queue) advanceQueue(1);
      else skipTrack(1);
      return true;
    }
    if (event.shiftKey && event.code === "KeyP") {
      if (queue) advanceQueue(-1);
      else skipTrack(-1);
      return true;
    }
    if (!event.shiftKey && key === ".") {
      jumpToPlaying();
      return true;
    }
    if (!event.shiftKey && (event.code === "KeyJ" || event.code === "KeyK") && getProjectPath()) {
      const focusedRow = event.target instanceof Element ? event.target.closest(TRACK_ROW_SELECTOR) : null;
      moveSelection(event.code === "KeyJ" ? 1 : -1, { moveFocus: Boolean(focusedRow), fallbackRow: focusedRow });
      return true;
    }
    if (!event.shiftKey && key === "Enter" && onPage && selectedRow?.isConnected && isRowVisible(selectedRow)) {
      playRow(selectedRow);
      return true;
    }
    return false;
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;

      const focusedRow = event.target instanceof Element ? event.target.closest(TRACK_ROW_SELECTOR) : null;
      const plainKey = !event.altKey && !event.ctrlKey && !event.metaKey;
      const favoriteFromRow = focusedRow && plainKey && !event.shiftKey && event.code === "KeyF";
      const favoriteFromSearch =
        plainKey &&
        event.shiftKey &&
        event.key === "Enter" &&
        event.target instanceof Element &&
        event.target.matches(SEARCH_INPUT_SELECTOR) &&
        selectedRow?.isConnected;

      if (favoriteFromRow || favoriteFromSearch) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(focusedRow ?? selectedRow);
        return;
      }

      if (handleGlobalShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const input = getSearchInput();
      if (!input) return;

      const rows = getNavigableRows();
      if (rows.length === 0) return;

      const fromInput = event.target === input;
      if (!fromInput && !focusedRow) return;

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        moveSelection(event.key === "ArrowDown" ? 1 : -1, { moveFocus: Boolean(focusedRow), fallbackRow: focusedRow });
        return;
      }

      if (fromInput && event.key === "Enter" && input.value.trim()) {
        event.preventDefault();
        playRow(selectedRow && rows.includes(selectedRow) ? selectedRow : rows[0]);
      }
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;

      if (panel && !event.target.closest(`.${PANEL_CLASS}, .${LAUNCHER_CLASS}, .${TOAST_CLASS}, .${EDITOR_CLASS}`)) {
        togglePanel(false);
      }
      if (editor && !event.target.closest(`.${EDITOR_CLASS}, .${EDIT_CLASS}`)) closeEditor();

      // Clicking the player title while already on its project scrolls to the track
      // instead of reloading the same page; from elsewhere it navigates, then scrolls.
      const titleLink = event.target.closest("#playbar .playbar-title")?.closest("a");
      if (titleLink) {
        const player = getPlayer();
        if (player?.path && player.path === getProjectPath()) {
          event.preventDefault();
          event.stopPropagation();
          jumpToPlaying();
        } else if (player?.path) {
          const titles = getPlayerTitles(player.title);
          waitFor(() => (getProjectPath() === player.path ? findRowByTitles(titles) : null)).then((row) => {
            if (row) jumpToPlaying();
          });
        }
        return;
      }

      if (event.target.closest(`[${CONTROL_ATTRIBUTE}]`)) return;
      const row = event.target.closest(TRACK_ROW_SELECTOR);
      if (row) selectTrackRow(row, { scroll: false });
    },
    true,
  );

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE.favorites) {
      favorites = loadFavorites();
      favoriteIndex = buildFavoriteIndex();
    } else if (event.key === STORAGE.plays) {
      plays = loadJSON(STORAGE.plays, {});
    } else if (event.key === STORAGE.settings) {
      settings = { ...settings, ...loadJSON(STORAGE.settings, {}) };
    } else if (event.key === STORAGE.tags) {
      tags = loadJSON(STORAGE.tags, {});
    } else if (event.key === STORAGE.notes) {
      notes = loadJSON(STORAGE.notes, {});
    } else {
      return;
    }
    refreshViews();
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  installStyles();
  ensureLauncher();
  decorateRows();
  syncPlayer();
  // Observe the document itself: when hydration fails, React replaces the whole <html>
  // element, which would silently detach an observer on documentElement.
  observer.observe(document, { childList: true, subtree: true });
  animateSearchEntrance();
  animateProjectEntrance();
  scheduleRanking();
  addEventListener("pagehide", flushListening);
  // Wait until React has finished taking over the page before offering to resume.
  setTimeout(maybeOfferResume, RESUME_PROMPT_DELAY_MS);

  Object.defineProperty(globalThis, "__untitledRefinedInstalled", {
    configurable: true,
    value: true,
  });
})();
