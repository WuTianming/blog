// RNG graph ported from anns_sim/nsw-C/graph.cpp
// Minimal, deterministic JS implementation intended for browser usage.

function l2Distance(a, b) {
  if (a.length !== b.length) {
    throw new Error("Vectors must be the same length");
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

class BinaryHeap {
  constructor(isHigherPriority) {
    this._data = [];
    this._isHigherPriority = isHigherPriority;
  }

  size() {
    return this._data.length;
  }

  peek() {
    return this._data.length === 0 ? null : this._data[0];
  }

  push(value) {
    this._data.push(value);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    if (this._data.length === 0) return null;
    const top = this._data[0];
    const end = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = end;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(idx) {
    const data = this._data;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this._isHigherPriority(data[parent], data[idx])) break;
      [data[parent], data[idx]] = [data[idx], data[parent]];
      idx = parent;
    }
  }

  _sinkDown(idx) {
    const data = this._data;
    const length = data.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let swap = idx;

      if (left < length && !this._isHigherPriority(data[swap], data[left])) {
        swap = left;
      }
      if (right < length && !this._isHigherPriority(data[swap], data[right])) {
        swap = right;
      }
      if (swap === idx) break;
      [data[idx], data[swap]] = [data[swap], data[idx]];
      idx = swap;
    }
  }
}

function rngPrune(vecP, neighborCandidates, vecs, distFn, alpha) {
  const candidates = [];
  for (let i = 0; i < neighborCandidates.length; i += 1) {
    const id = neighborCandidates[i];
    candidates.push({ dist: distFn(vecs[id], vecP), id });
  }
  candidates.sort((a, b) => a.dist - b.dist);

  const pruned = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    let keep = true;
    for (let j = 0; j < pruned.length; j += 1) {
      const other = pruned[j];
      if (candidate.dist >= alpha * distFn(vecs[candidate.id], vecs[other])) {
        keep = false;
        break;
      }
    }
    if (keep) pruned.push(candidate.id);
  }
  return pruned;
}

function removeItself(trail, vecId) {
  const ret = [];
  for (let i = 0; i < trail.length; i += 1) {
    if (trail[i] !== vecId) ret.push(trail[i]);
  }
  return ret;
}

class RNG {
  constructor({
    vecs,
    distFn = l2Distance,
    efCon = 50,
    M = 32,
    alpha = 1.0,
    seed = 42,
  }) {
    if (!Array.isArray(vecs)) throw new Error("vecs must be an array");
    this.vecs = vecs;
    this.distFn = distFn;
    this.efCon = efCon;
    this.M = M;
    this.alpha = alpha;
    this.graph = Array.from({ length: vecs.length }, () => []);
    this.nAdded = 0;
    this._rand = mulberry32(seed);
  }

  _randInt(maxInclusive) {
    return Math.floor(this._rand() * (maxInclusive + 1));
  }

  search(q, topk = 10, ef = 50) {
    if (this.nAdded === 0) {
      return { result: [], trail: [], precursor: [], dcos: 0 };
    }

    const visited = new Set();
    const trail = [];
    const precursor = [];
    const precursorMap = new Map();

    const candidates = new BinaryHeap((a, b) => a.dist < b.dist); // min-heap
    const bestNeighbors = new BinaryHeap((a, b) => a.dist > b.dist); // max-heap

    let dcos = 0;
    for (let i = 0; i < 5; i += 1) {
      const entry = this._randInt(this.nAdded - 1);
      if (visited.has(entry)) continue;
      visited.add(entry);
      const dist = this.distFn(q, this.vecs[entry]);
      dcos += 1;
      candidates.push({ dist, id: entry });
      bestNeighbors.push({ dist, id: entry });
      if (bestNeighbors.size() > ef) bestNeighbors.pop();
    }

    while (candidates.size() > 0) {
      const cur = candidates.pop();
      trail.push(cur.id);
      precursor.push(precursorMap.has(cur.id) ? precursorMap.get(cur.id) : 0);

      const bestTop = bestNeighbors.peek();
      if (bestTop && cur.dist > bestTop.dist) break;

      const neighbors = this.graph[cur.id];
      for (let i = 0; i < neighbors.length; i += 1) {
        const nb = neighbors[i];
        if (visited.has(nb)) continue;
        visited.add(nb);
        const ndist = this.distFn(q, this.vecs[nb]);
        dcos += 1;
        candidates.push({ dist: ndist, id: nb });
        precursorMap.set(nb, cur.id);
        bestNeighbors.push({ dist: ndist, id: nb });
        if (bestNeighbors.size() > ef) bestNeighbors.pop();
      }
    }

    while (bestNeighbors.size() > topk) bestNeighbors.pop();
    const result = [];
    while (bestNeighbors.size() > 0) {
      result.push(bestNeighbors.pop().id);
    }
    result.reverse();
    return { result, trail, precursor, dcos };
  }

