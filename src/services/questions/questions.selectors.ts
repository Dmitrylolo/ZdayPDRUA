import type { Question } from './questions.types';

export const selectRandomQuestions = (
  questions: Question[],
  count: number,
): Question[] => {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
};

export const selectQuestionsWithMistakes = (
  questions: Question[],
  byQuestion: Record<string, { wrongCount: number }>,
): Question[] => {
  return questions.filter(q => (byQuestion[q.id]?.wrongCount ?? 0) > 0);
};
