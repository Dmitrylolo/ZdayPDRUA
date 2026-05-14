import { useCallback, useState } from 'react';

import { progressStorage } from '@/services/progress/progressStorage';
import type { Question } from '@/services/questions/questions.types';
import { questionsRepository } from '@/services/questions/questionsRepository';

interface SessionConfig {
  sectionIds?: string[];
  questionIds?: string[];
  shuffled?: boolean;
  limit?: number;
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
    qs = questionsRepository.getAllQuestions();
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState<
    Record<string, number>
  >({});

  const currentQuestion = questions[currentIndex] ?? null;
  const isLastQuestion = currentIndex >= questions.length - 1;

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
      const isCorrect = answerIndex === currentQuestion.correctAnswerIndex;
      progressStorage.saveAttempt(
        currentQuestion.id,
        isCorrect,
        currentQuestion.sectionId,
      );
    },
    [isAnswered, currentQuestion],
  );

  const nextQuestion = useCallback(() => {
    if (isLastQuestion) return;
    setSelectedAnswer(null);
    setIsAnswered(false);
    setCurrentIndex(i => i + 1);
  }, [isLastQuestion]);

  return {
    question: currentQuestion,
    questions,
    currentIndex,
    selectedAnswer,
    isAnswered,
    isLastQuestion,
    totalCount: questions.length,
    sessionCorrect,
    sessionAnswers,
    selectAnswer,
    nextQuestion,
  };
};
