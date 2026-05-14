import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AnswerState } from '@/components/AnswerOption';
import AnswerOption from '@/components/AnswerOption';
import QuestionCard from '@/components/QuestionCard';
import { SafeScreen } from '@/components/templates';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { progressStorage } from '@/services/progress/progressStorage';
import { questionsRepository } from '@/services/questions/questionsRepository';
import { useTheme } from '@/theme';

function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ExamDetail({
  navigation,
  route,
}: RootScreenProps<Paths.ExamDetail>) {
  const { fonts, gutters, layout, borders } = useTheme();
  const { examId } = route.params;

  const result = progressStorage.getExamResults().find(r => r.id === examId);

  if (!result) {
    return (
      <SafeScreen>
        <View
          style={[layout.flex_1, layout.justifyCenter, layout.itemsCenter]}
        >
          <Text style={[fonts.size_16, fonts.gray400]}>
            Результат не знайдено
          </Text>
        </View>
      </SafeScreen>
    );
  }

  const pct = Math.round((result.score / result.total) * 100);
  const passed = pct >= 70;

  return (
    <SafeScreen>
      {/* Header */}
      <View
        style={[
          layout.row,
          layout.itemsCenter,
          gutters.paddingHorizontal_24,
          gutters.paddingVertical_16,
          { borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <ChevronLeft size={28} color="#44427D" />
        </Pressable>
        <Text style={[fonts.size_16, fonts.bold, fonts.gray800, { flex: 1 }]}>
          Результати іспиту
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[gutters.padding_24]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <View
          style={[
            borders.rounded_16,
            gutters.padding_16,
            gutters.marginBottom_24,
            { backgroundColor: passed ? '#27AE60' : '#C13333' },
          ]}
        >
          <Text
            style={[
              fonts.size_12,
              { color: 'rgba(255,255,255,0.75)', marginBottom: 6 },
            ]}
          >
            {`${formatDate(result.timestamp)}  ·  Категорія ${result.categoryId}`}
          </Text>
          <Text
            style={[
              fonts.size_32,
              fonts.bold,
              { color: '#FFFFFF', marginBottom: 4 },
            ]}
          >
            {`${result.score} / ${result.total}`}
          </Text>
          <Text style={[fonts.size_16, { color: 'rgba(255,255,255,0.9)' }]}>
            {passed ? `Склав  ·  ${pct}%` : `Не склав  ·  ${pct}%`}
          </Text>
        </View>

        {/* Question list */}
        {result.answers.map((ans, idx) => {
          const q = questionsRepository.getQuestionById(ans.questionId);
          if (!q) return null;

          return (
            <View
              key={ans.questionId}
              style={[
                borders.rounded_16,
                gutters.marginBottom_24,
                {
                  overflow: 'hidden',
                  borderWidth: 1.5,
                  borderColor: ans.isCorrect ? '#27AE60' : '#C13333',
                },
              ]}
            >
              {/* Correct / Wrong badge row */}
              <View
                style={[
                  layout.row,
                  layout.itemsCenter,
                  layout.justifyBetween,
                  {
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: ans.isCorrect ? '#E8F5E9' : '#FFEBEE',
                  },
                ]}
              >
                <Text
                  style={[
                    fonts.size_12,
                    fonts.bold,
                    { color: ans.isCorrect ? '#27AE60' : '#C13333' },
                  ]}
                >
                  {`Питання ${idx + 1}`}
                </Text>
                <Text
                  style={[
                    fonts.size_12,
                    fonts.bold,
                    { color: ans.isCorrect ? '#27AE60' : '#C13333' },
                  ]}
                >
                  {ans.isCorrect ? '✓ Правильно' : '✗ Помилка'}
                </Text>
              </View>

              {/* Question card + answers */}
              <View style={[gutters.padding_16]}>
                <QuestionCard
                  question={q}
                  currentIndex={idx}
                  totalCount={result.total}
                />

                {q.answers.map(answer => {
                  let state: AnswerState;
                  if (answer.index === ans.correctAnswer) {
                    state = 'correct';
                  } else if (
                    answer.index === ans.selectedAnswer &&
                    !ans.isCorrect
                  ) {
                    state = 'wrong';
                  } else {
                    state = 'default';
                  }
                  return (
                    <AnswerOption
                      key={answer.index}
                      answer={answer}
                      state={state}
                      onPress={() => {}}
                      disabled
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeScreen>
  );
}

export default ExamDetail;
