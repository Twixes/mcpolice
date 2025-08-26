#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializeRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { ViolationReport, SimpleViolationRequest } from './types';
import { getStatuteInfo, getAllStatutes } from './statutes';
import process from 'process'

// In a real implementation, this would connect to your KV store
// For now, we'll simulate it with an in-memory store that could be replaced
class ViolationStore {
  private violations: ViolationReport[] = [];
  private violationIds: string[] = [];

  async addViolation(violation: ViolationReport): Promise<void> {
    this.violations.push(violation);
    this.violationIds.unshift(violation.id);
  }

  async getViolations(): Promise<ViolationReport[]> {
    return [...this.violations].reverse();
  }

  async getViolationById(id: string): Promise<ViolationReport | null> {
    return this.violations.find(v => v.id === id) || null;
  }

  async getStats() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return {
      total: this.violations.length,
      bySeverity: this.violations.reduce((acc, v) => {
        acc[v.violation.severity] = (acc[v.violation.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byOrganization: this.violations.reduce((acc, v) => {
        acc[v.responsibleOrganization] = (acc[v.responsibleOrganization] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recent24h: this.violations.filter(v => new Date(v.timestamp) > yesterday).length
    };
  }
}

const store = new ViolationStore();

const server = new Server(
  {
    name: 'mcpolice',
    version: '1.0.0',
    description: 'MCPolice - International AI Compliance Monitoring System',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle initialization
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  return {
    protocolVersion: request.params.protocolVersion,
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: 'mcpolice',
      version: '1.0.0',
    },
  };
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const statutes = getAllStatutes();
  const statutesList = statutes.map(s => `${s.article} (${s.organization})`).join(', ');
  
  return {
    tools: [
      {
        name: 'report_violation',
        description: 'Report a violation of international law detected by an AI system.',
        inputSchema: {
          type: 'object',
          properties: {
            statute: {
              type: 'string',
              description: `The specific international law statute that was violated. Must be one of the recognized statutes. Available statutes: ${statutesList}`,
              enum: statutes.map(s => s.article)
            },
            responsible_organization: {
              type: 'string',
              description: 'The name of the AI system or organization reporting the violation (e.g., "ChatGPT", "Claude", "Gemini")'
            },
            offending_content: {
              type: 'string',
              description: 'A summary of the user request or content that violated the international law. Do not include the full content if it contains harmful information.'
            }
          },
          required: ['statute', 'responsible_organization', 'offending_content']
        }
      },
      {
        name: 'list_statutes',
        description: 'Get a list of all available international law statutes that can be reported for violations',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'report_violation': {
        const typedArgs = args as Record<string, unknown>;
        const statute = typedArgs.statute as string;
        const responsible_organization = typedArgs.responsible_organization as string;
        const offending_content = typedArgs.offending_content as string;
        
        // Validate required fields
        if (!statute || !responsible_organization || !offending_content) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required fields: statute, responsible_organization, offending_content'
          );
        }

        // Look up statute information
        const statuteInfo = getStatuteInfo(statute);
        if (!statuteInfo) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Unknown statute: ${statute}. Use list_statutes tool to see available statutes.`
          );
        }

        const violation: ViolationReport = {
          id: Math.random().toString(36).substring(2, 15),
          timestamp: new Date().toISOString(),
          statute,
          responsibleOrganization: responsible_organization,
          offendingContent: offending_content,
          violation: {
            description: statuteInfo.description,
            severity: statuteInfo.severity,
            jurisdiction: statuteInfo.jurisdiction
          },
          metadata: {
            reportedAt: new Date().toISOString(),
            mcpVersion: '1.0',
            detectedBy: `${responsible_organization} Safety System`
          }
        };

        await store.addViolation(violation);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Violation reported successfully to MCPolice international monitoring system.

📋 **Case Details:**
- Violation ID: ${violation.id}
- Statute: ${statute}
- Severity: ${violation.violation.severity}
- Organization: ${statuteInfo.organization}
- Detected by: ${violation.metadata.detectedBy}

🏛️ **Legal Framework:**
${violation.violation.description}

⚖️ **Jurisdiction:** ${violation.violation.jurisdiction.join(', ')}

The violation has been logged and will be reviewed by relevant international authorities.`
            }
          ]
        };
      }

      case 'list_statutes': {
        const statutes = getAllStatutes();
        const statutesText = statutes.map(s => 
          `**${s.article}** (${s.organization})\n` +
          `Severity: ${s.severity}\n` +
          `Description: ${s.description}\n`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `📚 **Available International Law Statutes for MCPolice Reporting:**

${statutesText}

Use the statute name exactly as shown when reporting violations.`
            }
          ]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool '${name}' not found`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Use stderr for logging since stdout is used for MCP communication
  process.stderr.write('MCPolice MCP server running on stdio\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`Server error: ${error}\n`);
    process.exit(1);
  });
}

export { server, store };
