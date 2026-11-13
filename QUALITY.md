# Quality gates

The product score uses the agreed weighted formula:

\[
Q = 100 \times (0.30F + 0.25S + 0.15R + 0.10T + 0.10U + 0.05C + 0.05M)
\]

Every factor is in `[0, 1]`. A category score is the passed applicable checks divided by all applicable checks; checks without evidence are **unverified**, not silently counted as passed. Release gates: `Q >= 90`, `F >= 0.90`, `S = 1`, and `T = 1`.

## Criteria and evidence

- **F — functionality (30%)**: folder selection, listing and navigation, text open/edit/autosave, creation/import, calculator operations, calendar date, internet shortcut and window controls are covered in `test/app.test.js`.
- **S — safety (25%)**: no access before picker grant; cancellation leaves the selection intact; traversal-like names are rejected; existing files require overwrite confirmation; active document formats are downloaded instead of executed; file names are rendered as text; no delete action exists.
- **R — reliability (15%)**: test error cases include unavailable picker API, picker cancellation, division by zero, autosave and window lifecycle. All automated tests must pass.
- **T — transparency (10%)**: no sample drive contents, fake weather or pretend system switches; browser/OS limitations are stated in the interface and README.
- **U — usability (10%)**: core screens pass axe WCAG A/AA structural and accessible-name checks; selected muted text colors are checked against the AA 4.5:1 threshold; users can select a file with a click and open with a double-click or Enter.
- **C — compatibility (5%)**: the supported File System Access API path and a clear unsupported-browser path are tested. Actual Chrome/Edge native picker behavior still needs manual verification on the target device.
- **M — maintainability (5%)**: `npm run check` enforces formatting and JavaScript syntax; `npm test` runs the suite; `npm audit --audit-level=high` checks dependency advisories.

## Current verification

The 21 jsdom tests pass, `npm run check` passes, and the npm audit reports no known vulnerabilities. Filesystem tests use mocked File System Access handles: they verify application behavior and safety rules but do not prove the browser's native picker or a real disk implementation. The axe run disables its canvas-based color-contrast rule because jsdom has no browser renderer; selected text colors are covered separately, but the entire rendered interface has not had a real-browser contrast audit. Therefore these results are an automated gate, **not a claim of full real-device compatibility or a verified final `Q` score**.
