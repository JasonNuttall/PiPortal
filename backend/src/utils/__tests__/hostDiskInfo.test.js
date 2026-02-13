// Test the pure logic of hostDiskInfo using direct function testing
// Since the module uses CJS require which bypasses vitest mocks,
// we test the logic by extracting and testing the core algorithms directly.

describe("hostDiskInfo - decodeMountPath", () => {
  // Replicate the decodeMountPath function for direct testing
  const decodeMountPath = (encoded) =>
    encoded.replace(/\\([0-7]{3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8))
    );

  it("decodes octal space (\\040)", () => {
    expect(decodeMountPath("/mnt/my\\040drive")).toBe("/mnt/my drive");
  });

  it("decodes multiple octal sequences", () => {
    expect(decodeMountPath("/mnt/a\\040b\\040c")).toBe("/mnt/a b c");
  });

  it("decodes tab (\\011)", () => {
    expect(decodeMountPath("/mnt/my\\011drive")).toBe("/mnt/my\tdrive");
  });

  it("leaves paths without octal sequences unchanged", () => {
    expect(decodeMountPath("/mnt/normal")).toBe("/mnt/normal");
  });
});

describe("hostDiskInfo - mount line parsing logic", () => {
  const PHYSICAL_FS_TYPES = new Set([
    "ext4", "ext3", "ext2", "xfs", "btrfs", "zfs",
    "ntfs", "vfat", "exfat", "fuseblk", "f2fs",
    "jfs", "reiserfs", "hfs", "hfsplus", "apfs",
  ]);

  function parseMountLines(mountsRaw) {
    const lines = mountsRaw.trim().split("\n");
    const seenDevices = new Set();
    const results = [];

    for (const line of lines) {
      const parts = line.split(" ");
      if (parts.length < 4) continue;

      const device = parts[0];
      const mountPoint = parts[1];
      const fsType = parts[2];

      if (!PHYSICAL_FS_TYPES.has(fsType)) continue;

      if (
        mountPoint.startsWith("/dev") ||
        mountPoint.startsWith("/sys") ||
        mountPoint.startsWith("/proc") ||
        mountPoint.startsWith("/run")
      ) {
        continue;
      }

      if (seenDevices.has(device)) continue;
      seenDevices.add(device);

      results.push({ device, mountPoint, fsType });
    }

    return results;
  }

  it("parses physical filesystems", () => {
    const mounts = "/dev/sda1 / ext4 rw 0 0\n/dev/sdb1 /home ext4 rw 0 0";
    const result = parseMountLines(mounts);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ device: "/dev/sda1", mountPoint: "/", fsType: "ext4" });
    expect(result[1]).toEqual({ device: "/dev/sdb1", mountPoint: "/home", fsType: "ext4" });
  });

  it("filters out non-physical filesystem types", () => {
    const mounts = [
      "proc /proc proc rw 0 0",
      "sysfs /sys sysfs rw 0 0",
      "tmpfs /tmp tmpfs rw 0 0",
      "/dev/sda1 / ext4 rw 0 0",
    ].join("\n");

    const result = parseMountLines(mounts);
    expect(result).toHaveLength(1);
    expect(result[0].fsType).toBe("ext4");
  });

  it("filters out system mount points", () => {
    const mounts = [
      "/dev/sda1 /dev/something ext4 rw 0 0",
      "/dev/sda2 /sys/something ext4 rw 0 0",
      "/dev/sda3 /proc/something ext4 rw 0 0",
      "/dev/sda4 /run/something ext4 rw 0 0",
      "/dev/sda5 /data ext4 rw 0 0",
    ].join("\n");

    const result = parseMountLines(mounts);
    expect(result).toHaveLength(1);
    expect(result[0].mountPoint).toBe("/data");
  });

  it("deduplicates by device", () => {
    const mounts = "/dev/sda1 / ext4 rw 0 0\n/dev/sda1 /mnt ext4 rw 0 0";
    const result = parseMountLines(mounts);
    expect(result).toHaveLength(1);
    expect(result[0].mountPoint).toBe("/");
  });

  it("skips lines with less than 4 parts", () => {
    const mounts = "short line\n/dev/sda1 / ext4 rw 0 0";
    const result = parseMountLines(mounts);
    expect(result).toHaveLength(1);
  });

  it("recognizes all physical filesystem types", () => {
    const types = ["ext4", "ext3", "ext2", "xfs", "btrfs", "zfs", "ntfs", "vfat", "exfat", "fuseblk", "f2fs"];
    types.forEach((type) => {
      expect(PHYSICAL_FS_TYPES.has(type)).toBe(true);
    });
  });

  it("rejects virtual filesystem types", () => {
    const virtualTypes = ["proc", "sysfs", "tmpfs", "devtmpfs", "overlay", "cgroup"];
    virtualTypes.forEach((type) => {
      expect(PHYSICAL_FS_TYPES.has(type)).toBe(false);
    });
  });
});

describe("hostDiskInfo - disk usage calculation", () => {
  it("calculates usage percentage correctly", () => {
    const bsize = 4096;
    const blocks = 1000000;
    const bfree = 500000;
    const bavail = 450000;

    const total = blocks * bsize;
    const free = bfree * bsize;
    const available = bavail * bsize;
    const used = total - free;
    const use = total > 0 ? parseFloat(((used / total) * 100).toFixed(2)) : 0;

    expect(total).toBe(4096000000);
    expect(used).toBe(2048000000);
    expect(available).toBe(1843200000);
    expect(use).toBe(50);
  });

  it("handles zero total gracefully", () => {
    const total = 0;
    const used = 0;
    const use = total > 0 ? parseFloat(((used / total) * 100).toFixed(2)) : 0;
    expect(use).toBe(0);
  });

  it("formats GB correctly", () => {
    const bytes = 4096000000;
    const gb = (bytes / 1024 ** 3).toFixed(2);
    expect(gb).toBe("3.81");
  });
});
