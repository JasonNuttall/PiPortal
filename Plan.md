# Architecture Notes

Design decisions behind the multi-node rearchitecture, the module framework
built on top of it, and the reasoning for the performance work that went with
both.

## Why hub + agents

The browser talks to exactly one origin. That choice follows from how a
homelab is actually reachable: machines sit on a LAN, are addressed by
hostnames that resolve inconsistently, and are often behind a single reverse
proxy. Having the browser open a connection per node would have meant CORS on
every agent, every agent reachable from wherever you are browsing, and
credentials duplicated per node.

Costs accepted: one extra network hop for remote nodes, and the hub holds a
socket per agent. Both are negligible next to the deployment simplification.

The two roles are one image chosen by `NODE_ROLE`, because the collection code
is identical either way — only aggregation and storage differ. `hub` is the
default so an existing single-machine install keeps working untouched.

## Demand-driven collection

The load-bearing decision. Subscriptions flow down:

```
browser subscribes  node:jelly:metrics:processes
   → WebSocketServer reference-counts the channel
   → NodeManager splits it per node
   → that node's client starts collecting; every other node stays idle
```

When the last viewer of a channel disappears — panel collapsed, node
deselected, tab hidden, browser closed — collection stops everywhere.

Previously every channel ran a `setInterval` from process start and checked for
subscribers only *after* doing the work, so an idle dashboard walked `/proc`
and hit the Docker socket forever. That does not scale to N machines: the cost
would have multiplied by the fleet size.

The exception is `summary`, collected for every node whenever the overview
strip is open. It is deliberately cheap and reuses the same cached values the
detail panels read.

## Performance work

Measured against the previous implementation.

### The change detector was not running

`ChangeDetector.compare()` returned a `JSON.stringify` deep comparison whenever
the threshold was `null`, *before* reaching the per-channel `switch`. Both
`metrics:processes` and `docker:containers` are configured with a null
threshold, so `compareProcesses()` and `compareDockerContainers()` were
unreachable code. Process CPU values are floats that differ on every sample, so
the comparison always reported "changed" and the full 150-process array was
serialised and pushed every two seconds regardless of whether anything moved.

The unit tests missed it because they called `compare()` directly with a
numeric threshold, which skips the early return. The rewrite dispatches to the
channel comparator first and keeps regression tests that pass a null threshold.

Each channel now declares a *projection* — the few values that decide whether a
push is warranted. Comparison and retained state both operate on the
projection, so cost no longer scales with payload size. Previously each cycle
ran `JSON.stringify` twice for comparison plus a `JSON.parse(JSON.stringify())`
round trip to retain a copy.

### Process collection

`/proc` walking was four synchronous filesystem calls per PID — `existsSync`,
then `status`, `stat` and `cmdline` — roughly 1,200 blocking syscalls per
sample on a host with 300 processes, on the event loop, every two seconds.

Now:
- `/proc/<pid>/stat` alone supplies comm, state, utime, stime, starttime,
  vsize and rss, replacing the separate `status` read;
- the owning uid comes from `stat()`ing `/proc/<pid>` rather than parsing
  `status` for it;
- `cmdline` is read only for processes that survive into the response, and
  cached per `(pid, starttime)` since a process's argv never changes;
- everything is async with bounded concurrency.

Total memory comes from `/proc/meminfo` instead of a full `si.mem()` probe.
PID recycling is handled by comparing `starttime`, so a new process inheriting
an old PID no longer inherits its CPU counter.

### Duplicated work between REST and WebSocket

The REST routes and the WebSocket push loop each ran their own copy of every
collector. A browser polling `/api/metrics/processes` while a socket pushed the
same channel walked `/proc` twice per cycle. A single-flight TTL cache now
backs every collector, so concurrent callers share one in-flight promise.

The old `metrics.js` cache made this worse than it looked: it declared TTLs for
`processes` and `network` that nothing ever read — only `system` called
`getCached`.

### Static data treated as dynamic

`si.cpu()` returns manufacturer, brand and core count. It was re-queried on
every two-second push. It is now resolved once. Network interface identity
(MAC, IPs, link speed) is cached for 30 seconds; only the byte counters are
read per tick.

### Docker

Container state changes when someone starts or stops something — a handful of
times a day. Polling `listContainers()` every five seconds spent essentially
all of its effort confirming nothing had happened. The collector now subscribes
to the Docker event stream and marks its cache stale on relevant events, with a
60-second refresh as a safety net and automatic reconnection.

### Frontend rendering

`Dashboard` built all five panels inside a single `useMemo` whose dependency
array included every panel's data, so a process-list tick re-rendered the disk,
docker, network and services panels too. Each panel now owns its subscription
via `NodePanel` and is individually memoised, with per-panel callbacks
memoised so props stay referentially stable.

Core header metrics used to poll over REST on a shared timer even when panels
were in WebSocket mode. They now read from the node summary the fleet strip is
already streaming, costing no additional collection.

`usePanelData.js` (150 lines) was dead — only a constant was imported from it.
`useNetworkSpeed` and `recharts` were likewise unused.

### Transport

