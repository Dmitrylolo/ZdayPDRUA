export interface Answer {
  index: number;
  text: string;
}

export interface Question {
  id: string;
  naturalId: string;
  occurrence: number;
  sectionId: string;
  sectionTitle: string;
  number: number;
  page: number;
  text: string;
  answers: Answer[];
  correctAnswerIndex?: number;
  image?: string | null;
}

export interface QuestionSection {
  id: string;
  title: string;
  count: number;
}
