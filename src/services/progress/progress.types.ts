export interface QuestionAttempt {
  questionId: string;
  sectionId: string;
  isCorrect: boolean;
  timestamp: number;
}

export interface QuestionProgress {
  questionId: string;
  sectionId: string;
  correctCount: number;
  wrongCount: number;
  lastAnswerCorrect: boolean;
  lastAttemptAt: number;
}

export interface ExamAttemptDetail {
  questionId: string;
  sectionId: string;
  selectedAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
}

export interface ExamResult {
  id: string;
  timestamp: number;
  score: number;
  total: number;
  categoryId: string;
  answers: ExamAttemptDetail[];
}

export interface Progress {
  attempts: QuestionAttempt[];
  byQuestion: Record<string, QuestionProgress>;
  examResults: ExamResult[];
}
