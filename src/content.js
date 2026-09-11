(function installUntitledExactSearch() {
  "use strict";

  if (globalThis.__untitledExactSearchInstalled) return;

  const ranking = globalThis.__untitledExactSearchRanking;
  if (!ranking) return;

  const SEARCH_INPUT_SELECTOR = 'input[placeholder="Search tracks"]';
  const TRACK_ROW_SELECTOR = 'li[data-testid="project-detail-track"]';
  const TRACK_BUTTON_SELECTOR = '[data-testid="project-detail-track-button"]';
  const MAX_ANIMATED_ROWS = 12;
  const MAX_TRAVEL_PX = 44;
  const MOVE_DURATION_MS = 240;
  const EXACT_DURATION_MS = 420;
  const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";

  let scheduled = false;
  let isApplying = false;
  let lastExactKey = null;
  const activeAnimations = new WeakMap();

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

  function stopAnimation(row) {
    const animation = activeAnimations.get(row);
    if (!animation) return;
    animation.cancel();
    activeAnimations.delete(row);
  }

  function playAnimation(row, keyframes, options) {
    stopAnimation(row);
    const animation = row.animate(keyframes, options);
    activeAnimations.set(row, animation);
    animation.addEventListener(
      "finish",
      () => {
        if (activeAnimations.get(row) === animation) activeAnimations.delete(row);
      },
      { once: true },
    );
    animation.addEventListener(
      "cancel",
      () => {
        if (activeAnimations.get(row) === animation) activeAnimations.delete(row);
      },
      { once: true },
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

    const rows = Array.from(document.querySelectorAll(TRACK_ROW_SELECTOR));
    const list = getTrackList(rows);
    if (!list || rows.length < 2) return;

    const rankedRows = ranking.rank(rows, query, getTitle);
    const needsReorder = rankedRows.some((row, index) => row !== rows[index]);
    const exactRow = rankedRows.find((row) => ranking.score(getTitle(row), query) === 0) ?? null;
    const exactKey = exactRow
      ? `${ranking.normalize(query)}:${exactRow.dataset.trackSlug ?? getTitle(exactRow)}`
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
      input.dataset.exactSearchActive = "true";
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
        scheduleRanking();
      }
    },
    true,
  );

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleRanking();

  Object.defineProperty(globalThis, "__untitledExactSearchInstalled", {
    configurable: true,
    value: true,
  });
})();
