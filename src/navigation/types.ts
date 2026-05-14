import type { StackScreenProps } from '@react-navigation/stack';

import type { Paths } from '@/navigation/paths';

export type RootScreenProps<
  S extends keyof RootStackParamList = keyof RootStackParamList,
> = StackScreenProps<RootStackParamList, S>;

export type RootStackParamList = {
  [Paths.Startup]: undefined;
  [Paths.Home]: undefined;
  [Paths.CategoryPicker]: undefined;
  [Paths.Categories]: undefined;
  [Paths.Quiz]: {
    sectionIds?: string[];
    questionIds?: string[];
  };
  [Paths.Exam]: undefined;
  [Paths.Mistakes]: undefined;
  [Paths.Statistics]: undefined;
  [Paths.Example]: undefined;
};
