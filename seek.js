// Runs in the page's own JavaScript world (manifest "world": "MAIN") so it can reach the
// React props on Untitled's playbar scrubber. Synthetic DOM events don't move the
// scrubber, so this calls its handlers directly: onChange stores the seek position, and
// onMouseUp (read again after React re-renders) commits it.
(function installUntitledRefinedSeek() {
  "use strict";

  if (window.__untitledRefinedSeekInstalled) return;
  window.__untitledRefinedSeekInstalled = true;

  const reactProps = (element) => {
    const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
    return key ? element[key] : null;
  };

  const fakeEvent = (value) => {
    const target = { value: String(value) };
    return { target, currentTarget: target, preventDefault() {}, stopPropagation() {} };
  };

  window.addEventListener("untitled-refined:seek", async (event) => {
    const seconds = Number(event.detail);
    const range = document.querySelector("#playbar input[type=range]");
    if (!range || !Number.isFinite(seconds)) return;

    const props = reactProps(range);
    if (!props?.onChange) return;

    props.onMouseDown?.(fakeEvent(seconds));
    props.onChange(fakeEvent(seconds));
    await new Promise((resolve) => setTimeout(resolve, 150));
    (reactProps(range) ?? props).onMouseUp?.(fakeEvent(seconds));
  });
})();
