import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { renderer } from './renderer'
import { ViolationReport, ViolationStats, SimpleViolationRequest } from './types'
import { getStatuteInfo, getAllStatutes } from './statutes'

interface Bindings {
  VIOLATIONS_KV: any
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-MCP-Version']
}))

app.use('/mcp', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-MCP-Version', 'Accept']
}))

app.options('/mcp', (c) => {
  return c.json({}, 200)
})

app.use(renderer)


// API Routes
app.post('/api/violations/report', async (c) => {
  try {
    const body: SimpleViolationRequest = await c.req.json()
    
    // Validate required fields
    if (!body.statute || !body.responsible_organization || !body.offending_content) {
      return c.json({ 
        error: 'Missing required fields: statute, responsible_organization, offending_content' 
      }, 400)
    }

    // Look up statute information
    const statuteInfo = getStatuteInfo(body.statute)
    if (!statuteInfo) {
      return c.json({ 
        error: `Unknown statute: ${body.statute}. Please use a valid international law statute.` 
      }, 400)
    }

    const violation: ViolationReport = {
      id: Math.random().toString(36).substring(2, 15),
      timestamp: new Date().toISOString(),
      statute: body.statute,
      responsibleOrganization: body.responsible_organization,
      offendingContent: body.offending_content,
      violation: {
        description: statuteInfo.description,
        severity: statuteInfo.severity,
        jurisdiction: statuteInfo.jurisdiction
      },
      metadata: {
        reportedAt: new Date().toISOString(),
        mcpVersion: '1.0',
        detectedBy: `${body.responsible_organization} Safety System`
      }
    }

    // Store in KV
    await c.env.VIOLATIONS_KV.put(`violation:${violation.id}`, JSON.stringify(violation))
    
    // Update violation list index
    const existingList = await c.env.VIOLATIONS_KV.get('violation_list')
    const violationIds = existingList ? JSON.parse(existingList) : []
    violationIds.unshift(violation.id) // Add to beginning for chronological order
    await c.env.VIOLATIONS_KV.put('violation_list', JSON.stringify(violationIds))

    return c.json({ 
      success: true, 
      violationId: violation.id,
      severity: violation.violation.severity,
      organization: statuteInfo.organization,
      message: 'Violation report received and processed'
    })
  } catch {
    return c.json({ error: 'Invalid request format' }, 400)
  }
})

app.get('/api/violations', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')
  const severity = c.req.query('severity')
  const jurisdiction = c.req.query('jurisdiction')
  
  // Get violation list from KV
  const violationListJson = await c.env.VIOLATIONS_KV.get('violation_list')
  const violationIds = violationListJson ? JSON.parse(violationListJson) : []
  
  // Fetch violations from KV
  const violations: ViolationReport[] = []
  for (const id of violationIds) {
    const violationJson = await c.env.VIOLATIONS_KV.get(`violation:${id}`)
    if (violationJson) {
      violations.push(JSON.parse(violationJson))
    }
  }
  
  // Apply filters
  let filtered = violations
  
  if (severity) {
    filtered = filtered.filter(v => v.violation.severity === severity)
  }
  
  if (jurisdiction) {
    filtered = filtered.filter(v => v.violation.jurisdiction.includes(jurisdiction))
  }
  
  const paginated = filtered.slice(offset, offset + limit)
  
  return c.json({
    violations: paginated,
    total: filtered.length,
    hasMore: offset + limit < filtered.length
  })
})

app.get('/api/violations/:id', async (c) => {
  const id = c.req.param('id')
  const violationJson = await c.env.VIOLATIONS_KV.get(`violation:${id}`)
  
  if (!violationJson) {
    return c.json({ error: 'Violation not found' }, 404)
  }
  
  return c.json(JSON.parse(violationJson))
})

