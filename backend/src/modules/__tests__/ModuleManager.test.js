import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { initDatabase, setDb } = require("../../db/database");
const ModuleModel = require("../../db/ModuleModel");
const ModuleManager = require("../ModuleManager");
const { parseModuleChannel, moduleChannel } = require("../ModuleManager");

let db;
let manager;

const payload = (overrides = {}) => ({
  contract: 1,
  id: "missedanep",
  title: "Missed an Ep",
  ttl: 5,
  datasets: [{ id: "missing", shape: "metric", value: 7 }],
  ...overrides,
});

/** Replace a client's network call without touching the manager's wiring. */
const stubFetch = (id, impl) => {
  const client = manager.getClient(id);
  client.fetch = vi.fn(impl);
  return client.fetch;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  db = initDatabase(":memory:", {
    seed: false,
    localNode: { id: "pi5", name: "Pi" },
  });
  setDb(db);
  ModuleModel.create({
    id: "missedanep",
    name: "Missed an Ep",
    kind: "native",
    url: "http://jelly:3014",
  });
  manager = new ModuleManager();
  manager.start();
});

afterEach(() => {
  manager.stop();
  setDb(null);
  db.close();
});

describe("channel names", () => {
  it("round-trips", () => {
    expect(parseModuleChannel(moduleChannel("missedanep"))).toBe("missedanep");
  });

  it("ignores channels belonging to something else", () => {
    expect(parseModuleChannel("node:jelly:metrics:system")).toBeNull();
    expect(parseModuleChannel("fleet")).toBeNull();
  });
});

describe("demand", () => {
  it("collects nothing until something subscribes", async () => {
    const fetchFn = stubFetch("missedanep", async () => payload());
    await settle();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("collects once subscribed", async () => {
    const fetchFn = stubFetch("missedanep", async () => payload());
    manager.setDemand(["module:missedanep"]);
    await settle();
    expect(fetchFn).toHaveBeenCalled();
  });

  it("stops when the last subscriber leaves", async () => {
    const fetchFn = stubFetch("missedanep", async () => payload({ ttl: 5 }));
    manager.setDemand(["module:missedanep"]);
    await settle();
    const callsWhileWatched = fetchFn.mock.calls.length;

    manager.setDemand([]);
    await settle();

    expect(fetchFn.mock.calls.length).toBe(callsWhileWatched);
  });

  it("ignores demand for channels it does not own", () => {
    manager.setDemand(["node:jelly:metrics:system", "fleet"]);
    expect(manager.desired.size).toBe(0);
  });
});

describe("collection", () => {
  it("emits the payload on its channel", async () => {
    stubFetch("missedanep", async () => payload());
    const seen = [];
    manager.on("data", (channel, data) => seen.push([channel, data]));

    manager.setDemand(["module:missedanep"]);
    await settle();

    const entry = seen.find(([c]) => c === "module:missedanep");
    expect(entry[1].datasets[0].value).toBe(7);
  });

  it("caches the last payload for a new subscriber", async () => {
    stubFetch("missedanep", async () => payload());
    manager.setDemand(["module:missedanep"]);
    await settle();

    expect(manager.peek("module:missedanep").data.title).toBe("Missed an Ep");
  });

  it("emits an error payload rather than going silent on failure", async () => {
    stubFetch("missedanep", async () => {
      throw new Error("ECONNREFUSED");
    });
    const seen = [];
    manager.on("data", (channel, data) => seen.push([channel, data]));

    manager.setDemand(["module:missedanep"]);
    await settle();

    const entry = seen.find(([c]) => c === "module:missedanep");
    expect(entry[1]).toMatchObject({ status: "error", error: "ECONNREFUSED" });
  });

  it("backs off a module that keeps failing", async () => {
    const fetchFn = stubFetch("missedanep", async () => {
      throw new Error("down");
    });
    manager.setDemand(["module:missedanep"]);
    await settle();

    // The first retry is scheduled seconds out, not immediately, so a dead
    // service is not hammered.
    const callsAfterFirstFailure = fetchFn.mock.calls.length;
    await settle();
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirstFailure);
  });
});

describe("registry changes", () => {
  it("validates channels against what is registered", () => {
    expect(manager.isValidChannel("module:missedanep")).toBe(true);
    expect(manager.isValidChannel("modules")).toBe(true);
    expect(manager.isValidChannel("module:ghost")).toBe(false);
  });

  it("picks up a newly registered module", () => {
    ModuleModel.create({ id: "nas", name: "NAS", kind: "link", url: "http://nas" });
    manager.reconcile();
    expect(manager.getClient("nas")).toBeDefined();
  });

  it("drops a deleted module and forgets its data", async () => {
    stubFetch("missedanep", async () => payload());
    manager.setDemand(["module:missedanep"]);
    await settle();

    ModuleModel.delete("missedanep");
    manager.reconcile();

    expect(manager.getClient("missedanep")).toBeUndefined();
    expect(manager.peek("module:missedanep")).toBeUndefined();
  });

  it("drops a disabled module", () => {
    ModuleModel.update("missedanep", { enabled: false });
    manager.reconcile();
    expect(manager.getClient("missedanep")).toBeUndefined();
  });

  it("rebuilds the client when the URL changes", () => {
    const original = manager.getClient("missedanep");
    ModuleModel.update("missedanep", { url: "http://elsewhere:3014" });
    manager.reconcile();
    expect(manager.getClient("missedanep")).not.toBe(original);
  });

  it("keeps the client when only the name changes", () => {
    const original = manager.getClient("missedanep");
    ModuleModel.update("missedanep", { name: "Renamed" });
    manager.reconcile();
    expect(manager.getClient("missedanep")).toBe(original);
  });
});

describe("link modules", () => {
  it("needs no network call", async () => {
    ModuleModel.create({
      id: "portainer",
      name: "Portainer",
      kind: "link",
      url: "http://jelly:9443",
      icon: "P",
    });
    manager.reconcile();

    const result = await manager.getClient("portainer").fetch();

    expect(result).toMatchObject({
      kind: "link",
      title: "Portainer",
      href: "http://jelly:9443",
      datasets: [],
    });
  });
});
