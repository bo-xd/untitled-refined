# Untitled Exact Search

A small Brave/Chrome extension that makes exact song-title matches appear first when searching inside an [untitled] project.

Untitled currently creates its in-project Fuse search with `shouldSort: false`. That means fuzzy matches are filtered correctly but left in their original project order. In a large project, a query such as `it's you` can therefore show dozens of weaker `you` matches before the exact song.

This extension reorders only the already-visible search results:

1. Exact normalized title
2. Title beginning with the full query
3. Full query at a word boundary
4. Full-query substring
5. All query words present
6. Remaining fuzzy matches

It treats straight and curly apostrophes, punctuation, case, whitespace, and accents consistently. Existing row elements are moved rather than recreated, so Untitled's play buttons and menus continue to work.

When ranking changes, the first visible results smoothly settle into place and a newly found exact match receives one brief emphasis pulse. Motion is capped to 12 rows for large projects and is disabled when the browser reports `prefers-reduced-motion: reduce`.

Opening project search also transitions the native field into place with a short expand-and-focus movement while the native **Done** control settles alongside it. The extension animates Untitled's existing elements, so autofocus and keyboard behavior stay unchanged.

## Install in Brave

1. Open `brave://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Choose **Load unpacked**.
4. Select this folder: `/home/bo/Coding/untitled-exact-search`
5. Reload any open `untitled.stream` tab.

Open a project, start **Search tracks**, and repeat the failing query. The exact title should now be first.

## Development

There is no build step and there are no runtime dependencies.

```sh
npm test
npm run check
```

After changing a source file, use **Reload** on the extension page and refresh Untitled.

## Privacy

The extension runs only on Untitled project-library URLs. It does not make network requests, store library data, request browser permissions, or send analytics. See [PRIVACY.md](PRIVACY.md).

## Compatibility

The first supported target is Brave and other Chromium browsers using Manifest V3. The ranking code is browser-standard JavaScript, but Firefox packaging has not yet been verified.
