# SAFI Root Template

A reusable root Single Page Application (SPA) template built with React + TypeScript + Vite.

## Project Structure

```
safi-root-template/
├─ template/           # Reusable React + TypeScript + Vite source
├─ template.json       # Template metadata and UI slot definitions
├─ schemas/            # JSON Schema for instance configuration
├─ examples/           # Valid configuration examples
├─ tests/              # Playwright browser tests
├─ README.md           # This file
└─ END_USER_ACCEPTANCE.md  # Acceptance evidence (filled post-deployment)
```

## Available Scripts

In the `template/` directory:

| Script      | Description                     |
| ----------- | --------------------------------- |
| `npm dev`   | Start development server at http://localhost:5173 |
| `npm build` | Type-check and build for production |
| `npm preview` | Preview the production build locally |

At the repo root:

| Script      | Description                     |
| ----------- | --------------------------------- |
| `npm test`   | Run Playwright tests (see below) |

## Configuration

One React shell serves every client. Personality comes from a JSON document
that must validate against `schemas/instance-config.schema.json`.
Unknown properties are rejected. Links may only be in-page (`#top`,
`#offerings`, `#about`, `#contact`), `mailto:`, or `tel:`.

Required properties:

- **appId** (`string`) — Unique instance identifier
- **displayName** (`string`) — Home heading and wordmark
- **subtitle** (`string`) — Short line above the heading
- **palette** (`object`) — Branding colors
  - **primary** (`string`) — Primary color (hex, rgb, or named color)
  - **background** (`string`) — Page background color

Optional properties shape the page without a code change:

- **intro** and **about** — The opening sentence and the about passage
- **navigation** — Up to four in-page links
- **sections** — Labels for offerings, about, and contact
- **highlights** — Up to three facts under the heading
- **offerings** — Cards for a menu, aisle, service, or piece of work
- **contact** — Address, hours, phone, or email
- **primaryAction** — The single button label and in-page target

Examples for the same shell:

| File | Client |
| --- | --- |
| `examples/coffee.json` | Coffee shop |
| `examples/grocery.json` | Grocery shop |
| `examples/person.json` | Individual person |
| `examples/business.json` | Self-owned practice |
| `examples/career.json` | Independent designer |

With no injected configuration, the dev server shows the coffee shop sample.
To preview a client file while the dev server is running, open
`http://localhost:5173/?example=lotus-cafe` (the name is the JSON file in `examples/`, without `.json`).
Every page is marked “This is a template UI” and carries the name Lotus AI Works Inc.
Hosting supplies a real client by setting `window.__SAFI_CONFIG__` to the
JSON before the app loads. The chat pane stays labeled as a nonfunctional demo.

## Supabase

Every client uses the same tables. Sign-in is Supabase Auth. The shop fields live in `profiles`, the catalog in `products`, and purchases in `orders` plus `order_items`.

1. Create a Supabase project for the client.
2. Open the SQL editor and run `template/supabase/schema.sql`.
3. Copy `template/.env.example` to `template/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Start the app and open Account. The first account created becomes admin. Later accounts are members. An admin can set a profile role to `manager`.

Roles are `admin`, `manager`, and `member`. Managers and admins can add, edit, and delete products and update payment and delivery status. Any signed-in person can place an order.

## Running Tests

```bash
# Install dependencies
npm install

# Run Playwright tests
npm test
```

Tests verify:
- Coffee, grocery, individual, and business configurations render from JSON
- A configuration with only the required fields still renders
- Unsafe links are dropped and the page stays up
- Navigation and deep links work
- Refresh preserves the configured state
- Layout stacks on a phone and sits side by side on a desktop

## Building and Deployment

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Preview the production build
npm run preview
```

The build produces static assets in `template/dist/`. Only static assets
should be published to SAFI-controlled hosting; deployment credentials must
be kept outside the imported build execution.