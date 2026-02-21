export const normalizedProfileSchema = {
    name: "NormalizedProfile",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", enum: ["1.0"] },
        candidate: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            linkedin: { type: ["string", "null"] }
          },
          required: ["name", "email", "phone", "linkedin"]
        },
        roles: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              company: { type: ["string", "null"] },
              title: { type: ["string", "null"] },
              startDate: { type: ["string", "null"] },
              endDate: { type: ["string", "null"] },
              location: { type: ["string", "null"] },
              employmentType: {
                type: "string",
                enum: ["full-time", "contract", "intern", "part-time", "unknown"]
              },
              datePrecision: {
                type: "string",
                enum: ["year", "month", "exact", "unknown"]
              },
              confidence: { type: "number", minimum: 0, maximum: 1 }
            },
            required: [
              "company",
              "title",
              "startDate",
              "endDate",
              "location",
              "employmentType",
              "datePrecision",
              "confidence"
            ]
          }
        },
        education: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              institution: { type: ["string", "null"] },
              degree: { type: ["string", "null"] },
              field: { type: ["string", "null"] },
              startDate: { type: ["string", "null"] },
              endDate: { type: ["string", "null"] },
              datePrecision: { type: "string", enum: ["year", "month", "exact", "unknown"] },
              confidence: { type: "number", minimum: 0, maximum: 1 }
            },
            required: ["institution", "degree", "field", "startDate", "endDate", "datePrecision", "confidence"]
          }
        },
        skills: { type: "array", items: { type: "string" } },
        certifications: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              issuingOrganization: { type: ["string", "null"] },
              issueDate: { type: ["string", "null"] },
              expirationDate: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 }
            },
            required: ["name", "issuingOrganization", "issueDate", "expirationDate", "confidence"]
          }
        },
        meta: {
          type: "object",
          additionalProperties: false,
          properties: {
            extractionConfidence: { type: "number", minimum: 0, maximum: 1 },
            parsingWarnings: { type: "array", items: { type: "string" } },
            source: {
              type: "object",
              additionalProperties: false,
              properties: {
                extractor: { type: "string", enum: ["pdf-text", "ocr", "unknown"] },
                model: { type: ["string", "null"] },
                promptVersion: { type: ["string", "null"] }
              },
              required: ["extractor", "model", "promptVersion"]
            }
          },
          required: ["extractionConfidence", "parsingWarnings", "source"]
        }
      },
      required: ["schemaVersion", "candidate", "roles", "education", "skills", "certifications", "meta"]
    }
  } as const
  