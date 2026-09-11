(function installUntitledExactSearch() {
  "use strict";

  if (globalThis.__untitledExactSearchInstalled) return;

  const ranking = globalThis.__untitledExactSearchRanking;
  if (!ranking) return;

  const SEARCH_INPUT_SELECTOR = 'input[placeholder="Search tracks"]';
  const TRACK_ROW_SELECTOR = 'li[data-testid="project-detail-track"]';
  const TRACK_BUTTON_SELECTOR = '[data-testid="project-detail-track-button"]';

  let scheduled = false;
  let isApplying = false;

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

  function applyRanking() {
    scheduled = false;
    if (isApplying) return;

    const input = getSearchInput();
    const query = input?.value?.trim() ?? "";
    if (!input || !query) return;

    const rows = Array.from(document.querySelectorAll(TRACK_ROW_SELECTOR));
    const list = getTrackList(rows);
    if (!list || rows.length < 2) return;

    const rankedRows = ranking.rank(rows, query, getTitle);
    const needsReorder = rankedRows.some((row, index) => row !== rows[index]);

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
