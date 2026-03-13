import { SignalDefinition } from "./types";
import { signalEmployerExistence } from "./employer_validation";
import { signalClaimCorroborationCoverage } from "./claim_corroboration_coverage";
import { signalInterviewWasteProbability } from "./interview_waste_probability";
// import { signalCertificationLifecycle } from "./certification_lifecycle";
// import { signalInterviewWasteProbability } from "./interview_waste_probability";

export const SIGNAL_CATALOG: SignalDefinition[] = [
  {
    id: "employer_existence_validation",
    run: signalEmployerExistence,
  },
  {
    id: "claim_corroboration_coverage",
    run: signalClaimCorroborationCoverage,
  },
  {
    id: "interview_waste_probability",
    run: signalInterviewWasteProbability,
  },
];