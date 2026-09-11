# Design System

## Overview

Untitled Exact Search has no extension-owned visual surface. It improves ordering inside [untitled]'s existing product UI and deliberately inherits that interface unchanged.

## Visual Theme

Native [untitled], in both light and dark themes. The extension adds no panels, cards, badges, icons, colors, fonts, borders, shadows, or motion.

## Interaction

- Search remains in Untitled's existing `Search tracks` field.
- Existing result rows are reordered in place.
- Existing play, menu, hover, focus, and keyboard behaviors remain attached to their original DOM nodes.
- Visible result numbers are updated to match the improved order.

## Accessibility

- Preserve the host application's HTML semantics and accessible names.
- Add no keyboard traps or new tab stops.
- Add no animation.
- Do not communicate result quality through color alone.
