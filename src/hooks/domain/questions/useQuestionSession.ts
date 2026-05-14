import { useCallback, useState } from 'react';

import type { ExamResult } from '@/services/progress/progress.types';
import { progressStorage } from '@/services/progress/progressStorage';
import type { Question } from '@/services/questions/questions.types';
import { questionsRepository } from '@/services/questions/questionsRepository';
import { vehicleCategoryStorage } from '@/services/vehicleCategory/vehicleCategory';

interface SessionConfig {
  sectionIds?: string[];
  questionIds?: string[];
  shuffled?: boolean;
  limit?: number;
  /** 'exam' mode skips saving training progress per answer. Call submitExam() on finish. */
  mode?: 'training' | 'exam';
}

const buildQuestions = (config: SessionConfig): Question[] => {
  let qs: Question[];

  if (config.questionIds && config.questionIds.length > 0) {
    qs = config.questionIds
      .map(id => questionsRepository.getQuestionById(id))
      .filter((q): q is Question => q !== undefined);
  } else if (config.sectionIds && config.sectionIds.length > 0) {
    qs = questionsRepository.getQuestionsBySectionIds(config.sectionIds);
  } else {
    // Default: respect active vehicle category
    const catId = vehicleCategoryStorage.getSelected();
    const sectionIds = catId ? vehicleCategoryStorage.getSectionIds(catId) : [];
    qs = questionsRepository.getQuestionsFiltered(sectionIds);
  }

  if (config.shuffled) {
    qs = [...qs].sort(() => Math.random() - 0.5);
  }

  if (config.limit != null && config.limit < qs.length) {
    qs = qs.slice(0, config.limit);
  }

  return qs;
};

export const useQuestionSession = (config: SessionConfig) => {
  const [questions] = useState<Question[]>(() => buildQuestions(config));

  // Queue of indices into `questions[]` still to answer (head = current)
  const [queue, setQueue] = useState<number[]>(() =>
    questions.map((_, i) => i),
  );
  // Sequential display counter (0, 1, 2…) — for "Питання X з Y" progress
  const [displayIndex, setDisplayIndex] = useState(0);

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, number>>(
    {},
  );
  // IDs of skipped questions (in skip order)
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  const queueHead = queue[0] ?? -1;
  const currentQuestion = queueHead >= 0 ? (questions[queueHead] ?? null) : null;
  const isLastQuestion = queue.length <= 1;
  const isFinished = queue.length === 0;

  const sessionCorrect = Object.entries(sessionAnswers).filter(
    ([qId, answerIdx]) => {
      const q = questions.find(item => item.id === qId);
      return q != null && answerIdx === q.correctAnswerIndex;
    },
  ).length;

  const selectAnswer = useCallback(
    (answerIndex: number) => {
      if (isAnswered || !currentQuestion) return;
      setSelectedAnswer(answerIndex);
      setIsAnswered(true);
      setSessionAnswers(prev => ({
        ...prev,
        [currentQuestion.id]: answerIndex,
      }));
      if (config.mode !== 'exam') {
        const isCorrect = answerIndex === currentQuestion.correctAnswerIndex;
        progressStorage.saveAttempt(
          currentQuestion.id,
          isCorrect,
          currentQuestion.sectionId,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAnswered, currentQuestion],
  );

  /** Skip current question (training only). Moves to next; skipped tracked separately. */
  const skipQuestion = useCallback(() => {
    if (!currentQuestion || isAnswered) return;
    setSkippedIds(prev => [...prev, currentQuestion.id]);
    setQueue(prev => prev.slice(1));
    setSelectedAnswer(null);
    setIsAnswered(false);
    setDisplayIndex(prev => prev + 1);
  }, [currentQuestion, isAnswered]);

  const submitExam = useCallback((): ExamResult => {
    const catId = vehicleCategoryStorage.getSelected() ?? 'B';
    const answers = questions.map(q => ({
      questionId: q.id,
      sectionId: q.sectionId,
      selectedAnswer: sessionAnswers[q.id] ?? -1,
      correctAnswer: q.correctAnswerIndex ?? -1,
      isCorrect: sessionAnswers[q.id] === q.correctAnswerIndex,
    }));
    const score = answers.filter(a => a.isCorrect).length;
    const result: ExamResult = {
      id: String(Date.now()),
      timestamp: Date.now(),
      score,
      total: questions.length,
      categoryId: catId,
      answers,
    };
    progressStorage.saveExamResult(result);
    return result;
  }, [questions, sessionAnswers]);

  const nextQuestion = useCallback(() => {
    if (isLastQuestion) return;
    setQueue(prev => prev.slice(1));
    setSelectedAnswer(null);
    setIsAnswered(false);
    setDisplayIndex(prev => prev + 1);
  }, [isLastQuestion]);

  return {
    question: currentQuestion,
    questions,
    /** Sequential display index (0-based) for progress bar / "Питання X з Y" */
    currentIndex: displayIndex,
    selectedAnswer,
    isAnswered,
    isLastQuestion,
    isFinished,
    totalCount: questions.length,
    sessionCorrect,
    sessionAnswers,
    skippedIds,
    skippedCount: skippedIds.length,
    selectAnswer,
    skipQuestion,
    nextQuestion,
    submitExam,
  };
};
