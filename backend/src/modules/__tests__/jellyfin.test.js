import { createRequire } from "module";
const require = createRequire(import.meta.url);

const jellyfin = require("../adapters/jellyfin");
const { getAdapter, listAdapters } = require("../adapters");
const { normalizeModulePayload } = require("../contract");

/** Shapes taken from a real Jellyfin 10.11 server. */
const COUNTS = { MovieCount: 214, SeriesCount: 37, EpisodeCount: 1893 };

const SESSIONS = [
  {
    Id: "sess1",
    UserName: "redrosid",
    DeviceName: "Living Room TV",
    Client: "Jellyfin Android TV",
    NowPlayingItem: {
      Id: "item1",
      Name: "The Expanse",
      SeriesName: "The Expanse",
      ImageTags: { Primary: "abc" },
    },
  },
  { Id: "sess2", UserName: "idle", DeviceName: "Firefox" },
];

const RECENT = {
  Items: [
    {
      Id: "m1",
      Name: "Dune: Part Two",
      Type: "Movie",
      ProductionYear: 2024,
      DateCreated: "2026-08-15T20:11:03.000Z",
      ImageTags: { Primary: "tag1" },
    },
    {
      Id: "s1",
      Name: "Episode 3",
      SeriesName: "Severance",
      Type: "Episode",
      ProductionYear: 2026,
      DateCreated: "2026-08-14T09:00:00.000Z",
      ImageTags: {},
    },
  ],
};

const run = (routes) =>
  jellyfin.fetch({
    url: "http://jelly:8096/",
    token: "abc123",
    request: async (url, options) => {
      const path = url.replace("http://jelly:8096", "");
      const key = Object.keys(routes).find((r) => path.startsWith(r));
      if (!key) throw new Error(`unexpected ${path}`);
      const value = routes[key];
      if (value instanceof Error) throw value;
      // Capture the headers the adapter chose to send.
      run.lastHeaders = options?.headers;
      return value;
    },
  });

describe("registry", () => {
  it("is registered under its id", () => {
    expect(getAdapter("jellyfin")).toBe(jellyfin);
  });

  it("is offered to the picker", () => {
    expect(listAdapters()).toContainEqual({ id: "jellyfin", label: "Jellyfin" });
  });

  it("returns null for an adapter that does not exist", () => {
    expect(getAdapter("plex")).toBeNull();
  });
});

describe("payload", () => {
  it("reports library counts as metrics", async () => {
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": [],
      "/Items?": RECENT,
    });

    const byId = Object.fromEntries(payload.datasets.map((d) => [d.id, d]));
    expect(byId.movies).toMatchObject({ shape: "metric", value: 214 });
    expect(byId.series).toMatchObject({ shape: "metric", value: 37 });
  });

  it("counts only sessions that are actually playing", async () => {
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": SESSIONS,
      "/Items?": RECENT,
    });

    const streams = payload.datasets.find((d) => d.id === "streams");
    expect(streams.value).toBe(1);
  });

  it("omits the streams list when nothing is playing", async () => {
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": [{ Id: "idle", UserName: "x" }],
      "/Items?": RECENT,
    });

    expect(payload.datasets.find((d) => d.id === "watching")).toBeUndefined();
    expect(payload.datasets.find((d) => d.id === "streams").value).toBe(0);
  });

  it("builds recently added as a dated schedule suggesting a grid", async () => {
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": [],
      "/Items?": RECENT,
    });

    const recent = payload.datasets.find((d) => d.id === "recent");
    expect(recent).toMatchObject({
      shape: "schedule",
      suggests: "grid",
      // Jellyfin returns a most-recent-N, not a range that can be paged.
      window: false,
    });
    expect(recent.items).toHaveLength(2);
    expect(recent.items[0]).toMatchObject({
      title: "Dune: Part Two",
      subtitle: "Film · 2024",
      date: "2026-08-15T20:11:03.000Z",
    });
  });

  it("titles an episode by its series", async () => {
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": [],
      "/Items?": RECENT,
    });

    const recent = payload.datasets.find((d) => d.id === "recent");
    expect(recent.items[1].title).toBe("Severance");
  });

  it("builds a poster URL with the image tag, and omits it when absent", async () => {
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": [],
      "/Items?": RECENT,
    });

    const recent = payload.datasets.find((d) => d.id === "recent");
    expect(recent.items[0].image).toBe(
      "http://jelly:8096/Items/m1/Images/Primary?maxHeight=450&tag=tag1"
    );
    expect(recent.items[1].image).toBeNull();
  });

  it("links an item back into Jellyfin's own UI", async () => {
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": [],
      "/Items?": RECENT,
    });

    const recent = payload.datasets.find((d) => d.id === "recent");
    expect(recent.items[0].href).toContain("/web/#/details?id=m1");
  });

  it("authenticates with the header Jellyfin expects, not a bearer token", async () => {
    await run({ "/Items/Counts": COUNTS, "/Sessions": [], "/Items?": RECENT });
    expect(run.lastHeaders).toMatchObject({ "X-Emby-Token": "abc123" });
  });
});

describe("degradation", () => {
  it("still reports what it can when one call fails", async () => {
    const payload = await run({
      "/Items/Counts": new Error("403"),
      "/Sessions": SESSIONS,
      "/Items?": RECENT,
    });

    expect(payload.status).toBe("warn");
    expect(payload.datasets.find((d) => d.id === "movies")).toBeUndefined();
    expect(payload.datasets.find((d) => d.id === "recent")).toBeDefined();
  });

  it("fails loudly when the server answers nothing at all", async () => {
    await expect(
      run({
        "/Items/Counts": new Error("ECONNREFUSED"),
        "/Sessions": new Error("ECONNREFUSED"),
        "/Items?": new Error("ECONNREFUSED"),
      })
    ).rejects.toThrow(/check the URL and API key/);
  });
});

describe("contract compliance", () => {
  it("produces a payload the portal accepts unchanged", async () => {
    // An adapter earns no more trust than a third-party service, so its output
    // goes through the same validation.
    const payload = await run({
      "/Items/Counts": COUNTS,
      "/Sessions": SESSIONS,
      "/Items?": RECENT,
    });

    const normalized = normalizeModulePayload(payload, { id: "jellyfin" });
    expect(normalized.datasets.map((d) => d.id)).toEqual(
      payload.datasets.map((d) => d.id)
    );
    expect(
      normalized.datasets.find((d) => d.id === "recent").items
    ).toHaveLength(2);
  });
});
