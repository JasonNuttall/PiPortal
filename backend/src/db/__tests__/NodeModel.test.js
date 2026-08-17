import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { initDatabase, setDb } = require("../database");
const NodeModel = require("../NodeModel");

let db;

beforeEach(() => {
  db = initDatabase(":memory:", {
    seed: false,
    localNode: { id: "pi5", name: "Raspberry Pi 5" },
  });
  setDb(db);
});

afterEach(() => {
  setDb(null);
  db.close();
});

describe("NodeModel", () => {
  it("returns the hub's own machine as the local node", () => {
    const local = NodeModel.getLocal();
    expect(local).toMatchObject({ id: "pi5", isLocal: true, url: null });
  });

  it("registers an agent", () => {
    const node = NodeModel.create({
      id: "jelly",
      name: "Jelly",
      url: "http://jelly:3001",
    });

    expect(node).toMatchObject({
      id: "jelly",
      name: "Jelly",
      url: "http://jelly:3001",
      isLocal: false,
      enabled: true,
    });
  });

  it("lists the local node first", () => {
    NodeModel.create({ id: "aaa", name: "Aaa", url: "http://a:3001" });
    expect(NodeModel.getAll().map((n) => n.id)).toEqual(["pi5", "aaa"]);
  });

  it("never exposes a stored token in node output", () => {
    const node = NodeModel.create({
      id: "jelly",
      name: "Jelly",
      url: "http://jelly:3001",
      token: "s3cret",
    });

    expect(node.token).toBeUndefined();
    expect(node.hasToken).toBe(true);
    // The hub still needs it internally to authenticate.
    expect(NodeModel.getToken("jelly")).toBe("s3cret");
  });

  it("keeps the existing token when an update omits it", () => {
    NodeModel.create({
      id: "jelly",
      name: "Jelly",
      url: "http://jelly:3001",
      token: "s3cret",
    });

    NodeModel.update("jelly", { name: "Jelly Renamed" });

    expect(NodeModel.getToken("jelly")).toBe("s3cret");
    expect(NodeModel.getById("jelly").name).toBe("Jelly Renamed");
  });

  it("clears the token when one is explicitly passed as null", () => {
    NodeModel.create({
      id: "jelly",
      name: "Jelly",
      url: "http://jelly:3001",
      token: "s3cret",
    });

    NodeModel.update("jelly", { token: null });
    expect(NodeModel.getToken("jelly")).toBeNull();
  });

  it("can disable a node without deleting it", () => {
    NodeModel.create({ id: "jelly", name: "Jelly", url: "http://jelly:3001" });
    NodeModel.update("jelly", { enabled: false });

    expect(NodeModel.getById("jelly").enabled).toBe(false);
    expect(NodeModel.getAll({ enabledOnly: true }).map((n) => n.id)).toEqual([
      "pi5",
    ]);
  });

  it("refuses to give the local node a URL", () => {
    NodeModel.update("pi5", { name: "Pi", url: "http://somewhere:3001" });
    expect(NodeModel.getById("pi5").url).toBeNull();
  });

  it("deletes a remote node", () => {
    NodeModel.create({ id: "jelly", name: "Jelly", url: "http://jelly:3001" });
    NodeModel.delete("jelly");
    expect(NodeModel.getById("jelly")).toBeUndefined();
  });

  it("will not delete the local node", () => {
    NodeModel.delete("pi5");
    expect(NodeModel.getById("pi5")).toBeDefined();
  });

  it("returns undefined when updating a node that does not exist", () => {
    expect(NodeModel.update("ghost", { name: "X" })).toBeNull();
  });
});
