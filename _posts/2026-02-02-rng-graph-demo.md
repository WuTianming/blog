---
title: "RNG Graph Demo"
date: 2026-02-02
---

(Warning: vibe-coded artifact ahead)

This post showcases a tiny JS port of my RNG graph builder and search. The visualization below builds a graph over a Swiss roll, then repeatedly performs a navigation search between random nodes to highlight the traversal path.

<iframe
  src="{{ '/assets/rng-demo/demo/' | relative_url }}"
  style="width: 100%; height: 720px; border: 1px solid #d9d2c5;"
  loading="lazy"
></iframe>

Notes:
- The orange tubes are the search path edges; grey edges dim after the initial second to make the path pop.
- The entry point is blue, the target is green.