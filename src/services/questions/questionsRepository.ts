import type { Question, QuestionSection } from './questions.types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _data = require('@/assets/questions/questions.json') as {
  questions: Question[];
};

const _questions: Question[] = _data.questions;

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

  /** Returns only sections whose IDs are in the given set. */
  getSectionsFiltered(sectionIds: string[]): QuestionSection[] {
    if (sectionIds.length === 0) return _sections;
    const set = new Set(sectionIds);
    return _sections.filter(s => set.has(s.id));
  },

  /** Returns only questions whose sectionId is in the given set. */
  getQuestionsFiltered(sectionIds: string[]): Question[] {
    if (sectionIds.length === 0) return _questions;
    const set = new Set(sectionIds);
    return _questions.filter(q => set.has(q.sectionId));
  },

  getQuestionsBySectionIds(sectionIds: string[]): Question[] {
    const set = new Set(sectionIds);
    return _questions.filter(q => set.has(q.sectionId));
  },

  getQuestionById(id: string): Question | undefined {
    return _questions.find(q => q.id === id);
  },
};
