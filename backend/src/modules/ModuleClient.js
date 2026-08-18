/**
 * Fetches one module's payload.
 *
 * A native module is asked over HTTP; a link module has nothing to ask, so its
 * payload is synthesised. Requests can go out from the hub or be made by an
 * agent on the module's behalf, because a service may only be reachable from
 * one machine's network.
 */
const logger = require("../utils/logger");
const { normalizeModulePayload, collectImageUrls, ContractError } = require("./contract");
const { getAdapter } = require("./adapters");

const PORTAL_PATH = "/portal/module";

class ModuleClient {
  /**
   * @param {object} module - registry row
   * @param {object} options
   * @param {string|null} options.token
   * @param {number} options.timeoutMs
   * @param {(nodeId: string) => object|undefined} options.getNodeClient
   */
  constructor(module, { token = null, timeoutMs = 8000, getNodeClient = null } = {}) {
    this.module = module;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.getNodeClient = getNodeClient;
    /** URLs the last payload referenced, so the image proxy stays bounded. */
    this.allowedImages = new Set();
  }

  get id() {
    return this.module.id;
  }

  get endpoint() {
    const base = (this.module.url ?? "").replace(/\/+$/, "");
    return base.endsWith(PORTAL_PATH) ? base : `${base}${PORTAL_PATH}`;
  }

  /** A link has no endpoint; it is a name, an icon and a destination. */
  linkPayload() {
    return {
      contract: 1,
      id: this.module.id,
      title: this.module.name,
      href: this.module.url ?? null,
      status: "ok",
      ttl: 3600,
      datasets: [],
      kind: "link",
      icon: this.module.icon ?? null,
      category: this.module.category ?? null,
    };
  }

  async request(url, { params, headers = {} } = {}) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) {
        target.searchParams.set(key, String(value));
      }
    }

    // Routing through an agent lets the hub reach services it cannot see.
    if (this.module.via && this.module.via !== "hub") {
      const node = this.getNodeClient?.(this.module.via);
      if (!node?.request) {
        const err = new Error(`Node ${this.module.via} is not available`);
        err.statusCode = 502;
        throw err;
      }
      return node.request("/api/local/proxy", {
        method: "POST",
        body: { url: target.href, token: this.token },
      });
    }

    const response = await fetch(target.href, {
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        // An adapter may need the scheme its own service expects instead.
        ...headers,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const err = new Error(`Module responded ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }
    return response.json();
  }

  /**
   * @param {{from?: string, to?: string}} [window] - requested range for
   *   schedule datasets that declare support for it
   */
  async fetch(window = {}) {
    if (this.module.kind === "link") return this.linkPayload();

    const raw =
      this.module.kind === "adapter"
        ? await this.adapterPayload()
        : await this.request(this.endpoint, { params: window });
    const payload = normalizeModulePayload(raw, { id: this.module.id });

    this.allowedImages = collectImageUrls(payload);

    return { ...payload, kind: "native", title: payload.title ?? this.module.name };
  }

  /** Only images the module actually referenced may be proxied. */
  isAllowedImage(url) {
    return this.allowedImages.has(url);
  }

  /**
   * Run the configured adapter. Its output is validated exactly as a native
   * module's is — an adapter earns no extra trust for living in this repo.
   */
  async adapterPayload() {
    const adapter = getAdapter(this.module.adapter);
    if (!adapter) {
      throw new ContractError(`Unknown adapter: ${this.module.adapter}`);
    }
    return adapter.fetch({
      url: this.module.url,
      token: this.token,
      request: (url, options) => this.request(url, options),
    });
  }

  async probe() {
    const started = Date.now();
    if (this.module.kind === "link") {
      return { ok: true, latencyMs: 0, info: { kind: "link" } };
    }
    try {
      const payload = await this.fetch();
      return {
        ok: true,
        latencyMs: Date.now() - started,
        info: {
          title: payload.title,
          contract: payload.contract,
          datasets: payload.datasets.map((d) => ({
            id: d.id,
            label: d.label,
            shape: d.shape,
            views: d.views,
          })),
        },
      };
    } catch (err) {
      logger.debug({ err, module: this.id }, "Module probe failed");
      return {
        ok: false,
        error: err instanceof ContractError ? err.message : err.message,
      };
    }
  }
}

module.exports = ModuleClient;
