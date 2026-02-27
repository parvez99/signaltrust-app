declare global {
    interface Env {
      OPENAI_API_KEY: string
      ASSETS: Fetcher
      DB: D1Database
      // Optional but recommended for higher GitHub API rate limits.
      // If unset, enrichment still works but rate-limits faster.
      GITHUB_PUBLIC_TOKEN?: string
    }
  }
  
  export {}
  