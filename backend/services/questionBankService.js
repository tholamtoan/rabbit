async function getSubjectBank(pool, staticBank, subjectId) {
  const fallback = Array.isArray(staticBank?.[subjectId]) ? staticBank[subjectId] : [];
  const result = await pool.query(
    'SELECT exam_term, questions FROM question_banks WHERE subject_id = $1',
    [subjectId]
  );
  if (!result.rowCount) return fallback;

  const uploadedByTerm = new Map(result.rows.map(row => [row.exam_term, row.questions || []]));
  const terms = new Set([
    ...fallback.map(question => question.term || 'midterm'),
    ...uploadedByTerm.keys()
  ]);
  const merged = [];
  for (const term of terms) {
    if (uploadedByTerm.has(term)) merged.push(...uploadedByTerm.get(term));
    else merged.push(...fallback.filter(question => (question.term || 'midterm') === term));
  }
  return merged;
}

async function getTermBank(pool, staticBank, subjectId, examTerm) {
  const result = await pool.query(
    'SELECT questions FROM question_banks WHERE subject_id = $1 AND exam_term = $2',
    [subjectId, examTerm]
  );
  if (result.rowCount) return result.rows[0].questions || [];
  return (staticBank?.[subjectId] || []).filter(question => (question.term || 'midterm') === examTerm);
}

module.exports = { getSubjectBank, getTermBank };
