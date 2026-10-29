# SAFI Root Template and Importer

## Goal
Create a reusable root SPA template and a repeatable ZIP/Git
import, build and deployment operation in the designated SAFI repository.

## Stack
React + TypeScript + Vite, Node.js, pinned npm lockfile,
JSON Schema and Playwright.

## Required files
- template/: imported reusable React source, components, styles and lockfile.
- template.json: kind "safi.spa.root", version "0.1.0", candidate status,
  imported source SHA, schema reference and UI slots.
- schemas/instance-config.schema.json: strict schema requiring appId,
  displayName, subtitle and palette; reject unknown properties.
- examples/business.json and examples/career.json: materially different
  valid configurations for the same reusable SPA source.
- scripts/import-and-deploy.mjs: safely import ZIP/Git source, validate
  the stack, install/build in isolation, record source digest/SHA,
  publish static assets to the same preassigned public HTTPS URL,
  and verify the deployed release. Repeat without manual source edits.
- tests/template.spec.ts: Playwright checks for the published user site,
  fixed URL, both variants, invalid config and refresh/deep links.
- README.md: plain-language import, setup and replay instructions.
- END_USER_ACCEPTANCE.md: user-created source evidence, fixed URL,
  exact SHA, PASS/FAIL screenshots, timestamps and user/observer sign-off.

## Template UI
- Retain a SAFI shell: header/navigation, conversational pane and
  workspace/artifact placeholder.
- Give the chat pane a named component boundary for future
  assistant-ui + Windmill Chat SDK integration.
- Clearly label nonfunctional chat as a demo.
- Do not build a live AI backend or present canned replies as live AI.
- Branding, home heading, menu labels and all supported variations
  come from validated JSON without JSX/TSX edits.
- Forbid unrecognized actions, components, permissions and executable
  JavaScript in configuration.

## Import and deployment
- Support eligible static React + TypeScript + Vite projects.
- Reject unsupported projects and unsafe archives with clear errors.
- Execute imported code in disposable restricted build isolation.
- Keep deployment credentials outside imported build execution.
- Publish only static assets to SAFI-controlled hosting.
- Redeploy to the same URL and verify updated content, not stale content.
- Do not use customer AWS resources.

## Acceptance
- A supplied fixture may be used for development.
- Final acceptance uses a fresh site independently created by a
  non-developer, with no developer source edits during the final import.
- Require all SOW acceptance checks, including repeat deployment,
  at least 30 minutes of user operation and signed user acceptance.
- Never fabricate provenance, hashes, screenshots, results or sign-off.
- Mark missing source provenance as pending.

## Working rules
- Inspect existing files and preserve unrelated work.
- Implement one requested step at a time.
- Run relevant validation, build and browser checks; report actual results.
- Keep documentation current.
- No authentication, database, full SAFI Kernel or other out-of-scope work.