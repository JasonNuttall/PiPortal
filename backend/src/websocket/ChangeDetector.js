/**
 * ChangeDetector - Detects significant changes in data to avoid redundant pushes
 */
class ChangeDetector {
  constructor() {
    this.previousValues = new Map();
  }

  /**
   * Check if new data has changed significantly from previous
   * @param {string} channel - Channel name
   * @param {*} newData - New data to compare
   * @param {number|null} threshold - Change threshold (null = any change triggers)
   * @returns {boolean} - True if change is significant
   */
  hasSignificantChange(channel, newData, threshold) {
    const prev = this.previousValues.get(channel);

    // First data always triggers
    if (!prev) {
      this.previousValues.set(channel, this.cloneData(newData));
      return true;
    }

    const changed = this.compare(channel, prev, newData, threshold);

    if (changed) {
      this.previousValues.set(channel, this.cloneData(newData));
    }

    return changed;
  }

  /**
   * Compare previous and current data based on channel type
   */
  compare(channel, prev, curr, threshold) {
    if (threshold === null) {
      // Any change triggers - do deep comparison
      return JSON.stringify(prev) !== JSON.stringify(curr);
    }

    switch (channel) {
      case "metrics:system":
        return this.compareSystemMetrics(prev, curr, threshold);

      case "metrics:network":
        return this.compareNetworkMetrics(prev, curr, threshold);

      case "metrics:processes":
        return this.compareProcesses(prev, curr);

      case "metrics:disk:detailed":
        return this.compareDiskMetrics(prev, curr, threshold);

      case "docker:containers":
        return this.compareDockerContainers(prev, curr);

      default:
        // Default: any change triggers
        return JSON.stringify(prev) !== JSON.stringify(curr);
    }
  }

  compareSystemMetrics(prev, curr, threshold) {
    if (!prev?.cpu || !curr?.cpu) return true;

    const cpuChange = Math.abs(
      parseFloat(prev.cpu.currentLoad) - parseFloat(curr.cpu.currentLoad)
    );
    const memChange = Math.abs(
      parseFloat(prev.memory?.usedPercentage || 0) -
        parseFloat(curr.memory?.usedPercentage || 0)
    );

    return cpuChange > threshold * 100 || memChange > threshold * 100;
  }

  compareNetworkMetrics(prev, curr, threshold) {
    if (!prev?.stats || !curr?.stats) return true;

    for (let i = 0; i < curr.stats.length; i++) {
      const prevStat = prev.stats[i];
      const currStat = curr.stats[i];

      if (!prevStat || prevStat.interface !== currStat.interface) return true;

      const prevSpeed = (prevStat.rx_sec || 0) + (prevStat.tx_sec || 0);
      const currSpeed = (currStat.rx_sec || 0) + (currStat.tx_sec || 0);

      if (prevSpeed === 0 && currSpeed > 0) return true;
      if (prevSpeed > 0) {
        const change = Math.abs((currSpeed - prevSpeed) / prevSpeed);
        if (change > threshold) return true;
      }
    }

    return false;
  }

  compareProcesses(prev, curr) {
    if (!prev?.list || !curr?.list) return true;

    // Compare top 5 process PIDs
    const prevTop = prev.list.slice(0, 5).map((p) => p.pid);
    const currTop = curr.list.slice(0, 5).map((p) => p.pid);

    if (prevTop.length !== currTop.length) return true;

    for (let i = 0; i < prevTop.length; i++) {
      if (prevTop[i] !== currTop[i]) return true;
    }

    // Also check for significant CPU changes in top processes
    for (let i = 0; i < Math.min(5, curr.list.length); i++) {
      const prevProc = prev.list[i];
      const currProc = curr.list[i];
      if (prevProc && currProc) {
        if (Math.abs(prevProc.cpu - currProc.cpu) > 5) return true;
      }
    }

    return false;
  }

  compareDiskMetrics(prev, curr, threshold) {
    if (!Array.isArray(prev) || !Array.isArray(curr)) return true;
    if (prev.length !== curr.length) return true;

    for (let i = 0; i < curr.length; i++) {
      const prevDisk = prev[i];
      const currDisk = curr[i];

      if (prevDisk.mount !== currDisk.mount) return true;

      const prevUse = prevDisk.use || prevDisk.usedPercentage || 0;
      const currUse = currDisk.use || currDisk.usedPercentage || 0;

      if (Math.abs(prevUse - currUse) > threshold * 100) return true;
    }

    return false;
  }

  compareDockerContainers(prev, curr) {
    if (!Array.isArray(prev) || !Array.isArray(curr)) return true;
    if (prev.length !== curr.length) return true;

    const prevStates = prev
      .map((c) => `${c.id}:${c.state}`)
      .sort()
      .join(",");
    const currStates = curr
      .map((c) => `${c.id}:${c.state}`)
      .sort()
      .join(",");

    return prevStates !== currStates;
  }

  cloneData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  /**
   * Clear stored data for a channel
   */
  clear(channel) {
    if (channel) {
      this.previousValues.delete(channel);
    } else {
      this.previousValues.clear();
    }
  }
}

module.exports = ChangeDetector;
