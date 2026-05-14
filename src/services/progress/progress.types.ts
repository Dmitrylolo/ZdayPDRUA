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

export interface Progress {
  attempts: QuestionAttempt[];
  byQuestion: Record<string, QuestionProgress>;
}
