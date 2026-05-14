import { Pressable, ScrollView, Text, View } from 'react-native';

import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { useTheme } from '@/theme';
import { SafeScreen } from '@/components/templates';
import AnswerOption from '@/components/AnswerOption';
import type { AnswerState } from '@/components/AnswerOption';
import QuestionCard from '@/components/QuestionCard';
import { useQuestionSession } from '@/hooks/domain/questions/useQuestionSession';

function Quiz({ navigation, route }: RootScreenProps<Paths.Quiz>) {
  const { sectionIds, questionIds } = route.params;
  const { fonts, gutters, layout, borders } = useTheme();

  const session = useQuestionSession({ sectionIds, questionIds, shuffled: true });

  const getAnswerState = (answerIndex: number): AnswerState => {
    if (!session.isAnswered) return 'default';
    if (answerIndex === session.question?.correctAnswerIndex) return 'correct';
    if (answerIndex === session.selectedAnswer) return 'wrong';
    return 'default';
  };

  if (session.question == null || session.totalCount === 0) {
    return (
      <SafeScreen>
        <View style={[layout.flex_1, layout.justifyCenter, layout.itemsCenter]}>
          <Text style={[fonts.size_16, fonts.gray400]}>Немає питань</Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[gutters.marginTop_24]}
          >
            <Text style={[fonts.size_16, fonts.purple500]}>← Назад</Text>
          </Pressable>
        </View>
      </SafeScreen>
    );
  }

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
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[fonts.size_24, fonts.purple500]}>←</Text>
        </Pressable>
        <Text style={[fonts.size_16, fonts.bold, fonts.gray800, { marginLeft: 16 }]}>
          Навчання
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[gutters.padding_24]}
        showsVerticalScrollIndicator={false}
      >
        {/* Question card */}
        <View style={[gutters.marginBottom_16]}>
          <QuestionCard
            question={session.question}
            currentIndex={session.currentIndex}
            totalCount={session.totalCount}
          />
        </View>

        {/* Answer options */}
        {session.question.answers.map(answer => (
          <AnswerOption
            key={answer.index}
            answer={answer}
            state={getAnswerState(answer.index)}
            onPress={() => session.selectAnswer(answer.index)}
            disabled={session.isAnswered}
          />
        ))}

        {/* Explanation / Next */}
        {session.isAnswered && (
          <View style={[gutters.marginTop_12]}>
            {session.selectedAnswer === session.question.correctAnswerIndex ? (
              <Text
                style={[
                  { fontSize: 14 },
                  { color: '#27AE60', textAlign: 'center', marginBottom: 16 },
                ]}
              >
                ✓ Правильно!
              </Text>
            ) : (
              <Text
                style={[
                  { fontSize: 14 },
                  { color: '#C13333', textAlign: 'center', marginBottom: 16 },
                ]}
              >
                ✗ Неправильно
              </Text>
            )}

            <Pressable
              onPress={
                session.isLastQuestion
                  ? () => navigation.goBack()
                  : session.nextQuestion
              }
              style={({ pressed }) => [
                borders.rounded_16,
                {
                  backgroundColor: '#44427D',
                  padding: 16,
                  alignItems: 'center',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[fonts.size_16, fonts.bold, { color: '#FFFFFF' }]}>
                {session.isLastQuestion ? 'Завершити' : 'Далі →'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

export default Quiz;
