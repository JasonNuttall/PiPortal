/**
 * Adapters translate a service's own API into the portal contract.
 *
 * They exist for software that cannot be changed to expose /portal/module
 * itself. Their output goes through the same validation as a native module's,
 * so an adapter gets no more trust than a third-party service does.
 */
const jellyfin = require("./jellyfin");

const ADAPTERS = {
  [jellyfin.id]: jellyfin,
};

const getAdapter = (id) => ADAPTERS[id] ?? null;

/** For the UI's adapter picker. */
const listAdapters = () =>
  Object.values(ADAPTERS).map(({ id, label }) => ({ id, label }));

module.exports = { ADAPTERS, getAdapter, listAdapters };
