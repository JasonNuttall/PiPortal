import { createRequire } from "module";
const require = createRequire(import.meta.url);

const {
  normalizeModulePayload,
  collectImageUrls,
  ContractError,
  SHAPE_VIEWS,
  LIMITS,
} = require("../contract");

const payload = (overrides = {}) => ({ contract: 1, id: "m", ...overrides });

describe("contract version", () => {
  it("accepts the current version", () => {
    expect(normalizeModulePayload(payload()).contract).toBe(1);
  });

  it("rejects a payload from a newer portal contract", () => {
    expect(() => normalizeModulePayload(payload({ contract: 2 }))).toThrow(
      ContractError
    );
  });

  it("rejects a payload with no version", () => {
    expect(() => normalizeModulePayload({ id: "m" })).toThrow(ContractError);
  });

  it("rejects a non-object payload", () => {
    for (const bad of [null, "nope", [], 7]) {
      expect(() => normalizeModulePayload(bad)).toThrow(ContractError);
    }
  });
});

describe("ttl", () => {
  it("keeps a sensible value", () => {
    expect(normalizeModulePayload(payload({ ttl: 300 })).ttl).toBe(300);
  });

  it("clamps values a service should not be trusted with", () => {
    expect(normalizeModulePayload(payload({ ttl: 0 })).ttl).toBe(5);
    expect(normalizeModulePayload(payload({ ttl: 99999 })).ttl).toBe(3600);
  });

  it("defaults when absent", () => {
    expect(normalizeModulePayload(payload()).ttl).toBe(60);
  });
});

describe("shapes", () => {
  it("keeps a metric and its tone", () => {
    const result = normalizeModulePayload(
      payload({
        datasets: [
          { id: "missing", label: "Missing", shape: "metric", value: 7, tone: "warn" },
        ],
      })
    );

    expect(result.datasets[0]).toMatchObject({
      id: "missing",
      shape: "metric",
      value: 7,
      tone: "warn",
    });
  });

  it("drops a metric with no usable number", () => {
    const result = normalizeModulePayload(
      payload({ datasets: [{ shape: "metric", value: "lots" }] })
    );
    expect(result.datasets).toEqual([]);
  });

  it("drops an unknown shape rather than rendering it", () => {
    const result = normalizeModulePayload(
      payload({ datasets: [{ shape: "sankey", value: 1 }] })
    );
    expect(result.datasets).toEqual([]);
  });

  it("advertises the views each shape supports", () => {
    const result = normalizeModulePayload(
      payload({ datasets: [{ shape: "schedule", items: [] }] })
    );
    expect(result.datasets[0].views).toEqual(SHAPE_VIEWS.schedule);
  });

  it("ignores a suggested view the shape cannot render", () => {
    const result = normalizeModulePayload(
      payload({ datasets: [{ shape: "collection", suggests: "calendar", items: [] }] })
    );
    expect(result.datasets[0].suggests).toBeNull();
  });

  it("keeps a legal suggestion", () => {
    const result = normalizeModulePayload(
      payload({ datasets: [{ shape: "schedule", suggests: "calendar", items: [] }] })
    );
    expect(result.datasets[0].suggests).toBe("calendar");
  });
});

