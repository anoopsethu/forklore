# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Forklore** is a SvelteKit application for interactive food history exploration. It visualizes the historical journey of dishes across the globe using an interactive Mapbox map and AI-generated historical narratives.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type check
npm run check

# Type check in watch mode
npm run check:watch

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token_here
OPENAI_API_KEY=your_openai_api_key_here
```

Note: The application uses OpenAI (not Gemini as suggested in the example file) via the `ai` SDK with GPT-4o-mini for generating dish histories.

## Architecture

### Framework & Stack
- **SvelteKit** with **Svelte 5** (uses runes syntax: `$props()`, `$state()`, `$bindable()`)
- **Tailwind CSS v4** with oklch-based color system (defined in `src/routes/layout.css`)
- **shadcn-svelte** component library (configuration in `components.json`)
- **Mapbox GL JS** for interactive maps
- **AI SDK** (`@ai-sdk/openai`) for AI-powered content generation

### Key Path Aliases
- `$lib` → `src/lib`
- `$lib/components` → `src/lib/components`
- `$lib/components/ui` → `src/lib/components/ui` (shadcn components)

### Application Modes
The app operates in two modes controlled by the `mode` prop on the Map component:

1. **Discovery Mode** (`mode="discovery"`): Displays featured dishes from around the world on a rotating globe. Users can click dishes to explore their history.

2. **History Mode** (`mode="history"`): Visualizes a specific dish's historical journey through 5 chronological steps with animated map transitions between locations.

### API Routes

- **`POST /api/generate`**: Accepts `{ dish: string }` and returns AI-generated dish history with 5 chronological steps including coordinates, titles, and descriptions. Uses GPT-4o-mini with structured output validation via Zod schema.

- **`GET /api/featured`**: Returns a random selection of featured dishes from a static pool organized by geographic regions (15 regions, 4-5 dishes each).

### Component Conventions

**shadcn-svelte UI components** (`src/lib/components/ui/*`):
- Use `tailwind-variants` (`tv()`) for variant styling
- Use the `cn()` utility from `$lib/utils` for class merging
- Export component variants and types from `index.ts` barrels
- Support `ref` binding via `$bindable()` for imperative access

**Example button usage:**
```svelte
import { Button } from "$lib/components/ui/button";
<Button variant="outline" size="sm">Click</Button>
```

### Map Component Architecture

The `Map.svelte` component (`src/lib/components/Map.svelte`) is the core visualization:
- Renders Mapbox maps with custom markers and animated routes
- Supports two modes via props: `discovery` (auto-rotating globe with featured dishes) and `history` (step-by-step journey with route lines)
- Exposes imperative methods (`zoomIn()`, `zoomOut()`) via component binding
- Uses `@turf/turf` for geospatial calculations

### Styling

- Dark mode is enabled by default (set in `+layout.svelte` via `document.documentElement.classList.add("dark")`)
- Colors use oklch color space via CSS custom properties in `layout.css`
- Tailwind v4 with `@import "tailwindcss"` syntax (no tailwind.config.js needed)
