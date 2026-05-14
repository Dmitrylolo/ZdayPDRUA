import { createMMKV } from 'react-native-mmkv';

import type {
  ExamResult,
  Progress,
  QuestionAttempt,
  QuestionProgress,
} from './progress.types';

const _storage = createMMKV({ id: 'progress' });
const PROGRESS_KEY = 'byQuestion';
const EXAM_KEY = 'examResults';

function _loadByQuestion(): Record<string, QuestionProgress> {
  const raw = _storage.getString(PROGRESS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, QuestionProgress>;
  } catch {
    return {};
  }
}

function _loadExamResults(): ExamResult[] {
  const raw = _storage.getString(EXAM_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ExamResult[];
  } catch {
    return [];
  }
}

let _state: Progress = {
  attempts: [],
  byQuestion: _loadByQuestion(),
  examResults: _loadExamResults(),
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

    const newByQuestion = {
      ..._state.byQuestion,
      [questionId]: {
        ...existing,
        correctCount: existing.correctCount + (isCorrect ? 1 : 0),
        wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
        lastAnswerCorrect: isCorrect,
        lastAttemptAt: attempt.timestamp,
      },
    };
    _storage.set(PROGRESS_KEY, JSON.stringify(newByQuestion));
    _state = {
      ..._state,
      attempts: [..._state.attempts, attempt],
      byQuestion: newByQuestion,
    };
  },

  saveExamResult(result: ExamResult): void {
    const newResults = [..._state.examResults, result];
    _storage.set(EXAM_KEY, JSON.stringify(newResults));
    _state = { ..._state, examResults: newResults };
  },

  getExamResults(): ExamResult[] {
    return _state.examResults;
  },

  resetProgress(): void {
    _storage.remove(PROGRESS_KEY);
    _storage.remove(EXAM_KEY);
    _state = { attempts: [], byQuestion: {}, examResults: [] };
  },
};