describe("items", () => {
  const withItems = (items, shape = "collection") =>
    normalizeModulePayload(payload({ datasets: [{ shape, items }] })).datasets[0]
      .items;

  it("keeps the fixed vocabulary", () => {
    const [item] = withItems([
      {
        id: "a",
        title: "Severance",
        subtitle: "S02E07",
        meta: "Fri",
        image: "https://img.example/p.jpg",
        href: "https://example/s",
        tone: "ok",
      },
    ]);

    expect(item).toMatchObject({
      id: "a",
      title: "Severance",
      subtitle: "S02E07",
      meta: "Fri",
      tone: "ok",
    });
  });

  it("drops fields outside the vocabulary", () => {
    // A field only one view understands is a field that vanishes on switch.
    const [item] = withItems([{ title: "X", posterColour: "#fff", rank: 3 }]);
    expect(item).not.toHaveProperty("posterColour");
    expect(item).not.toHaveProperty("rank");
  });

  it("drops an item with no title", () => {
    expect(withItems([{ subtitle: "orphan" }])).toEqual([]);
  });

  it("gives an item without an id a stable fallback", () => {
    expect(withItems([{ title: "X" }])[0].id).toBe("item-0");
  });

  it("requires a date on a schedule entry", () => {
    const items = withItems(
      [
        { title: "Dated", date: "2026-08-21" },
        { title: "Undated" },
      ],
      "schedule"
    );
    expect(items.map((i) => i.title)).toEqual(["Dated"]);
  });

  it("rejects an unparseable date", () => {
    expect(withItems([{ title: "X", date: "someday" }], "schedule")).toEqual([]);
  });

  it("keeps dates on a collection but does not require them", () => {
    expect(withItems([{ title: "X" }])).toHaveLength(1);
  });

  it("caps the number of items", () => {
    const many = Array.from({ length: LIMITS.items + 50 }, (_, i) => ({
      title: `Item ${i}`,
    }));
    expect(withItems(many)).toHaveLength(LIMITS.items);
  });

  it("truncates overlong text", () => {
    const [item] = withItems([{ title: "x".repeat(1000) }]);
    expect(item.title.length).toBe(LIMITS.text);
  });

  it("keeps detail pairs and drops incomplete ones", () => {
    const [item] = withItems([
      {
        title: "X",
        detail: [
          { label: "Network", value: "Apple TV+" },
          { label: "", value: "orphan" },
          { value: "no label" },
        ],
      },
    ]);
    expect(item.detail).toEqual([{ label: "Network", value: "Apple TV+" }]);
  });
});

describe("urls", () => {
  const hrefOf = (href) =>
    normalizeModulePayload(
      payload({ datasets: [{ shape: "collection", items: [{ title: "X", href }] }] })
    ).datasets[0].items[0].href;

  it("keeps http and https", () => {
    expect(hrefOf("http://jelly:3014/x")).toContain("http://jelly:3014");
    expect(hrefOf("https://example.com/x")).toContain("https://example.com");
  });

  it("rejects a javascript: url", () => {
    // eslint-disable-next-line no-script-url
    expect(hrefOf("javascript:alert(1)")).toBeNull();
  });

  it("rejects a data: url", () => {
    expect(hrefOf("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects a file: url", () => {
    expect(hrefOf("file:///etc/passwd")).toBeNull();
  });

  it("rejects nonsense", () => {
    expect(hrefOf("not a url")).toBeNull();
  });
});

describe("collectImageUrls", () => {
  it("gathers every image a payload references", () => {
    const normalized = normalizeModulePayload(
      payload({
        datasets: [
          {
            shape: "collection",
            items: [
              { title: "A", image: "https://img/a.jpg" },
              { title: "B", image: "https://img/b.jpg" },
              { title: "C" },
            ],
          },
        ],
      })
    );

    const urls = collectImageUrls(normalized);
    expect(urls.size).toBe(2);
    expect(urls.has("https://img/a.jpg")).toBe(true);
  });

  it("returns an empty set for a payload with no images", () => {
    expect(collectImageUrls({ datasets: [] }).size).toBe(0);
  });
});

describe("payload level fields", () => {
  it("defaults status to ok and rejects an invented one", () => {
    expect(normalizeModulePayload(payload()).status).toBe("ok");
    expect(normalizeModulePayload(payload({ status: "onfire" })).status).toBe("ok");
  });

  it("caps the number of datasets", () => {
    const many = Array.from({ length: LIMITS.datasets + 5 }, (_, i) => ({
      id: `d${i}`,
      shape: "metric",
      value: i,
    }));
    expect(normalizeModulePayload(payload({ datasets: many })).datasets).toHaveLength(
      LIMITS.datasets
    );
  });

  it("tolerates datasets being absent or malformed", () => {
    expect(normalizeModulePayload(payload({ datasets: "nope" })).datasets).toEqual([]);
    expect(normalizeModulePayload(payload()).datasets).toEqual([]);
  });
});