  searchFrom(entryPoint, q, topk = 10, ef = 50) {
    if (this.nAdded === 0) {
      return { result: [], trail: [], precursor: [], dcos: 0 };
    }
    if (entryPoint < 0 || entryPoint >= this.nAdded) {
      throw new Error("entryPoint out of range");
    }

    const visited = new Set();
    const trail = [];
    const precursor = [];
    const precursorMap = new Map();

    const candidates = new BinaryHeap((a, b) => a.dist < b.dist); // min-heap
    const bestNeighbors = new BinaryHeap((a, b) => a.dist > b.dist); // max-heap

    let dcos = 0;
    visited.add(entryPoint);
    const dist = this.distFn(q, this.vecs[entryPoint]);
    dcos += 1;
    candidates.push({ dist, id: entryPoint });
    bestNeighbors.push({ dist, id: entryPoint });
    if (bestNeighbors.size() > ef) bestNeighbors.pop();

    while (candidates.size() > 0) {
      const cur = candidates.pop();
      trail.push(cur.id);
      precursor.push(precursorMap.has(cur.id) ? precursorMap.get(cur.id) : 0);

      const bestTop = bestNeighbors.peek();
      if (bestTop && cur.dist > bestTop.dist) break;

      const neighbors = this.graph[cur.id];
      for (let i = 0; i < neighbors.length; i += 1) {
        const nb = neighbors[i];
        if (visited.has(nb)) continue;
        visited.add(nb);
        const ndist = this.distFn(q, this.vecs[nb]);
        dcos += 1;
        candidates.push({ dist: ndist, id: nb });
        precursorMap.set(nb, cur.id);
        bestNeighbors.push({ dist: ndist, id: nb });
        if (bestNeighbors.size() > ef) bestNeighbors.pop();
      }
    }

    while (bestNeighbors.size() > topk) bestNeighbors.pop();
    const result = [];
    while (bestNeighbors.size() > 0) {
      result.push(bestNeighbors.pop().id);
    }
    result.reverse();
    return { result, trail, precursor, dcos };
  }

  searchBitmap(q, topk, ef, filter) {
    if (this.nAdded === 0) {
      return { result: [], trail: [], precursor: [], dcos: 0 };
    }
    if (!Array.isArray(filter) || filter.length !== this.vecs.length) {
      throw new Error("filter bitmap size must equal vecs length");
    }

    const visited = new Set();
    const trail = [];
    const precursor = [];
    const precursorMap = new Map();

    const candidates = new BinaryHeap((a, b) => a.dist < b.dist); // min-heap
    const bestNeighbors = new BinaryHeap((a, b) => a.dist > b.dist); // max-heap
    const bestNeighborsUnfiltered = new BinaryHeap((a, b) => a.dist > b.dist); // max-heap

    let dcos = 0;
    for (let i = 0; i < 5; i += 1) {
      const entry = this._randInt(this.nAdded - 1);
      if (visited.has(entry)) continue;
      visited.add(entry);
      const dist = this.distFn(q, this.vecs[entry]);
      dcos += 1;
      candidates.push({ dist, id: entry });

      if (filter[entry]) {
        bestNeighbors.push({ dist, id: entry });
        if (bestNeighbors.size() > ef) bestNeighbors.pop();
      }
      bestNeighborsUnfiltered.push({ dist, id: entry });
      if (bestNeighborsUnfiltered.size() > ef) bestNeighborsUnfiltered.pop();
    }

    while (candidates.size() > 0) {
      const cur = candidates.pop();
      trail.push(cur.id);
      precursor.push(precursorMap.has(cur.id) ? precursorMap.get(cur.id) : 0);

      const stopTop = bestNeighborsUnfiltered.peek();
      if (stopTop && cur.dist > stopTop.dist) break;

      const neighbors = this.graph[cur.id];
      for (let i = 0; i < neighbors.length; i += 1) {
        const nb = neighbors[i];
        if (visited.has(nb)) continue;
        visited.add(nb);
        const ndist = this.distFn(q, this.vecs[nb]);
        dcos += 1;
        candidates.push({ dist: ndist, id: nb });
        precursorMap.set(nb, cur.id);

        if (filter[nb]) {
          bestNeighbors.push({ dist: ndist, id: nb });
          if (bestNeighbors.size() > ef) bestNeighbors.pop();
        }
        bestNeighborsUnfiltered.push({ dist: ndist, id: nb });
        if (bestNeighborsUnfiltered.size() > ef) bestNeighborsUnfiltered.pop();
      }
    }

    while (bestNeighbors.size() > topk) bestNeighbors.pop();
    const result = [];
    while (bestNeighbors.size() > 0) {
      result.push(bestNeighbors.pop().id);
    }
    result.reverse();
    return { result, trail, precursor, dcos };
  }

  insert(vecId) {
    const { trail } = this.search(this.vecs[vecId], this.M, this.efCon);
    const prunedTrail = removeItself(trail, vecId);
    let afterPruning = rngPrune(
      this.vecs[vecId],
      prunedTrail,
      this.vecs,
      this.distFn,
      this.alpha
    );
    if (afterPruning.length > this.M) afterPruning = afterPruning.slice(0, this.M);

    if (afterPruning.length > 0) {
      this.graph[vecId] = afterPruning.slice();
    }

    for (let i = 0; i < afterPruning.length; i += 1) {
      const prev = afterPruning[i];
      const neighbors = this.graph[prev].slice();
      let found = false;
      for (let j = 0; j < neighbors.length; j += 1) {
        if (neighbors[j] === vecId) {
          found = true;
          break;
        }
      }
      if (found) continue;

      neighbors.push(vecId);
      let updated = neighbors;
      if (neighbors.length > this.M) {
        updated = rngPrune(this.vecs[prev], neighbors, this.vecs, this.distFn, this.alpha);
        if (updated.length > this.M) updated = updated.slice(0, this.M);
      }
      this.graph[prev] = updated;
    }

    this.nAdded += 1;
  }

  build() {
    for (let i = 0; i < this.vecs.length; i += 1) {
      this.insert(i);
    }
  }
}

export { RNG, l2Distance };

// Optional global for quick browser use without bundlers.
if (typeof window !== "undefined") {
  window.RNG = RNG;
}
