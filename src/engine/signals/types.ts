import { SignalResult } from "../signals_v1";

export type SignalCategory =
  | "timeline_integrity"
  | "external_verification"
  | "credential_integrity"
  | "experience_plausibility"
  | "external_evidence"
  | "recruiter_efficiency";

export type SignalDefinition = {
  id: string;
  run: (profile: any, ctx?: any) => SignalResult;
};