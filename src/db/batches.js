export async function createProcessingBatch(db, jobId, totalResumes) {
    const batchId = "batch_" + crypto.randomUUID();
    const now = new Date().toISOString();
  
    await db.prepare(`
      INSERT INTO processing_batches (
        id,
        job_id,
        total_resumes,
        processed_resumes,
        failed_resumes,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, 0, 'processing', ?, ?)
    `)
    .bind(batchId, jobId, totalResumes, now, now)
    .run();
  
    return batchId;
  }