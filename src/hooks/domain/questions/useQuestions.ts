import { useMemo } from 'react';

import { questionsRepository } from '@/services/questions/questionsRepository';

export const useQuestions = () => {
  const questions = useMemo(() => questionsRepository.getAllQuestions(), []);
  const sections = useMemo(() => questionsRepository.getSections(), []);
  return { questions, sections };
};