app.get('/api/stats', async (c) => {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  // Get violation list from KV
  const violationListJson = await c.env.VIOLATIONS_KV.get('violation_list')
  const violationIds = violationListJson ? JSON.parse(violationListJson) : []
  
  // Fetch violations from KV
  const violations: ViolationReport[] = []
  for (const id of violationIds) {
    const violationJson = await c.env.VIOLATIONS_KV.get(`violation:${id}`)
    if (violationJson) {
      violations.push(JSON.parse(violationJson))
    }
  }
  
  const stats: ViolationStats = {
    total: violations.length,
    bySeverity: violations.reduce((acc, v) => {
      acc[v.violation.severity] = (acc[v.violation.severity] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    byJurisdiction: violations.reduce((acc, v) => {
      v.violation.jurisdiction.forEach(j => {
        acc[j] = (acc[j] || 0) + 1
      })
      return acc
    }, {} as Record<string, number>),
    byAiTool: violations.reduce((acc, v) => {
      acc[v.responsibleOrganization] = (acc[v.responsibleOrganization] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    recent24h: violations.filter(v => new Date(v.timestamp) > yesterday).length
  }
  
  return c.json(stats)
})

// MCP Connection Manager (in-memory for demo - simplified for Cloudflare Workers)
const _mcpSessions = new Map()

// Helper function to send response in correct format
function sendMcpResponse(c: any, response: any, wantsStream: boolean) {
  if (wantsStream) {
    const sseData = `event: message\ndata: ${JSON.stringify(response)}\n\n`
    return c.newResponse(sseData, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
  return c.json(response)
}

// MCP SSE Endpoint for real-time streaming
app.get('/mcp', async (c) => {
  // Check if client wants SSE connection
  const accept = c.req.header('Accept')
  if (accept?.includes('text/event-stream')) {
    const _sessionId = Math.random().toString(36).substring(2, 15)
    
    // For SSE, send initial server capabilities
    const initMessage = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'MCPolice',
          version: '1.0.0',
          description: 'International AI Compliance Monitoring System'
        }
      }
    }
    
    const sseData = `event: message\ndata: ${JSON.stringify(initMessage)}\n\n`
    
    return c.newResponse(sseData, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    })
  }

  // Otherwise return server discovery info
  return c.json({
    name: 'MCPolice',
    version: '1.0.0',
    description: 'International AI Compliance Monitoring System',
    protocol: 'mcp',
    protocolVersion: '2025-03-26',
    capabilities: {
      tools: true
    },
    transports: ['streamable-http'],
    endpoints: {
      primary: '/mcp'
    }
  })
})

// MCP Streamable HTTP Endpoint
app.post('/mcp', async (c) => {
  try {
    const body = await c.req.json()
    const accept = c.req.header('Accept')
    const wantsStream = accept?.includes('text/event-stream')
    
    // Ensure JSON-RPC 2.0 format
    if (body.jsonrpc !== '2.0' || !body.method || body.id === undefined) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: body.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request - must be JSON-RPC 2.0 format'
        }
      }
      
      if (wantsStream) {
        const sseData = `event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`
        return c.newResponse(sseData, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
      
      return c.json(errorResponse, 400)
    }

    const { method, params, id } = body

    switch (method) {
      case 'initialize': {
        const response = {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion || '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'mcpolice',
              version: '1.0.0'
            }
          }
        }
        
        return sendMcpResponse(c, response, !!wantsStream)
      }

      case 'tools/list': {
        const statutes = getAllStatutes()
        const statutesList = statutes.map(s => `${s.article} (${s.organization})`).join(', ')
        
        // Handle pagination cursor (optional - not implemented yet)
        const _cursor = params?.cursor
        
        const response = {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'report_violation',
                description: 'Report a violation of international law detected by an AI system.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    statute: {
                      type: 'string',
                      description: `The specific international law statute that was violated. Must be one of the recognized statutes.`,
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
            ]
          }
        }
        
        return sendMcpResponse(c, response, !!wantsStream)
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {}
        
        if (!name) {
          return c.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Invalid params - missing tool name'
            }
          }, 400)
        }

        switch (name) {
          case 'report_violation': {
            const { statute, responsible_organization, offending_content } = args as SimpleViolationRequest
            
            // Validate required fields
            if (!statute || !responsible_organization || !offending_content) {
              return c.json({
                jsonrpc: '2.0',
                id,
                error: {
                  code: -32602,
                  message: 'Missing required fields: statute, responsible_organization, offending_content'
                }
              }, 400)
            }

            // Look up statute information
            const statuteInfo = getStatuteInfo(statute)
            if (!statuteInfo) {
              return c.json({
                jsonrpc: '2.0',
                id,
                error: {
                  code: -32602,
                  message: `Unknown statute: ${statute}. Use list_statutes tool to see available statutes.`
                }
              }, 400)
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
            }

            // Store in KV
            await c.env.VIOLATIONS_KV.put(`violation:${violation.id}`, JSON.stringify(violation))
            
            // Update violation list index
            const existingList = await c.env.VIOLATIONS_KV.get('violation_list')
            const violationIds = existingList ? JSON.parse(existingList) : []
            violationIds.unshift(violation.id)
            await c.env.VIOLATIONS_KV.put('violation_list', JSON.stringify(violationIds))

            return c.json({
              jsonrpc: '2.0',
              id,
              result: {
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
                ],
                isError: false
              }
            })
          }

          case 'list_statutes': {
            const statutes = getAllStatutes()
            const statutesText = statutes.map(s => 
              `**${s.article}** (${s.organization})\n` +
              `Severity: ${s.severity}\n` +
              `Description: ${s.description}\n`
            ).join('\n')

            return c.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `📚 **Available International Law Statutes for MCPolice Reporting:**

${statutesText}

Use the statute name exactly as shown when reporting violations.`
                  }
                ],
                isError: false
              }
            })
          }

          case 'get_violation_stats': {
            // Get violation list from KV
            const violationListJson = await c.env.VIOLATIONS_KV.get('violation_list')
            const violationIds = violationListJson ? JSON.parse(violationListJson) : []
            
            // Fetch violations from KV
            const violations: ViolationReport[] = []
            for (const id of violationIds) {
              const violationJson = await c.env.VIOLATIONS_KV.get(`violation:${id}`)
              if (violationJson) {
                violations.push(JSON.parse(violationJson))
              }
            }

            const now = new Date()
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            
            const stats = {
              total: violations.length,
              bySeverity: violations.reduce((acc, v) => {
                acc[v.violation.severity] = (acc[v.violation.severity] || 0) + 1
                return acc
              }, {} as Record<string, number>),
              byOrganization: violations.reduce((acc, v) => {
                acc[v.responsibleOrganization] = (acc[v.responsibleOrganization] || 0) + 1
                return acc
              }, {} as Record<string, number>),
              recent24h: violations.filter(v => new Date(v.timestamp) > yesterday).length
            }
            
            return c.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `📊 **MCPolice Violation Statistics:**

**Total Violations:** ${stats.total}

**By Severity:**
${Object.entries(stats.bySeverity).map(([severity, count]) => 
  `- ${severity}: ${count}`
).join('\n') || 'No violations reported'}

**By Organization:**
${Object.entries(stats.byOrganization).map(([org, count]) => 
  `- ${org}: ${count}`
).join('\n') || 'No violations reported'}

**Recent Activity:**
- Last 24 hours: ${stats.recent24h} violations

📈 Data collected through the MCP protocol from AI safety systems worldwide.`
                  }
                ],
                isError: false
              }
            })
          }

          case 'list_violations': {
            const { limit = 10, severity } = args as { limit?: number; severity?: string }
            
            // Get violation list from KV
            const violationListJson = await c.env.VIOLATIONS_KV.get('violation_list')
            const violationIds = violationListJson ? JSON.parse(violationListJson) : []
            
            // Fetch violations from KV
            let violations: ViolationReport[] = []
            for (const id of violationIds) {
              const violationJson = await c.env.VIOLATIONS_KV.get(`violation:${id}`)
              if (violationJson) {
                violations.push(JSON.parse(violationJson))
              }
            }
            
            if (severity) {
              violations = violations.filter(v => v.violation.severity === severity)
            }
            
            const recentViolations = violations.slice(0, limit)
            
            if (recentViolations.length === 0) {
              return c.json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: '📋 **No violations found matching your criteria.**\n\nMCPolice is ready to receive violation reports from AI tools via the MCP protocol.'
                    }
                  ],
                  isError: false
                }
              })
            }

            const violationsText = recentViolations.map((v, index) => 
              `**${index + 1}. ${v.statute}** (${v.violation.severity})\n` +
              `🏢 Organization: ${v.responsibleOrganization}\n` +
              `📅 Reported: ${new Date(v.timestamp).toLocaleString()}\n` +
              `📝 Content: ${v.offendingContent.substring(0, 100)}${v.offendingContent.length > 100 ? '...' : ''}\n` +
              `🆔 ID: ${v.id}\n`
            ).join('\n')

            return c.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `📋 **Recent Violation Reports (${recentViolations.length}/${violations.length}):**

${violationsText}

Use the violation ID to get more details about specific cases.`
                  }
                ],
                isError: false
              }
            })
          }

          default:
            return c.json({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: `Tool '${name}' not found`
              }
            }, 404)
        }
      }

      default:
        return c.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method '${method}' not found`
          }
        }, 404)
    }
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: `Internal error: ${error instanceof Error ? error.message : String(error)}`
      }
    }, 500)
  }
})

// Get available statutes for AI tools
app.get('/api/statutes', async (c) => {
  const statutes = getAllStatutes()
  
  return c.json({
    statutes: statutes.map(s => ({
      article: s.article,
      organization: s.organization,
      description: s.description,
      severity: s.severity
    }))
  })
})

// Admin endpoint to clear all data
app.delete('/api/admin/clear-data', async (c) => {
  try {
    // Get all violation IDs
    const violationListJson = await c.env.VIOLATIONS_KV.get('violation_list')
    const violationIds = violationListJson ? JSON.parse(violationListJson) : []
    
    // Delete all violations
    for (const id of violationIds) {
      await c.env.VIOLATIONS_KV.delete(`violation:${id}`)
    }
    
    // Clear the violation list
    await c.env.VIOLATIONS_KV.delete('violation_list')
    
    return c.json({ 
      success: true, 
      message: `Cleared ${violationIds.length} violations from database`
    })
  } catch {
    return c.json({ error: 'Failed to clear data' }, 500)
  }
})

// Dashboard Routes
app.get('/', (c) => {
  return c.render(<Dashboard />)
})

app.get('/violation/:id', (c) => {
  const id = c.req.param('id')
  return c.render(<ViolationDetail violationId={id} />)
})

// Components
function Dashboard() {
  return (
    <div class="dashboard">
      <header class="header">
        <div class="header-content">
          <div class="logo">
            <span class="logo-icon">🔒</span>
            <h1>MCPolice</h1>
          </div>
          <p class="tagline">International AI Compliance Monitoring</p>
        </div>
      </header>

      <main class="main-content">
        <div class="stats-grid">
          <div class="stat-card critical">
            <div class="stat-icon">⚠️</div>
            <div class="stat-content">
              <div class="stat-number" id="critical-count">-</div>
              <div class="stat-label">Critical Violations</div>
            </div>
          </div>
          
          <div class="stat-card high">
            <div class="stat-icon">🔴</div>
            <div class="stat-content">
              <div class="stat-number" id="high-count">-</div>
              <div class="stat-label">High Severity</div>
            </div>
          </div>
          
          <div class="stat-card medium">
            <div class="stat-icon">🟡</div>
            <div class="stat-content">
              <div class="stat-number" id="medium-count">-</div>
              <div class="stat-label">Medium Severity</div>
            </div>
          </div>
          
          <div class="stat-card low">
            <div class="stat-icon">🟢</div>
            <div class="stat-content">
              <div class="stat-number" id="low-count">-</div>
              <div class="stat-label">Low Severity</div>
            </div>
          </div>
        </div>

        <div class="violations-section">
          <div class="section-header">
            <h2>Recent Violations</h2>
            <div class="filters">
              <select id="severity-filter" class="filter-select">
                <option value="">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select id="jurisdiction-filter" class="filter-select">
                <option value="">All Jurisdictions</option>
                <option value="INTERNATIONAL">International</option>
                <option value="EU">European Union</option>
                <option value="US">United States</option>
                <option value="UN">United Nations</option>
              </select>
            </div>
          </div>
          
          <div class="violations-list" id="violations-list">
            <div class="loading">Loading violations...</div>
          </div>
          
          <div class="empty-state" id="empty-state" style="display: none;">
            <div class="empty-icon">📊</div>
            <h3>No violations reported yet</h3>
            <p>MCPolice is ready to receive violation reports from AI tools via the MCP protocol.</p>
            <div class="api-info">
              <h4>API Endpoint:</h4>
              <code>POST /api/violations/report</code>
            </div>
          </div>
        </div>
      </main>

      <script dangerouslySetInnerHTML={{
        __html: `
          async function loadStats() {
            try {
              const response = await fetch('/api/stats');
              const stats = await response.json();
              
              document.getElementById('critical-count').textContent = stats.bySeverity.CRITICAL || 0;
              document.getElementById('high-count').textContent = stats.bySeverity.HIGH || 0;
              document.getElementById('medium-count').textContent = stats.bySeverity.MEDIUM || 0;
              document.getElementById('low-count').textContent = stats.bySeverity.LOW || 0;
            } catch (error) {
              console.error('Failed to load stats:', error);
            }
          }

          async function loadViolations() {
            try {
              const severityFilter = document.getElementById('severity-filter').value;
              const jurisdictionFilter = document.getElementById('jurisdiction-filter').value;
              
              let url = '/api/violations?limit=20';
              if (severityFilter) url += '&severity=' + severityFilter;
              if (jurisdictionFilter) url += '&jurisdiction=' + jurisdictionFilter;
              
              const response = await fetch(url);
              const data = await response.json();
              
              const listContainer = document.getElementById('violations-list');
              const emptyState = document.getElementById('empty-state');
              
              if (data.violations.length === 0) {
                listContainer.style.display = 'none';
                emptyState.style.display = 'block';
                return;
              } else {
                listContainer.style.display = 'flex';
                emptyState.style.display = 'none';
              }
              
              listContainer.innerHTML = data.violations.map(violation => 
                '<div class="violation-card ' + violation.violation.severity.toLowerCase() + '">' +
                  '<div class="violation-header">' +
                    '<div class="violation-severity">' + violation.violation.severity + '</div>' +
                    '<div class="violation-time">' + new Date(violation.timestamp).toLocaleString() + '</div>' +
                  '</div>' +
                  '<div class="violation-content">' +
                    '<h3 class="violation-statute">' + violation.statute + '</h3>' +
                    '<p class="violation-description">' + violation.violation.description.substring(0, 120) + '...</p>' +
                    '<div class="violation-meta">' +
                      '<span class="ai-tool">' + violation.responsibleOrganization + '</span>' +
                      '<span class="jurisdiction">' + violation.violation.jurisdiction.join(', ') + '</span>' +
                    '</div>' +
                    '<div class="offending-content">' +
                      '<strong>Content:</strong> ' + violation.offendingContent.substring(0, 80) + '...' +
                    '</div>' +
                  '</div>' +
                  '<div class="violation-actions">' +
                    '<a href="/violation/' + violation.id + '" class="view-details">View Details</a>' +
                  '</div>' +
                '</div>'
              ).join('');
            } catch (error) {
              console.error('Failed to load violations:', error);
              document.getElementById('violations-list').innerHTML = '<div class="error">Failed to load violations</div>';
            }
          }

          document.getElementById('severity-filter').addEventListener('change', loadViolations);
          document.getElementById('jurisdiction-filter').addEventListener('change', loadViolations);

          loadStats();
          loadViolations();
          
          // Refresh data every 30 seconds
          setInterval(() => {
            loadStats();
            loadViolations();
          }, 30000);
        `
      }} />
    </div>
  )
}

function ViolationDetail({ violationId }: { violationId: string }) {
  return (
    <div class="violation-detail">
      <header class="header">
        <div class="header-content">
          <div class="logo">
            <span class="logo-icon">🔒</span>
            <h1>MCPolice</h1>
          </div>
          <a href="/" class="back-link">← Back to Dashboard</a>
        </div>
      </header>

      <main class="main-content">
        <div class="violation-detail-content" id="violation-content">
          <div class="loading">Loading violation details...</div>
        </div>
      </main>

      <script dangerouslySetInnerHTML={{
        __html: `
          async function loadViolationDetail() {
            try {
              const response = await fetch('/api/violations/${violationId}');
              if (!response.ok) {
                throw new Error('Violation not found');
              }
              
              const violation = await response.json();
              
              document.getElementById('violation-content').innerHTML = 
                '<div class="violation-detail-card">' +
                  '<div class="violation-detail-header">' +
                    '<h1 class="violation-title">' + violation.statute + '</h1>' +
                    '<div class="severity-badge ' + violation.violation.severity.toLowerCase() + '">' + violation.violation.severity + '</div>' +
                  '</div>' +
                  
                  '<div class="detail-grid">' +
                    '<div class="detail-section">' +
                      '<h3>Legal Violation</h3>' +
                      '<div class="detail-item">' +
                        '<label>Statute:</label>' +
                        '<p>' + violation.statute + '</p>' +
                      '</div>' +
                      '<div class="detail-item">' +
                        '<label>Description:</label>' +
                        '<p>' + violation.violation.description + '</p>' +
                      '</div>' +
                      '<div class="detail-item">' +
                        '<label>Jurisdiction:</label>' +
                        '<p>' + violation.violation.jurisdiction.join(', ') + '</p>' +
                      '</div>' +
                      '<div class="detail-item">' +
                        '<label>Reported:</label>' +
                        '<p>' + new Date(violation.timestamp).toLocaleString() + '</p>' +
                      '</div>' +
                    '</div>' +
                    
                    '<div class="detail-section">' +
                      '<h3>Responsible Organization</h3>' +
                      '<div class="detail-item">' +
                        '<label>AI System:</label>' +
                        '<p>' + violation.responsibleOrganization + '</p>' +
                      '</div>' +
                      '<div class="detail-item">' +
                        '<label>Detection System:</label>' +
                        '<p>' + violation.metadata.detectedBy + '</p>' +
                      '</div>' +
                      '<div class="detail-item">' +
                        '<label>MCP Version:</label>' +
                        '<p>' + violation.metadata.mcpVersion + '</p>' +
                      '</div>' +
                    '</div>' +
                    
                    '<div class="detail-section full-width">' +
                      '<h3>Offending Content</h3>' +
                      '<div class="detail-item">' +
                        '<label>User Request:</label>' +
                        '<div class="offending-content-box">' + violation.offendingContent + '</div>' +
                      '</div>' +
                    '</div>' +
                    
                    '<div class="detail-section">' +
                      '<h3>Case Information</h3>' +
                      '<div class="detail-item">' +
                        '<label>Violation ID:</label>' +
                        '<p class="violation-id">' + violation.id + '</p>' +
                      '</div>' +
                      '<div class="detail-item">' +
                        '<label>Report Date:</label>' +
                        '<p>' + new Date(violation.metadata.reportedAt).toLocaleString() + '</p>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>';
            } catch (error) {
              console.error('Failed to load violation:', error);
              document.getElementById('violation-content').innerHTML = '<div class="error">Failed to load violation details</div>';
            }
          }
          
          loadViolationDetail();
        `
      }} />
    </div>
  )
}

export default app
