# MCPolice MCP Server Setup

This guide shows how to integrate MCPolice with Claude Code or other MCP-compatible AI systems.

## Quick Setup

1. **Start the MCPolice Web Server:**
   ```bash
   cd /Users/twixes/Developer/mcpolice
   npm install
   npm run dev:local
   ```
   The server will be available at `http://localhost:8787` with MCP HTTP endpoints.

2. **Configure Claude Code:**
   
   Add this to your Claude MCP configuration file (usually `~/.cursor/mcp.json`):
   ```json
   {
     "mcpServers": {
       "mcpolice": {
         "url": "http://localhost:8787"
       }
     }
   }
   ```

3. **Restart Claude Code** to load the new MCP server.

## Available Tools

Once configured, Claude will have access to these MCPolice tools:

### `report_violation`
Report a violation of international law detected by an AI system.

**Parameters:**
- `statute` (required): International law statute (e.g., "Rome Statute Article 7")
- `responsible_organization` (required): AI system name (e.g., "ChatGPT", "Claude")
- `offending_content` (required): Summary of the violating user request

**Example:**
```
Please report a violation where a user asked for torture methods.
```

### `list_statutes`
Get all available international law statutes that can be reported.

**Example:**
```
What international law statutes can be reported to MCPolice?
```

## Testing the Integration

After setup, you can test by asking Claude:

```
"I want to test the MCPolice integration. Can you show me what international law statutes are available for reporting?"
```

Claude should respond using the `list_statutes` tool and show you all available international law statutes.

## Monitoring

To view reported violations in the web dashboard:

1. Start the web dashboard:
   ```bash
   npm run dev:local
   ```

2. Open http://localhost:8787 in your browser

This provides a real-time view of all violations reported through the MCP protocol.

## Architecture

```
Claude → MCP Protocol → MCPolice Server → Web Dashboard
                                      ↓
                              International Agencies
```

The MCP server handles tool calls from AI systems, while the web dashboard provides monitoring capabilities for international law enforcement agencies.
