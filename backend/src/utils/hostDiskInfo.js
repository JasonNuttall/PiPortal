/**
 * Host Disk Detection Utility
 *
 * Reads the host's mount table via /host/proc/1/mounts and uses fs.statfs()
 * on the bind-mounted host root (/host) to get real disk usage stats.
 * This allows universal detection of all host-mounted drives from within
 * a Docker container, without needing per-drive volume mounts.
 *
 * Requires:
 *   - /:/host:ro volume mount in docker-compose.yml
 *   - pid: "host" in docker-compose.yml (to read /host/proc/1/mounts)
 */
const fs = require("fs");
const { statfs } = require("fs/promises");
const path = require("path");

const HOST_ROOT = "/host";
const HOST_PROC_MOUNTS = "/host/proc/1/mounts";

// Physical filesystem types that represent real storage devices
const PHYSICAL_FS_TYPES = new Set([
  "ext4",
  "ext3",
  "ext2",
  "xfs",
  "btrfs",
  "zfs",
  "ntfs",
  "vfat",
  "exfat",
  "fuseblk",
  "f2fs",
  "jfs",
  "reiserfs",
  "hfs",
  "hfsplus",
  "apfs",
]);

// Decode octal escapes in /proc/mounts paths (e.g., \040 for space)
function decodeMountPath(encoded) {
  return encoded.replace(/\\([0-7]{3})/g, (_, oct) =>
    String.fromCharCode(parseInt(oct, 8))
  );
}

/**
 * Get disk info for all physical drives mounted on the host.
 * Falls back to systeminformation if host mounts aren't accessible.
 */
async function getHostDiskInfo() {
  try {
    const mountsRaw = fs.readFileSync(HOST_PROC_MOUNTS, "utf8");
    const lines = mountsRaw.trim().split("\n");

    const seenDevices = new Set();
    const disks = [];

    for (const line of lines) {
      const parts = line.split(" ");
      if (parts.length < 4) continue;

      const device = parts[0];
      const mountPoint = decodeMountPath(parts[1]);
      const fsType = parts[2];

      // Only include physical filesystem types
      if (!PHYSICAL_FS_TYPES.has(fsType)) continue;

      // Skip system mount points
      if (
        mountPoint.startsWith("/dev") ||
        mountPoint.startsWith("/sys") ||
        mountPoint.startsWith("/proc") ||
        mountPoint.startsWith("/run")
      ) {
        continue;
      }

      // Deduplicate by device (e.g., same partition mounted twice)
      if (seenDevices.has(device)) continue;
      seenDevices.add(device);

      try {
        const hostPath = path.join(HOST_ROOT, mountPoint);
        const stats = await statfs(hostPath);
        const bsize = Number(stats.bsize);
        const total = Number(stats.blocks) * bsize;
        const free = Number(stats.bfree) * bsize;
        const available = Number(stats.bavail) * bsize;
        const used = total - free;
        const use = total > 0 ? parseFloat(((used / total) * 100).toFixed(2)) : 0;

        disks.push({
          fs: device,
          type: fsType,
          size: total,
          used,
          available,
          use,
          mount: mountPoint,
          sizeGB: (total / 1024 ** 3).toFixed(2),
          usedGB: (used / 1024 ** 3).toFixed(2),
          availableGB: (available / 1024 ** 3).toFixed(2),
        });
      } catch {
        // Skip mounts that can't be accessed through /host
        continue;
      }
    }

    return disks;
  } catch (error) {
    // Fallback: host root not mounted, use systeminformation (container-only view)
    console.warn(
      "Host disk detection unavailable, falling back to container view:",
      error.message
    );
    const si = require("systeminformation");
    const fsSize = await si.fsSize();

    const seenFilesystems = new Set();
    return fsSize
      .filter((disk) => {
        if (seenFilesystems.has(disk.fs)) return false;
        if (
          disk.type === "overlay" ||
          disk.type === "tmpfs" ||
          disk.type === "devtmpfs" ||
          disk.fs.startsWith("overlay") ||
          disk.fs.startsWith("tmpfs") ||
          disk.mount.startsWith("/dev") ||
          disk.mount.startsWith("/sys") ||
          disk.mount.startsWith("/proc") ||
          disk.mount.startsWith("/run")
        ) {
          return false;
        }
        seenFilesystems.add(disk.fs);
        return true;
      })
      .map((disk) => ({
        fs: disk.fs,
        type: disk.type,
        size: disk.size,
        used: disk.used,
        available: disk.available,
        use: disk.use,
        mount: disk.mount,
        sizeGB: (disk.size / 1024 ** 3).toFixed(2),
        usedGB: (disk.used / 1024 ** 3).toFixed(2),
        availableGB: (disk.available / 1024 ** 3).toFixed(2),
      }));
  }
}

module.exports = { getHostDiskInfo };
