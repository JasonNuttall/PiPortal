import { useEffect } from "react";

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Keyboard node switching: 1-9 jump to a node, [ and ] step through them.
 *
 * Ignored while typing, and while a modal is open, so the shortcuts never
 * fight with a form.
 */
export function useNodeShortcuts(nodes, selectedId, selectNode, enabled = true) {
  useEffect(() => {
    if (!enabled || nodes.length === 0) return undefined;

    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key >= "1" && event.key <= "9") {
        const node = nodes[Number(event.key) - 1];
        if (node) {
          event.preventDefault();
          selectNode(node.id);
        }
        return;
      }

      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const index = nodes.findIndex((node) => node.id === selectedId);
        const step = event.key === "]" ? 1 : -1;
        const next = nodes[(index + step + nodes.length) % nodes.length];
        if (next) selectNode(next.id);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [nodes, selectedId, selectNode, enabled]);
}

export default useNodeShortcuts;
