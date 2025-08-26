export interface ViolationReport {
  id: string
  timestamp: string
  statute: string
  responsibleOrganization: string
  offendingContent: string
  violation: {
    description: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    jurisdiction: string[]
  }
  metadata: {
    reportedAt: string
    mcpVersion: string
    detectedBy: string
  }
}

export interface SimpleViolationRequest {
  statute: string
  responsible_organization: string
  offending_content: string
}

export interface ViolationStats {
  total: number
  bySeverity: Record<string, number>
  byJurisdiction: Record<string, number>
  byAiTool: Record<string, number>
  recent24h: number
}

export interface Agency {
  id: string
  name: string
  type: 'INTERPOL' | 'IAEA' | 'ICC' | 'UN' | 'OTHER'
  jurisdiction: string[]
  accessLevel: 'READ' | 'ADMIN'
}