WebSocket payloads are compressed above 1 KB, and each broadcast is serialised
once per channel rather than once per client. The socket moved from a hardcoded
`hostname:3001` to `/ws` on the page's own origin, so it works behind TLS and a
reverse proxy. Subscriptions are released entirely while the tab is hidden.

## Temperature portability

The original read `/sys/class/thermal/thermal_zone0/temp`, which is the
Raspberry Pi layout. An AMD desktop exposes no thermal zones at all — its
sensor is `k10temp` under `/sys/class/hwmon` — so that path returned nothing
and the panel stayed blank.

Sensors are now discovered once and ranked: known CPU thermal zone types first
(`x86_pkg_temp`, `cpu-thermal`, …), then known hwmon chips (`k10temp`,
`coretemp`, …) preferring `Tdie` over `Tctl`, then anything else, then
`systeminformation` as a last resort. Readings outside a plausible range are
rejected and the next sensor tried.

## Testing

Most of the previous suite reimplemented the logic it claimed to cover inline,
so it kept passing after the modules were rewritten — and in two cases after
they were deleted. `ChangeDetector` was the only backend module a test actually
imported.

The suite now exercises real modules: collectors run against fixture procfs and
sysfs trees, the WebSocket server is driven over real sockets, models run
against in-memory SQLite, and routers are mounted with injected dependencies.
`database.js` exposes `setDb` specifically so `ServiceModel` can be tested
rather than reimplemented.

## Data model

Migrations run on startup keyed off `PRAGMA user_version`, so an existing
deployment upgrades in place. Migration 2 adds the `nodes` table and a nullable
`services.node_id`; existing links get `NULL`, meaning fleet-wide, so nothing
disappears on upgrade.

Exactly one node row carries `is_local = 1`: the hub's own machine, collected
in process. It cannot be deleted and never has a URL. Node tokens are stored
alongside the registry but read through a separate accessor and never returned
by the API.


## Modules

A module is another producer for the pipeline above, not a second pipeline. It
is a channel — `module:<id>` — so it inherits demand-driven collection, change
detection, caching and the panel connection states unchanged.

### Data and meaning, not presentation

A module says *what it has and what kind of thing it is*; the portal decides
how to draw it. The first draft had modules declare widgets, which would have
meant every service dictating its own look, and `upcoming episodes` could
never have become a calendar without the service shipping one.

Four shapes — `metric`, `collection`, `schedule`, `series` — each with the
views the portal knows how to draw for it. A module may *suggest* a view but
cannot demand one, and a viewer's choice persists per dataset.

Item fields are fixed rather than free-form. A field only one view understands
is a field that disappears when the view changes, which is why `detail[]`
exists: it absorbs the pressure to add an escape hatch that would quietly kill
the split.

Detail is not a view. Browsing and inspecting are different activities, so
list, grid, table and calendar all open the same sheet.

### Three kinds, one registry

`native` modules live in the service's own repo. `adapter` modules are
portal-side translators for software that cannot be changed. `link` modules
report nothing at all — which is what Quick Links became, collapsing two
features into one concept.

An adapter's output goes through exactly the same validation a third party's
does. Living in this repo earns it no extra trust.

### The trust boundary

Everything arriving from a module is treated as hostile input: unknown shapes
and fields dropped, sizes bounded, `ttl` clamped, and `javascript:`/`data:`/
`file:` URLs stripped before anything reaches a browser. Images are proxied by
the hub and allowlisted to URLs the module's own last payload referenced, so
the proxy cannot be turned into a relay into the network.

Loading module JavaScript was rejected outright. It is the obvious route to
unlimited UI, and it would let any service on the network run code in a page
that holds Docker socket access on every machine in the fleet.

The portal issues `GET` to modules and nothing else. Read-only is a property of
the system rather than a policy, and adding writes later is a contract version
bump rather than an unpicking.

### In memory, not on disk

Payloads are cached for the life of the hub process and nothing is written to
disk. No retention policy, and no reconciling stored items against a fresh
fetch — a cancelled episode simply stops appearing.

Two consequences follow. Calendar paging depends entirely on the module
supporting `window`, since there is no stored history to page through. And a
`series` must arrive complete, because the portal cannot accumulate one by
sampling.

## The grid

Panels were two hardcoded buckets rendered as one or two columns. That has no
place for a panel discovered at runtime, so the module work and the grid rebuild
were the same change.

`{ left, right }` became a single ordered list of `{ id, size }`. The state got
simpler while the layout got more capable, which is usually the sign the old
model was wrong rather than merely incomplete.

Columns follow the viewport arithmetically through `auto-fill` rather than a
list of breakpoints, so the same rules serve a phone and an ultrawide.

Rows are 8px and each panel spans as many as its measured content needs. One
row per panel meant a collapsed panel still sat in a row sized by its tallest
neighbour, leaving a large hole beneath it; grid cannot reflow that on its own
because masonry has not shipped. Measured spans let panels pack to their real
height, which is what makes collapsing actually reclaim space.

Layouts reconcile against the panels that currently exist — unknown ids
dropped, new ones appended — so registering or removing a module never leaves a
hole or throws.
