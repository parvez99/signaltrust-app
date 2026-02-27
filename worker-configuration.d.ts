declare global {
    interface Env {
      OPENAI_API_KEY: string
      ASSETS: Fetcher
      DB: D1Database
    }
  }
  
  export {}
  