//# upsertCandidate/upsertCandidateGoogle

export async function upsertCandidate(env, { githubId, githubUsername, email }) {
    // Try find existing
    const existing = await env.DB.prepare(
      "SELECT id FROM candidates WHERE github_id = ?"
    ).bind(githubId).first();
  
    const now = new Date().toISOString();
  
    if (existing?.id) {
      await env.DB.prepare(
        "UPDATE candidates SET email=?, github_username=?, updated_at=? WHERE id=?"
      ).bind(email, githubUsername, now, existing.id).run();
      return existing.id;
    }
  
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO candidates (id, email, github_id, github_username, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, email, githubId, githubUsername, now, now).run();
  
    // Create an empty profile row (optional but convenient)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO candidate_profiles
       (candidate_id, profile_completeness, is_searchable, created_at, updated_at)
       VALUES (?, 0, 0, ?, ?)`
    ).bind(id, now, now).run();
  
    return id;
}

export async function upsertCandidateGoogle(env, { googleId, email, name }) {
    const now = new Date().toISOString();
  
    // Prefer lookup by google_id
    const existingByGoogle = await env.DB.prepare(
      "SELECT id FROM candidates WHERE google_id = ?"
    ).bind(googleId).first();
  
    if (existingByGoogle?.id) {
      await env.DB.prepare(
        "UPDATE candidates SET google_email=?, google_name=?, updated_at=? WHERE id=?"
      ).bind(email, name, now, existingByGoogle.id).run();
      return existingByGoogle.id;
    }
  
    // Optional: if someone already exists with same email (GitHub login),
    // attach Google identity to the same candidate to avoid duplicates
    if (email) {
      const existingByEmail = await env.DB.prepare(
        "SELECT id FROM candidates WHERE email = ? OR google_email = ?"
      ).bind(email, email).first();
  
      if (existingByEmail?.id) {
        await env.DB.prepare(
          "UPDATE candidates SET google_id=?, google_email=?, google_name=?, updated_at=? WHERE id=?"
        ).bind(googleId, email, name, now, existingByEmail.id).run();
        return existingByEmail.id;
      }
    }
  
    // Else create new candidate
    const id = crypto.randomUUID();
  
    await env.DB.prepare(
      `INSERT INTO candidates (id, email, google_id, google_email, google_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, googleId, email, name, now, now).run();
  
    await env.DB.prepare(
      `INSERT OR IGNORE INTO candidate_profiles
       (candidate_id, profile_completeness, is_searchable, created_at, updated_at)
       VALUES (?, 0, 0, ?, ?)`
    ).bind(id, now, now).run();
  
    return id;
}