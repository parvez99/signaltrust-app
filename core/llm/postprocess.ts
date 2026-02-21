import type { NormalizedProfile } from "../domain/profile"

export function postProcessProfile(p: NormalizedProfile): NormalizedProfile {
  // Trim basic strings to avoid silly whitespace diffs
  const trimOrNull = (s: string | null) => (s == null ? null : s.trim() || null)

  p.candidate.name = trimOrNull(p.candidate.name)
  p.candidate.email = trimOrNull(p.candidate.email)
  p.candidate.phone = trimOrNull(p.candidate.phone)
  p.candidate.linkedin = trimOrNull(p.candidate.linkedin)

  p.roles = p.roles.map(r => ({
    ...r,
    company: trimOrNull(r.company),
    title: trimOrNull(r.title),
    startDate: trimOrNull(r.startDate),
    endDate: trimOrNull(r.endDate),
    location: trimOrNull(r.location),
    confidence: clamp01(r.confidence),
  }))

  p.education = p.education.map(e => ({
    ...e,
    institution: trimOrNull(e.institution),
    degree: trimOrNull(e.degree),
    field: trimOrNull(e.field),
    startDate: trimOrNull(e.startDate),
    endDate: trimOrNull(e.endDate),
    confidence: clamp01(e.confidence),
  }))

  p.meta.extractionConfidence = clamp01(p.meta.extractionConfidence)

  return p
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}
