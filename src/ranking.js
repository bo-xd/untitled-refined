(function exposeRanking(global) {
  "use strict";

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

  function rank(items, query, getTitle = (item) => item.title) {
    return items
      .map((item, originalIndex) => ({
        item,
        originalIndex,
        score: score(getTitle(item), query),
      }))
      .sort((left, right) => left.score - right.score || left.originalIndex - right.originalIndex)
      .map(({ item }) => item);
  }

  Object.defineProperty(global, "__untitledExactSearchRanking", {
    configurable: true,
    value: Object.freeze({ levenshtein, normalize, rank, score }),
  });
})(globalThis);
