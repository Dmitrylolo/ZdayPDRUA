import type { Question, QuestionSection } from './questions.types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const devData = require('@/assets/questions/questions.dev.json') as {
  questions: Question[];
};

const _questions: Question[] = devData.questions;

const _sectionsMap = new Map<string, QuestionSection>();
for (const q of _questions) {
  const existing = _sectionsMap.get(q.sectionId);
  if (!existing) {
    _sectionsMap.set(q.sectionId, {
      id: q.sectionId,
      title: q.sectionTitle,
      count: 1,
    });
  } else {
    existing.count += 1;
  }
}

const _sections: QuestionSection[] = Array.from(_sectionsMap.values());

export const questionsRepository = {
  getAllQuestions(): Question[] {
    return _questions;
  },

  getSections(): QuestionSection[] {
    return _sections;
  },

  getQuestionsBySectionIds(sectionIds: string[]): Question[] {
    const set = new Set(sectionIds);
    return _questions.filter(q => set.has(q.sectionId));
  },

  getQuestionById(id: string): Question | undefined {
    return _questions.find(q => q.id === id);
  },
};
