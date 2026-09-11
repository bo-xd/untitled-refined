(function installUntitledRefined() {
  "use strict";

  if (globalThis.__untitledRefinedInstalled) return;

  const SEARCH_INPUT_SELECTOR = 'input[placeholder="Search tracks"]';
  const TRACK_ROW_SELECTOR = 'li[data-testid="project-detail-track"]';
  const TRACK_BUTTON_SELECTOR = '[data-testid="project-detail-track-button"]';
  const SELECTED_ROW_ATTRIBUTE = "data-untitled-refined-selected";
  const STYLE_ID = "untitled-refined-styles";
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

  function rank(items, query, getTitle) {
    return items
      .map((item, originalIndex) => ({
        item,
        originalIndex,
        score: score(getTitle(item), query),
      }))
      .sort((left, right) => left.score - right.score || left.originalIndex - right.originalIndex)
      .map(({ item }) => item);
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

      @media (prefers-reduced-motion: reduce) {
        ${TRACK_ROW_SELECTOR}[${SELECTED_ROW_ATTRIBUTE}="true"] {
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

  function applyRanking() {
    scheduled = false;
    if (isApplying) return;

    const input = getSearchInput();
    const query = input?.value?.trim() ?? "";
    if (!input || !query) {
      lastExactKey = null;
      return;
    }

    const rows = getTrackRows();
    const list = getTrackList(rows);
    if (!list || rows.length < 2) return;

    const rankedRows = rank(rows, query, getTitle);
    const needsReorder = rankedRows.some((row, index) => row !== rows[index]);
    const exactRow = rankedRows.find((row) => score(getTitle(row), query) === 0) ?? null;
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
      }

      rankedRows.forEach(updateDisplayedIndex);
      input.dataset.untitledRefinedActive = "true";
      input.title = "Exact title matches are ranked first";
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
      const input = getSearchInput();
      if (!input || event.isComposing) return;

      const rows = getTrackRows();
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
      const row = event.target instanceof Element ? event.target.closest(TRACK_ROW_SELECTOR) : null;
      if (row) selectTrackRow(row, { scroll: false });
    },
    true,
  );

  installStyles();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  animateSearchEntrance();
  animateProjectEntrance();
  scheduleRanking();

  Object.defineProperty(globalThis, "__untitledRefinedInstalled", {
    configurable: true,
    value: true,
  });
})();
