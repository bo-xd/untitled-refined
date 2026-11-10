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
  const FAVORITES_ONLY_ATTRIBUTE = `data-${PREFIX}-favorites-only`;

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

  const STORAGE = {
    favorites: `${PREFIX}:favorites`,
    plays: `${PREFIX}:plays`,
    resume: `${PREFIX}:resume`,
    settings: `${PREFIX}:settings`,
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
  let favoritesOnlyPath = null;
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

  const activeAnimations = new WeakMap();
  const animatedSearchInputs = new WeakSet();
  const expandedGroups = new Set();

  let legacyFavorites = new Set();
  let favorites = loadFavorites();
  let favoriteIndex = buildFavoriteIndex();
  let plays = loadJSON(STORAGE.plays, {});
  let settings = { groupVersions: false, sortByPlays: false, ...loadJSON(STORAGE.settings, {}) };

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
    for (const child of children.flat()) {
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
    const filters = { version: null, feature: false };
    const words = rawQuery.split(/\s+/).filter(Boolean);
    const remaining = [];

    for (const word of words) {
      const version = word.match(/^v(\d+)$/i);
      if (version) filters.version = Number(version[1]);
      else if (/^(feat|ft)\.?$/i.test(word)) filters.feature = true;
      else remaining.push(word);
    }

    filters.active = filters.version !== null || filters.feature;
    return { text: remaining.join(" "), filters };
  }

  function matchesFilters(title, filters) {
    if (!filters.active) return true;
    if (filters.version !== null && parseVersion(title).version !== filters.version) return false;
    if (filters.feature && !/\b(feat|ft)\b\.?/i.test(title)) return false;
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
      (!favoritesOnly || isFavorite(row))
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
    if (favoritesOnly && !isFavorite(row)) setFavoritesOnly(false);

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
      playback = { ...identity, path: player.path, project: player.project, last: player.position, listened: 0, counted: false };
    }

    const delta = player.position - playback.last;
    if (delta > 0 && delta <= 3) playback.listened += delta;
    if (delta < -5 && player.position < 3) {
      playback.listened = 0;
      playback.counted = false;
    }
    playback.last = player.position;

    const threshold = player.duration ? Math.min(PLAY_COUNT_SECONDS, player.duration / 2) : PLAY_COUNT_SECONDS;
    if (!playback.counted && playback.listened >= threshold) {
      playback.counted = true;
      recordPlay(playback);
    }

    if (delta > 0) {
      hideResumePrompt();
      saveResumePoint(player, identity);
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
      actions.prepend(versionsBadge, playsBadge, heart);
    } else {
      row.append(versionsBadge, playsBadge, heart);
    }
    return true;
  }

  function renderRow(row) {
    const favorite = isFavorite(row);
    setAttributeFlag(row, FAVORITE_ROW_ATTRIBUTE, favorite);

    const heart = row.querySelector(`.${FAVORITE_BUTTON_CLASS}`);
    if (heart) describeFavorite(heart, favorite, getTitle(row));

    const playsBadge = row.querySelector(`.${PLAYS_CLASS}`);
    if (playsBadge) {
      const count = getPlayCount(row);
      playsBadge.hidden = count === 0;
      const text = String(count);
      if (playsBadge.dataset.count !== text) {
        playsBadge.dataset.count = text;
        playsBadge.innerHTML = `${ICONS.play}<span>${text}</span>`;
        playsBadge.title = `Played ${count} time${count === 1 ? "" : "s"}`;
      }
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
    if (favoritesOnly && countProjectFavorites() === 0) setFavoritesOnly(false);
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

  function setFavoritesOnly(enabled) {
    favoritesOnly = enabled;
    favoritesOnlyPath = enabled ? getProjectPath() : null;
    document.documentElement.toggleAttribute(FAVORITES_ONLY_ATTRIBUTE, enabled);
    if (enabled && selectedRow && !isFavorite(selectedRow)) clearSelectedRow();
    scheduleRanking();
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

  function renderToolbar(list, { query, resultCount }) {
    const favoriteCount = countProjectFavorites();
    const hasPlays = projectHasPlays();
    const show = Boolean(list) && (favoriteCount > 0 || groupsAvailable || hasPlays || query);

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
        "aria-label": "Favorites and recently played (Shift+F)",
        title: "Favorites and recently played (Shift+F)",
        onClick: (event) => {
          event.stopPropagation();
          togglePanel();
        },
      });
    }
    if (!launcher.isConnected) document.body.append(launcher);
    if (panel && !panel.isConnected) document.body.append(panel);
    launcher.setAttribute("aria-expanded", String(Boolean(panel)));
  }

  function togglePanel(force) {
    const open = force ?? !panel;
    if (!open) {
      panel?.remove();
      panel = null;
      ensureLauncher();
      return;
    }

    panel = el("div", {
      className: `${PANEL_CLASS} bg-playbar backdrop-blur-2xl shadow-2xl`,
      role: "dialog",
      "aria-label": "Untitled Refined",
      [CONTROL_ATTRIBUTE]: true,
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

  function renderFavoritesTab() {
    if (favorites.length === 0) {
      return el("p", { className: `${PANEL_CLASS}-empty` }, "No favorites yet. Tap the heart on a track or in the player.");
    }

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
      [...byProject.entries()].map(([project, entries]) =>
        el(
          "section",
          {},
          el("h4", { className: `${PANEL_CLASS}-group` }, project),
          el(
            "ul",
            {},
            entries.map((entry) => {
              const count = plays[`${entry.path}::${entry.titles[0]}`]?.count ?? 0;
              return trackItem({
                label: entry.label || entry.titles[0],
                detail: count ? `${count} play${count === 1 ? "" : "s"}` : "",
                onPlay: () => playFromPanel(entry),
                onRemove: () => toggleFavoriteTitles(entry.path, entry.titles, entry),
              });
            }),
          ),
        ),
      ),
    );
  }

  function renderRecentTab() {
    const recent = Object.values(plays)
      .sort((left, right) => right.last - left.last)
      .slice(0, 20);

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

  function renderPanel() {
    if (!panel) return;
    const scrollTop = panel.querySelector(`.${PANEL_CLASS}-body`)?.scrollTop ?? 0;

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
          },
        },
        label,
      );

    const footerButton = (label, onClick, title) =>
      el("button", { type: "button", className: `${PANEL_CLASS}-action`, title, onClick }, label);

    panel.replaceChildren(
      el(
        "header",
        { className: `${PANEL_CLASS}-header` },
        el("div", { role: "tablist" }, tab("favorites", `Favorites · ${favorites.length}`), tab("recent", "Recent")),
        el(
          "button",
          { type: "button", className: `${PANEL_CLASS}-close`, "aria-label": "Close", onClick: () => togglePanel(false) },
          "×",
        ),
      ),
      el("div", { className: `${PANEL_CLASS}-body` }, panelTab === "favorites" ? renderFavoritesTab() : renderRecentTab()),
      el(
        "footer",
        { className: `${PANEL_CLASS}-footer` },
        el(
          "div",
          { className: `${PANEL_CLASS}-actions` },
          footerButton("Copy list", copyFavorites, "Copy favorites as text"),
          footerButton("Back up", downloadBackup, "Download favorites and play counts"),
          footerButton("Restore", restoreBackup, "Restore from a backup file"),
        ),
        el(
          "p",
          { className: `${PANEL_CLASS}-hint` },
          "L like playing · . jump to playing · Shift+N/P next/prev · J/K move · Enter play · Shift+F this panel",
        ),
      ),
    );

    const body = panel.querySelector(`.${PANEL_CLASS}-body`);
    if (body) body.scrollTop = scrollTop;
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
    const data = { app: PREFIX, version: 1, exported: new Date().toISOString(), favorites, plays, settings };
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
        saveJSON(STORAGE.plays, plays);
        setFavorites(merged);
        toast(`Restored ${added} new favorite${added === 1 ? "" : "s"}`);
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

    if (player.controls.firstElementChild !== playerButton) player.controls.prepend(playerButton);

    const available = Boolean(player.title && player.path);
    const favorite = available && isFavoriteTitle(player.path, getPlayerTitles(player.title));
    playerButton.hidden = !available;
    playerButton.classList.toggle("text-yellow", favorite);
    describeFavorite(playerButton, favorite, player.title);

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

      html[${FAVORITES_ONLY_ATTRIBUTE}] ${TRACK_ROW_SELECTOR}:not([${FAVORITE_ROW_ATTRIBUTE}="true"]),
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

      .${PANEL_CLASS} {
        position: fixed;
        left: 24px;
        bottom: 80px;
        z-index: 2147483000;
        display: flex;
        flex-direction: column;
        width: min(360px, calc(100vw - 32px));
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
        padding: 5px 12px;
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
      setAttributeFlag(row, FILTERED_ROW_ATTRIBUTE, !matchesFilters(getTitle(row), filters));

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
      groupsAvailable = rows.length > 1 && buildGroups(rows).size > 0;
    }

    const groups = !rawQuery && settings.groupVersions ? buildGroups(rows) : null;
    applyVisibility(rows, filters, groups);
    renderToolbar(list, {
      query: rawQuery,
      resultCount: rows.filter((row) => !row.hasAttribute(FILTERED_ROW_ATTRIBUTE) && (!favoritesOnly || isFavorite(row))).length,
    });

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

    if (favoritesOnly && getProjectPath() !== favoritesOnlyPath) setFavoritesOnly(false);

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

    if (key === "Escape" && panel) {
      togglePanel(false);
      return true;
    }
    if (event.shiftKey && event.code === "KeyF") {
      togglePanel();
      return true;
    }
    if (!event.shiftKey && event.code === "KeyL") {
      togglePlayerFavorite();
      return true;
    }
    if (event.shiftKey && event.code === "KeyN") {
      skipTrack(1);
      return true;
    }
    if (event.shiftKey && event.code === "KeyP") {
      skipTrack(-1);
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

      if (panel && !event.target.closest(`.${PANEL_CLASS}, .${LAUNCHER_CLASS}, .${TOAST_CLASS}`)) {
        togglePanel(false);
      }

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
  // Wait until React has finished taking over the page before offering to resume.
  setTimeout(maybeOfferResume, RESUME_PROMPT_DELAY_MS);

  Object.defineProperty(globalThis, "__untitledRefinedInstalled", {
    configurable: true,
    value: true,
  });
})();
