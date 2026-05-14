import { useCallback, useState } from 'react';

import type { Progress } from '@/services/progress/progress.types';
import { progressStorage } from '@/services/progress/progressStorage';
import { questionsRepository } from '@/services/questions/questionsRepository';
import { vehicleCategoryStorage } from '@/services/vehicleCategory/vehicleCategory';

export interface SectionStat {
  id: string;
  title: string;
  totalCount: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
}

export const useQuestionStats = () => {
  const [progress, setProgress] = useState<Progress>(() =>
    progressStorage.getProgress(),
  );

  const refresh = useCallback(() => {
    setProgress(progressStorage.getProgress());
  }, []);

  const resetProgress = useCallback(() => {
    progressStorage.resetProgress();
    setProgress(progressStorage.getProgress());
  }, []);

  // Respect active vehicle category
  const activeCategoryId = vehicleCategoryStorage.getSelected();
  const activeSectionIds = activeCategoryId
    ? vehicleCategoryStorage.getSectionIds(activeCategoryId)
    : [];
  const categoryQuestions = questionsRepository.getQuestionsFiltered(activeSectionIds);
  const categorySections = questionsRepository.getSectionsFiltered(activeSectionIds);

  const byQ = progress.byQuestion;

  // Only count answered entries that belong to the active category
  const categoryQuestionIds = new Set(categoryQuestions.map(q => q.id));
  const answeredEntries = Object.values(byQ).filter(qp =>
    categoryQuestionIds.has(qp.questionId),
  );

  // Question-centric: one entry per unique question answered
  const totalQuestions = categoryQuestions.length;
  const uniqueAnswered = answeredEntries.length;
  const correctCount = answeredEntries.filter(q => q.lastAnswerCorrect).length;
  const wrongCount = uniqueAnswered - correctCount;
  const correctPercentage =
    uniqueAnswered > 0 ? Math.round((correctCount / uniqueAnswered) * 100) : 0;
  const coveragePercentage =
    totalQuestions > 0
      ? Math.round((uniqueAnswered / totalQuestions) * 100)
      : 0;

  const sectionStats: SectionStat[] = categorySections.map(section => {
    const sectionAnswered = answeredEntries.filter(
      q => q.sectionId === section.id,
    );
    const sCorrect = sectionAnswered.filter(q => q.lastAnswerCorrect).length;
    const sWrong = sectionAnswered.length - sCorrect;
    return {
      id: section.id,
      title: section.title,
      totalCount: section.count,
      answeredCount: sectionAnswered.length,
      correctCount: sCorrect,
      wrongCount: sWrong,
    };
  });

  const weakestSections = [...sectionStats]
    .filter(s => s.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 5);

  const questionsWithMistakes = answeredEntries
    .filter(qp => qp.wrongCount > 0)
    .map(qp => qp.questionId);

  return {
    totalQuestions,
    uniqueAnswered,
    correctCount,
    wrongCount,
    correctPercentage,
    coveragePercentage,
    sectionStats,
    weakestSections,
    questionsWithMistakes,
    byQuestion: byQ,
    refresh,
    resetProgress,
  };
};
