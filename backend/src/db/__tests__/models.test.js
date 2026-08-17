// Exercises the real ServiceModel against an in-memory database. The previous
// version reimplemented every query inline because the db singleton could not
// be swapped; database.js now exposes setDb for exactly this.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { initDatabase, setDb } = require("../database");
const ServiceModel = require("../models");

let db;

beforeEach(() => {
  db = initDatabase(":memory:", { seed: false });
  setDb(db);
});

afterEach(() => {
  setDb(null);
  db.close();
});

describe("ServiceModel", () => {
  it("creates and reads back a service", () => {
    const created = ServiceModel.create({
      name: "Jellyfin",
      url: "http://jelly:8096",
      icon: "M",
      category: "Media",
    });

    expect(created.id).toBeDefined();
    expect(ServiceModel.getById(created.id)).toMatchObject({
      name: "Jellyfin",
      url: "http://jelly:8096",
    });
  });

  it("defaults an omitted category to Other", () => {
    expect(ServiceModel.create({ name: "X", url: "http://x" }).category).toBe(
      "Other"
    );
  });

  it("stores a fleet-wide link with a null node_id", () => {
    expect(ServiceModel.create({ name: "X", url: "http://x" }).node_id).toBeNull();
  });

  it("scopes a link to a node when one is given", () => {
    const created = ServiceModel.create({
      name: "Jellyfin",
      url: "http://jelly:8096",
      nodeId: "jelly",
    });
    expect(created.node_id).toBe("jelly");
  });

  it("orders results by category then name", () => {
    ServiceModel.create({ name: "Zebra", url: "http://z", category: "Alpha" });
    ServiceModel.create({ name: "Apple", url: "http://a", category: "Alpha" });
    ServiceModel.create({ name: "Beta", url: "http://b", category: "Zulu" });

    expect(ServiceModel.getAll().map((s) => s.name)).toEqual([
      "Apple",
      "Zebra",
      "Beta",
    ]);
  });

  it("returns a node's own links plus the fleet-wide ones", () => {
    ServiceModel.create({ name: "Global", url: "http://g" });
    ServiceModel.create({ name: "OnJelly", url: "http://j", nodeId: "jelly" });
    ServiceModel.create({ name: "OnPi", url: "http://p", nodeId: "pi5" });

    expect(
      ServiceModel.getAll({ nodeId: "jelly" })
        .map((s) => s.name)
        .sort()
    ).toEqual(["Global", "OnJelly"]);
  });

  it("returns every link when no node is specified", () => {
    ServiceModel.create({ name: "Global", url: "http://g" });
    ServiceModel.create({ name: "OnJelly", url: "http://j", nodeId: "jelly" });
    expect(ServiceModel.getAll()).toHaveLength(2);
  });

  it("updates an existing service", () => {
    const created = ServiceModel.create({ name: "Old", url: "http://old" });
    expect(
      ServiceModel.update(created.id, {
        name: "New",
        url: "http://new",
        icon: "*",
        category: "Media",
        nodeId: "pi5",
      })
    ).toMatchObject({ name: "New", url: "http://new", node_id: "pi5" });
  });

  it("returns undefined when updating a missing id", () => {
    expect(ServiceModel.update(999, { name: "X", url: "http://x" })).toBeUndefined();
  });

  it("deletes a service", () => {
    const created = ServiceModel.create({ name: "Temp", url: "http://t" });
    ServiceModel.delete(created.id);
    expect(ServiceModel.getById(created.id)).toBeUndefined();
  });

  it("reports a clear error when no database is installed", () => {
    setDb(null);
    expect(() => ServiceModel.getAll()).toThrow(/not been initialised/i);
  });
});
