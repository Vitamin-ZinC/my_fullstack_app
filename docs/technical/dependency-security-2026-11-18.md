# Commission Release Dependency Security

The commission UI release preserves React 18.3.1, Node 24.22.1, sharp 0.35.5,
libvips 8.18.7, the existing CPU-compatible image build and the full audit gate.

- Next.js is pinned to 16.4.5, fixing CVE-2026-119790.
- node-gyp is pinned to the compatible 11.1.0 build-tool branch. The previous
  12.4.0 branch pulls tinyglobby/picomatch, affected by CVE-2026-112366 with no
  published fix. This is a deliberate build-tool version selection, not an
  assertion that an older application runtime is generally safer.
- The existing root overrides pin glob to 14.0.2, fixing CVE-2026-118773 and
  resolving a patched minimatch 11.x dependency. This also applies to cacache's
  use of glob. The consumers use the supported CommonJS `glob()` promise API.

Only the affected build dependency graph was refreshed. Unrelated locked AWS,
database, queue, chart and browser-test versions were preserved. No audit
exceptions, omitted development dependency audits, force-fix, or global server
package changes are used for deployment.

Validation: npm audit with audit-level=low, frontend production build, backend
typecheck/tests, browser commission flows and RU/EN layout checks. The Linux
production image must additionally compile sharp through the selected node-gyp
and pass the existing PNG/WebP/JPEG runtime test before the release is switched.

References:

- [Next.js advisory](https://github.com/advisories/GHSA-mfr8-8qww-v76h)
- [picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
- [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
- [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
