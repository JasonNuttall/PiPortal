import { createRequire } from "module";
const require = createRequire(import.meta.url);

const fs = require("fs");
const os = require("os");
const path = require("path");

const { collectDisk, decodeMountPath, PHYSICAL_FS_TYPES } = require("../disk");

let hostRoot;

/** Write a fake host mount table and create the directories it points at. */
const writeMounts = (entries) => {
  fs.mkdirSync(path.join(hostRoot, "proc", "1"), { recursive: true });
  const lines = entries.map(
    ({ device, mount, fsType, options = "rw,relatime" }) =>
      `${device} ${mount} ${fsType} ${options} 0 0`
  );
  fs.writeFileSync(
    path.join(hostRoot, "proc", "1", "mounts"),
    `${lines.join("\n")}\n`
  );

  for (const { mount } of entries) {
    // decodeMountPath handles the escaping the kernel applies to these.
    fs.mkdirSync(path.join(hostRoot, decodeMountPath(mount)), {
      recursive: true,
    });
  }
};

beforeEach(() => {
  hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hostfix-"));
});

afterEach(() => {
  fs.rmSync(hostRoot, { recursive: true, force: true });
});

describe("decodeMountPath", () => {
  it("decodes octal escapes used for spaces", () => {
    expect(decodeMountPath("/mnt/My\\040Drive")).toBe("/mnt/My Drive");
  });

  it("leaves ordinary paths untouched", () => {
    expect(decodeMountPath("/mnt/data")).toBe("/mnt/data");
  });
});

describe("PHYSICAL_FS_TYPES", () => {
  it("covers the filesystems a homelab actually mounts", () => {
    for (const type of ["ext4", "btrfs", "zfs", "xfs", "vfat", "ntfs"]) {
      expect(PHYSICAL_FS_TYPES.has(type)).toBe(true);
    }
  });

  it("excludes virtual filesystems", () => {
    for (const type of ["tmpfs", "overlay", "proc", "sysfs", "devtmpfs"]) {
      expect(PHYSICAL_FS_TYPES.has(type)).toBe(false);
    }
  });
});

describe("collectDisk", () => {
  it("reports physical mounts with usage figures", async () => {
    writeMounts([
      { device: "/dev/sda1", mount: "/", fsType: "ext4" },
      { device: "/dev/sdb1", mount: "/mnt/media", fsType: "btrfs" },
    ]);

    const disks = await collectDisk({ hostRoot });

    expect(disks.map((d) => d.mount).sort()).toEqual(["/", "/mnt/media"]);
    for (const disk of disks) {
      expect(disk.size).toBeGreaterThan(0);
      expect(disk.use).toBeGreaterThanOrEqual(0);
      expect(disk.use).toBeLessThanOrEqual(100);
      expect(Number(disk.sizeGB)).toBeGreaterThan(0);
    }
  });

  it("ignores virtual filesystems", async () => {
    writeMounts([
      { device: "/dev/sda1", mount: "/", fsType: "ext4" },
      { device: "tmpfs", mount: "/run/lock", fsType: "tmpfs" },
      { device: "proc", mount: "/proc", fsType: "proc" },
      { device: "overlay", mount: "/var/lib/docker/overlay2/x", fsType: "overlay" },
    ]);

    const disks = await collectDisk({ hostRoot });
    expect(disks.map((d) => d.mount)).toEqual(["/"]);
  });

  it("skips system mount points even on a physical filesystem", async () => {
    writeMounts([
      { device: "/dev/sda1", mount: "/", fsType: "ext4" },
      { device: "/dev/sda2", mount: "/run/user/1000", fsType: "ext4" },
    ]);

    const disks = await collectDisk({ hostRoot });
    expect(disks.map((d) => d.mount)).toEqual(["/"]);
  });

  it("deduplicates a device mounted more than once", async () => {
    writeMounts([
      { device: "/dev/sda1", mount: "/", fsType: "ext4" },
      { device: "/dev/sda1", mount: "/mnt/bind", fsType: "ext4" },
    ]);

    const disks = await collectDisk({ hostRoot });
    expect(disks).toHaveLength(1);
  });

  it("decodes escaped mount paths", async () => {
    writeMounts([
      { device: "/dev/sdc1", mount: "/mnt/My\\040Drive", fsType: "ext4" },
    ]);

    const disks = await collectDisk({ hostRoot });
    expect(disks[0].mount).toBe("/mnt/My Drive");
  });

  it("skips a mount that cannot be reached through the host root", async () => {
    fs.mkdirSync(path.join(hostRoot, "proc", "1"), { recursive: true });
    fs.writeFileSync(
      path.join(hostRoot, "proc", "1", "mounts"),
      "/dev/sda1 /nonexistent ext4 rw 0 0\n"
    );

    const disks = await collectDisk({ hostRoot });
    expect(disks).toEqual([]);
  });
});
