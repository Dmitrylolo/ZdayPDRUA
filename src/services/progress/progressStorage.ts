import type { Progress, QuestionAttempt, QuestionProgress } from './progress.types';

let _state: Progress = {
  attempts: [],
  byQuestion: {},
};

export const progressStorage = {
  getProgress(): Progress {
    return _state;
  },

  saveAttempt(
    questionId: string,
    isCorrect: boolean,
    sectionId: string,
  ): void {
    const attempt: QuestionAttempt = {
      questionId,
      sectionId,
      isCorrect,
      timestamp: Date.now(),
    };

    const existing: QuestionProgress = _state.byQuestion[questionId] ?? {
      questionId,
      sectionId,
      correctCount: 0,
      wrongCount: 0,
      lastAnswerCorrect: false,
      lastAttemptAt: 0,
    };

    _state = {
      attempts: [..._state.attempts, attempt],
      byQuestion: {
        ..._state.byQuestion,
        [questionId]: {
          ...existing,
          correctCount: existing.correctCount + (isCorrect ? 1 : 0),
          wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
          lastAnswerCorrect: isCorrect,
          lastAttemptAt: attempt.timestamp,
        },
      },
    };
  },

  resetProgress(): void {
    _state = { attempts: [], byQuestion: {} };
  },
};
