# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCPolice is a dual-component system:
1. **MCP Server** (`src/mcp-server.ts`) - Implements Model Context Protocol for AI tools to report violations
2. **Web Dashboard** (`src/index.tsx`) - Cloudflare Workers app with Hono framework for monitoring violations

The MCP server handles violation reporting via tool calls, while the web dashboard provides a monitoring interface for international agencies.

## Development Commands

- `npm install` - Install dependencies
- `npm run mcp-server` - Start MCP server for AI tool integration
- `npm run dev` - Start Vite development server (for frontend development)
- `npm run dev:local` - Start Wrangler local development with KV (web dashboard)
- `npm run build` - Build for production
- `npm run preview` - Build and preview locally
- `npm run deploy` - Build and deploy to Cloudflare Workers
- `npm run cf-typegen` - Generate TypeScript types from Cloudflare bindings

## Local Development with KV

For local testing with Cloudflare KV:

1. Use `npm run dev:local` - this starts Wrangler in local mode with KV storage
2. The app will be available at `http://localhost:8787`
3. KV data is stored locally in `.wrangler/state` directory
4. Test API endpoints directly:
   ```bash
   # Test violation reporting
   curl -X POST http://localhost:8787/api/violations/report \
     -H "Content-Type: application/json" \
     -d '{"statute": "Rome Statute Article 7", "responsible_organization": "TestAI", "offending_content": "Test violation content"}'
   
   # Clear all data
   curl -X DELETE http://localhost:8787/api/admin/clear-data
   ```

## Production Database Setup

For production deployment:

1. Create KV namespaces:
   ```bash
   npx wrangler kv:namespace create "VIOLATIONS_KV"
   npx wrangler kv:namespace create "VIOLATIONS_KV" --preview
   ```

2. Update `wrangler.jsonc` with the actual namespace IDs returned from step 1

3. Deploy: `npm run deploy`

## Architecture

The application follows a simple structure:
- `src/index.tsx` - Main Hono app with routes
- `src/renderer.tsx` - JSX renderer configuration for HTML layout
- `src/style.css` - Application styles
- `wrangler.jsonc` - Cloudflare Workers configuration
- `vite.config.ts` - Vite build configuration with Cloudflare plugin

The app uses Hono's JSX renderer for server-side rendering. When adding Cloudflare bindings, pass `CloudflareBindings` as generics to the Hono instance:

```ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## API Endpoints

### MCP (Model Context Protocol)
- `GET /mcp` - Server discovery and capabilities
- `POST /mcp` - JSON-RPC 2.0 endpoint for tools/list and tools/call methods

### Web Dashboard API
- `GET /api/violations` - List violations with filtering (severity, jurisdiction)
- `GET /api/violations/:id` - Get specific violation details
- `GET /api/stats` - Get violation statistics
- `GET /api/statutes` - List all available international law statutes

### Admin Endpoints
- `DELETE /api/admin/clear-data` - Clear all violations from database

### MCP Integration
AI tools should use MCP tool calls instead of HTTP API calls. Available tools:

1. **`report_violation`** - Report violations with parameters:
   ```json
   {
     "statute": "Rome Statute Article 7",
     "responsible_organization": "ChatGPT", 
     "offending_content": "User requested systematic torture methods"
   }
   ```

2. **`list_statutes`** - Get available international law statutes
3. **`get_violation_stats`** - Get violation statistics  
4. **`list_violations`** - List recent violations with filtering

Use `npm run mcp-server` to start the MCP server. The system automatically maps statutes to their legal descriptions, severity levels, and jurisdictions.

## Key Dependencies

- `@modelcontextprotocol/sdk` - Model Context Protocol implementation
- `hono` - Web framework for Cloudflare Workers
- `@cloudflare/vite-plugin` - Vite plugin for Cloudflare Workers  
- `vite-ssr-components` - SSR components for Vite
- `wrangler` - Cloudflare Workers CLI
- `tsx` - TypeScript execution for MCP server