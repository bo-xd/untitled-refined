# Design System

## Overview

Untitled Exact Search has no extension-owned visual surface. It improves ordering inside [untitled]'s existing product UI and deliberately inherits that interface unchanged.

## Visual Theme

Native [untitled], in both light and dark themes. The extension adds no panels, cards, badges, icons, colors, fonts, borders, or shadows.

## Interaction

- Search remains in Untitled's existing `Search tracks` field.
- Existing result rows are reordered in place.
- Existing play, menu, hover, focus, and keyboard behaviors remain attached to their original DOM nodes.
- Visible result numbers are updated to match the improved order.

## Motion

- Reordered rows use a FLIP-style translate and opacity settle lasting 240ms with ease-out-quart timing.
- A newly resolved exact match receives one restrained 420ms brightness-and-scale emphasis.
- Animated travel is capped at 44px, even when a result moves hundreds of rows.
- At most the first 12 ranked rows animate, keeping large-project search responsive.
- In-flight motion is cancelled and replaced when the user types again.
- `prefers-reduced-motion: reduce` disables all extension motion while preserving instant ranking.

## Accessibility

- Preserve the host application's HTML semantics and accessible names.
- Add no keyboard traps or new tab stops.
- Disable animation for reduced-motion users without delaying or weakening the ranking update.
- Do not communicate result quality through color alone.
