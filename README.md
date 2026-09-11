# Untitled Refined

A lightweight Brave/Chrome extension that gives [untitled](https://untitled.stream) better project search and smoother interactions.

Untitled currently creates its in-project Fuse search with `shouldSort: false`. That means fuzzy matches are filtered correctly but left in their original project order. In a large project, a query such as `it's you` can therefore show dozens of weaker `you` matches before the exact song.

The extension reorders only the already-visible search results:

1. Exact normalized title
2. Title beginning with the full query
3. Full query at a word boundary
4. Full-query substring
5. All query words present
6. Remaining fuzzy matches

It treats straight and curly apostrophes, punctuation, case, whitespace, and accents consistently. Existing row elements are moved rather than recreated, so Untitled's play buttons and menus continue to work.

When ranking changes, the first visible results smoothly settle into place and a newly found exact match receives a brief emphasis pulse. Opening search also gets a quick, native-feeling transition. Motion is capped to 12 rows for large projects and disabled when the browser reports `prefers-reduced-motion: reduce`.

## Install

1. Open `brave://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Choose **Load unpacked**.
4. Select the cloned `untitled-refined` folder.
5. Reload any open `untitled.stream` tab.

Open a project, start **Search tracks**, and repeat the failing query. The exact title should now be first.

There is no build step and there are no dependencies.

## Privacy

The extension runs only on Untitled project-library URLs. It makes no network requests, stores no library data, requests no browser permissions, and sends no analytics.

## Compatibility

Untitled Refined supports Brave and other Chromium browsers using Manifest V3. Firefox packaging has not been verified.
