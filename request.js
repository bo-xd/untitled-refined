(function refineLibrarySearchRequests() {
  "use strict";

  if (globalThis.__untitledRefinedRequestInstalled) return;

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch) return;

  function normalizeQuery(value) {
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

  function getItemTitle(item) {
    return item?.title ?? item?.project?.title ?? item?.metadata?.title ?? "";
  }

  function getItemKey(item) {
    return [
      item?.type,
      item?.instance_id,
      item?.id,
      item?.slug,
      item?.project_slug,
      item?.project?.id,
      getItemTitle(item),
    ].join(":");
  }

  function itemScore(item, query) {
    const title = normalizeQuery(getItemTitle(item));
    if (title === query) return 0;
    if (title.startsWith(`${query} `)) return 100 + title.length - query.length;

    const phraseIndex = title.indexOf(query);
    if (phraseIndex >= 0) return 200 + phraseIndex + title.length - query.length;

    const terms = query.split(" ");
    if (terms.every((term) => title.includes(term))) {
      return 300 + Math.abs(title.length - query.length);
    }

    return 1_000;
  }

  function requestWithBody(request, body) {
    return new Request(request, {
      body: JSON.stringify(body),
      headers: new Headers(request.headers),
    });
  }

  function responseWithBody(response, body) {
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");

    return new Response(JSON.stringify(body), {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  async function readSearchResponse(request, body) {
    const response = await nativeFetch(requestWithBody(request, body));
    if (!response.ok) return { body: null, response };

    try {
      return { body: await response.clone().json(), response };
    } catch {
      return { body: null, response };
    }
  }

  async function refinedFetch(input, init) {
    let request;

    try {
      request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url, location.href);

      if (url.origin !== location.origin || url.pathname !== "/search" || request.method !== "POST") {
        return nativeFetch(input, init);
      }

      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return nativeFetch(input, init);

      const body = JSON.parse(await request.clone().text());
      if (!body || typeof body.query !== "string") return nativeFetch(input, init);

      const normalizedQuery = normalizeQuery(body.query);
      body.query = normalizedQuery;
      body.track_limit = Math.max(Number(body.track_limit) || 0, 50);

      const primary = await readSearchResponse(request, body);
      if (!primary.body || !Array.isArray(primary.body.items)) return primary.response;

      const hasExactMatch = primary.body.items.some(
        (item) => normalizeQuery(getItemTitle(item)) === normalizedQuery,
      );
      if (hasExactMatch) return primary.response;

      const fallbackTerms = [...new Set(normalizedQuery.split(" "))]
        .filter((term) => term.length >= 2)
        .slice(0, 4);
      if (fallbackTerms.length < 2) return primary.response;

      const fallbacks = await Promise.all(
        fallbackTerms.map(async (query) => {
          try {
            return await readSearchResponse(request, { ...body, query });
          } catch {
            return { body: null, response: null };
          }
        }),
      );
      const relevantFallbackItems = fallbacks
        .flatMap((fallback) => fallback.body?.items ?? [])
        .filter((item) => itemScore(item, normalizedQuery) < 1_000);
      const mergedItems = [
        ...primary.body.items,
        ...relevantFallbackItems,
      ];
      const uniqueItems = [...new Map(mergedItems.map((item) => [getItemKey(item), item])).values()];

      primary.body.items = uniqueItems
        .map((item, originalIndex) => ({
          item,
          originalIndex,
          score: itemScore(item, normalizedQuery),
        }))
        .sort((left, right) => left.score - right.score || left.originalIndex - right.originalIndex)
        .map(({ item }) => item);

      return responseWithBody(primary.response, primary.body);
    } catch {
      return nativeFetch(input, init);
    }
  }

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: refinedFetch,
  });

  Object.defineProperty(globalThis, "__untitledRefinedRequestInstalled", {
    configurable: true,
    value: true,
  });
})();
