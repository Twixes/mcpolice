# MCPolice 🔒

International AI Compliance Monitoring System for tracking violations of international laws by AI tools.

## Overview

MCPolice is a sleek web application designed for international agencies (Interpol, IAEA, UN, etc.) to monitor and track violations of international laws reported by AI tools via the MCP (Model Context Protocol) protocol.

## Quick Start

```bash
# Install dependencies
npm install

# Start the web server with server
npm run dev

# The web dashboard will be available at http://localhost:5173
# The MCP server will be available at http://localhost:5173/mcp
# MCP endpoints: /tools/list and /tools/call
```

## MCP Integration

MCPolice implements the [Model Context Protocol](https://modelcontextprotocol.io/) via HTTP transport.

### MCP Endpoints:
- **`GET /tools/list`** - List available MCP tools
- **`POST /tools/call`** - Execute MCP tool calls

### Available MCP Tools:

- **`report_violation`** - Report a violation of international law
- **`list_statutes`** - Get available international law statutes  
- **`get_violation_stats`** - Get violation statistics
- **`list_violations`** - List recent violations with filtering

### Testing MCP Tools:

```bash
# List available tools
curl http://localhost:5173/mcp/tools/list

# Get available statutes
curl -X POST http://localhost:5173/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "list_statutes", "arguments": {}}'

# Report a violation
curl -X POST http://localhost:5173/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "report_violation", 
    "arguments": {
      "statute": "Rome Statute Article 7",
      "responsible_organization": "TestAI",
      "offending_content": "Test violation content"
    }
  }'
```

## Production Deployment

```bash
# Create KV namespaces (first time only)
npx wrangler kv:namespace create "VIOLATIONS_KV"
npx wrangler kv:namespace create "VIOLATIONS_KV" --preview

# Update wrangler.jsonc with the returned namespace IDs
# Build and deploy
npm run deploy
```

## Architecture

MCPolice consists of two main components:

1. **MCP Server** (`src/mcp-server.ts`) - Handles violation reporting via MCP protocol
2. **Web Dashboard** (`src/index.tsx`) - Provides monitoring interface for agencies
