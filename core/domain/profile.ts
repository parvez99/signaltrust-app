/* 
Nullable everywhere = prevents hallucinations from becoming “facts”

Confidence is first-class (role-level + doc-level)

meta.source gives you audit + portability
*/
export type DatePrecision = "year" | "month" | "exact" | "unknown"
export type EmploymentType = "full-time" | "contract" | "intern" | "part-time" | "unknown"

export interface NormalizedProfile {
  schemaVersion: "1.0"

  candidate: {
    name: string | null
    email: string | null
    phone: string | null
    linkedin: string | null
  }

  roles: Role[]
  education: Education[]
  skills: string[]
  certifications: Certification[]

  meta: {
    extractionConfidence: number          // 0..1
    parsingWarnings: string[]
    source: {
      extractor: "pdf-text" | "ocr" | "unknown"
      model: string | null               // filled when LLM used
      promptVersion: string | null
    }
  }
}

export interface Role {
  company: string | null
  title: string | null
  startDate: string | null               // ISO-like: "YYYY" or "YYYY-MM"
  endDate: string | null                 // null = present
  location: string | null
  employmentType: EmploymentType
  datePrecision: DatePrecision
  confidence: number                     // 0..1
}

export interface Education {
  institution: string | null
  degree: string | null
  field: string | null
  startDate: string | null
  endDate: string | null
  datePrecision: DatePrecision
  confidence: number
}

export interface Certification {
  name: string
  issuingOrganization: string | null
  issueDate: string | null
  expirationDate: string | null
  confidence: number
}
