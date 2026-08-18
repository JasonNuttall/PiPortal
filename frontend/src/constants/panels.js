/**
 * The panel registry.
 *
 * Panels used to be a hardcoded map plus a two-column order literal, which
 * left nowhere for a panel discovered at runtime to go. They are data now, so
 * built-ins and modules are the same kind of thing to the layout.
 */

/**
 * Width a panel asks for.
 *
 * "banner" is not a column count — it claims the whole row whatever the
 * viewport is currently showing, which is what makes a strip of adapters
 * directly under the system stats possible.
 */
export const PANEL_SIZES = ["compact", "wide", "full", "banner"];

export const SIZE_SPAN = { compact: 1, wide: 2, full: 3, banner: Infinity };

/** Next size in the cycle, used by the size control in each panel header. */
export const nextSize = (size) =>
  PANEL_SIZES[(PANEL_SIZES.indexOf(size) + 1) % PANEL_SIZES.length];

/**
 * Panels the portal ships itself. `source` distinguishes them from modules,
 * which are appended to this list at runtime.
 */
export const BUILT_IN_PANELS = [
  { id: "services", title: "Quick Links", source: "builtin", defaultSize: "compact" },
  { id: "network", title: "Network", source: "builtin", defaultSize: "compact" },
  { id: "disk", title: "Disk", source: "builtin", defaultSize: "wide" },
  { id: "processes", title: "Processes", source: "builtin", defaultSize: "wide" },
  { id: "docker", title: "Docker", source: "builtin", defaultSize: "compact" },
];

export const BUILT_IN_PANEL_IDS = BUILT_IN_PANELS.map((panel) => panel.id);

/** A module becomes a panel with no special casing anywhere downstream. */
export const modulePanelId = (moduleId) => `module:${moduleId}`;

export const isModulePanel = (panelId) => panelId.startsWith("module:");

export const modulePanel = (module) => ({
  id: modulePanelId(module.id),
  title: module.name,
  source: "module",
  moduleId: module.id,
  // A module's natural width comes from what it reports; the registry only
  // needs a sane starting point before its first payload arrives.
  defaultSize: "compact",
});
