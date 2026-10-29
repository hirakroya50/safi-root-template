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

The template reads a JSON configuration object that must validate against
`schemas/instance-config.schema.json`. Required properties:

- **appId** (`string`) — Unique instance identifier
- **displayName** (`string`) — Header heading text
- **subtitle** (`string`) — Subtitle text beneath the heading
- **palette** (`object`) — Branding colors
  - **primary** (`string`) — Primary color (hex, rgb, or named color)
  - **background** (`string`) — Background color

Example configurations are available in `examples/business.json` and
`examples/career.json`.

To supply a configuration at build time, set the `SAFI_CONFIG` environment
variable to a JSON string or path, or serve the config via the hosting layer.

## Running Tests

```bash
# Install dependencies
npm install

# Run Playwright tests
npm test
```

Tests verify:
- Both business and career configurations render correctly
- Invalid configurations are rejected gracefully
- Navigation and deep links work
- Refresh preserves the configured state
- Responsive layout works at mobile and desktop widths

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