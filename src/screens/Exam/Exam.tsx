import { CommonActions } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AnswerState } from '@/components/AnswerOption';
import AnswerOption from '@/components/AnswerOption';
import QuestionCard from '@/components/QuestionCard';
import { SafeScreen } from '@/components/templates';
import { useQuestionSession } from '@/hooks/domain/questions/useQuestionSession';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { haptics } from '@/utils/haptics';
import { useTheme } from '@/theme';

const EXAM_SIZE = 20;

function Exam({ navigation }: RootScreenProps<Paths.Exam>) {
  const { fonts, gutters, layout, borders } = useTheme();

  const session = useQuestionSession({ shuffled: true, limit: EXAM_SIZE, mode: 'exam' });
  const isFinished = session.isLastQuestion && session.isAnswered;
  const examSaved = useRef(false);
  // useState so setting the ID triggers a re-render and the button appears
  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  // Local pending answer — lets the user change selection before confirming with Далі
  const [pendingAnswer, setPendingAnswer] = useState<number | null>(null);

  // Save exam result exactly once when the exam finishes
  useEffect(() => {
    if (isFinished && !examSaved.current) {
      examSaved.current = true;
      const result = session.submitExam();
      setSavedExamId(result.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished]);

  const getAnswerState = (answerIndex: number): AnswerState => {
    if (answerIndex === pendingAnswer) return 'selected';
    return 'default';
  };

  // Results screen
  if (isFinished) {
    const score = session.sessionCorrect;
    const total = session.totalCount;
    const pct = Math.round((score / total) * 100);
    const passed = pct >= 70;

    return (
      <SafeScreen>
        <View
          style={[
            layout.flex_1,
            layout.col,
            layout.justifyCenter,
            layout.itemsCenter,
            gutters.padding_24,
          ]}
        >
          <Text style={{ fontSize: 64, marginBottom: 16 }}>
            {passed ? '🎉' : '📖'}
          </Text>
          <Text
            style={[
              fonts.size_32,
              fonts.bold,
              { color: passed ? '#27AE60' : '#C13333', marginBottom: 8 },
            ]}
          >
            {passed ? 'Склав!' : 'Не склав'}
          </Text>
          <Text
            style={[
              fonts.size_24,
              fonts.gray800,
              { marginBottom: 4 },
            ]}
          >
            {`${score} / ${total}`}
          </Text>
          <Text style={[fonts.size_16, fonts.gray200, { marginBottom: 40 }]}>
            {`${pct}% правильних відповідей`}
          </Text>

          <View
            style={[
              { width: '100%', height: 12, borderRadius: 6, backgroundColor: '#E0E0E0', marginBottom: 40 },
            ]}
          >
            <View
              style={{
                height: 12,
                borderRadius: 6,
                backgroundColor: passed ? '#27AE60' : '#C13333',
                width: `${pct}%`,
              }}
            />
          </View>

          <Pressable
            onPress={() => navigation.navigate(Paths.Home)}
            style={({ pressed }) => [
              borders.rounded_16,
              {
                backgroundColor: '#44427D',
                paddingVertical: 16,
                paddingHorizontal: 40,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[fonts.size_16, fonts.bold, { color: '#FFFFFF' }]}>
              На головну
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.replace(Paths.Exam)}
            style={[gutters.marginTop_16]}
          >
            <Text style={[fonts.size_16, fonts.purple500]}>
              Спробувати знову
            </Text>
          </Pressable>

          {savedExamId != null && (
            <Pressable
              onPress={() =>
                navigation.dispatch(
                  CommonActions.reset({
                    index: 2,
                    routes: [
                      { name: Paths.Home },
                      { name: Paths.Statistics },
                      { name: Paths.ExamDetail, params: { examId: savedExamId } },
                    ],
                  }),
                )
              }
              style={[gutters.marginTop_16]}
            >
              <Text style={[fonts.size_16, { color: '#2980B9' }]}>
                Переглянути детально →
              </Text>
            </Pressable>
          )}
        </View>
      </SafeScreen>
    );
  }

  if (session.question == null || session.totalCount === 0) {
    return (
      <SafeScreen>
        <View style={[layout.flex_1, layout.justifyCenter, layout.itemsCenter]}>
          <Text style={[fonts.size_16, fonts.gray400]}>Немає питань</Text>
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
          layout.justifyBetween,
          gutters.paddingHorizontal_24,
          gutters.paddingVertical_16,
          { borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#44427D" />
        </Pressable>
        <Text style={[fonts.size_16, fonts.bold, fonts.gray800]}>
          Іспит
        </Text>
        <Text style={[{ fontSize: 14 }, fonts.gray200]}>
          {`${session.currentIndex + 1} / ${session.totalCount}`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[gutters.padding_24]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[gutters.marginBottom_16]}>
          <QuestionCard
            question={session.question}
            currentIndex={session.currentIndex}
            totalCount={session.totalCount}
          />
        </View>

        {session.question.answers.map(answer => (
          <AnswerOption
            key={answer.index}
            answer={answer}
            state={getAnswerState(answer.index)}
            onPress={() => {
              haptics.selection();
              setPendingAnswer(answer.index);
            }}
            disabled={false}
          />
        ))}

        {pendingAnswer !== null && (
          <Pressable
            onPress={() => {
              haptics.impactLight();
              session.selectAnswer(pendingAnswer);
              session.nextQuestion();
              setPendingAnswer(null);
            }}
            style={({ pressed }) => [
              borders.rounded_16,
              gutters.marginTop_12,
              {
                backgroundColor: '#44427D',
                padding: 16,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[fonts.size_16, fonts.bold, { color: '#FFFFFF' }]}>
              Далі →
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

export default Exam;
