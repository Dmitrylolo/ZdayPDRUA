import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SafeScreen } from '@/components/templates';
import { useQuestionStats } from '@/hooks/domain/questions/useQuestionStats';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { questionsRepository } from '@/services/questions/questionsRepository';
import { useTheme } from '@/theme';

function Mistakes({ navigation }: RootScreenProps<Paths.Mistakes>) {
  const { fonts, gutters, layout, borders } = useTheme();
  const stats = useQuestionStats();

  useFocusEffect(
    useCallback(() => {
      stats.refresh();
    }, [stats.refresh]),
  );

  const mistakeQuestions = stats.questionsWithMistakes
    .map(id => {
      const q = questionsRepository.getQuestionById(id);
      const progress = stats.byQuestion[id];
      return q ? { question: q, progress } : null;
    })
    .filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );

  const handleRetry = useCallback(() => {
    if (stats.questionsWithMistakes.length === 0) return;
    navigation.navigate(Paths.Quiz, {
      questionIds: stats.questionsWithMistakes,
    });
  }, [stats.questionsWithMistakes, navigation]);

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
          Помилки
        </Text>
        <Text style={[{ fontSize: 14 }, fonts.gray200]}>
          {`${mistakeQuestions.length}`}
        </Text>
      </View>

      {mistakeQuestions.length === 0 ? (
        <View
          style={[layout.flex_1, layout.justifyCenter, layout.itemsCenter, gutters.padding_24]}
        >
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🎉</Text>
          <Text style={[fonts.size_16, fonts.bold, fonts.gray800, { textAlign: 'center' }]}>
            Помилок поки немає!
          </Text>
          <Text style={[{ fontSize: 14 }, fonts.gray200, { textAlign: 'center', marginTop: 8 }]}>
            Пройдіть навчання, щоб побачити питання з помилками тут.
          </Text>
          <Pressable
            onPress={() => navigation.navigate(Paths.Categories)}
            style={[gutters.marginTop_24]}
          >
            <Text style={[fonts.size_16, fonts.purple500]}>Почати навчання →</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[gutters.padding_24]}
            showsVerticalScrollIndicator={false}
          >
            {mistakeQuestions.map(({ question, progress }) => (
              <View
                key={question.id}
                style={[
                  borders.rounded_16,
                  gutters.padding_16,
                  gutters.marginBottom_12,
                  { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E0E0' },
                ]}
              >
                <View style={[layout.row, layout.justifyBetween, layout.itemsCenter, { marginBottom: 8 }]}>
                  <Text style={[fonts.size_12, fonts.gray200]}>
                    {`Розділ ${question.sectionId} · №${question.number}`}
                  </Text>
                  <View
                    style={[
                      layout.row,
                      layout.itemsCenter,
                      { backgroundColor: '#FFEBEE', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
                    ]}
                  >
                    <Text style={[fonts.size_12, { color: '#C13333' }]}>
                      {`✗ ${progress.wrongCount}`}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[{ fontSize: 14 }, fonts.gray800, { lineHeight: 20 }]}
                  numberOfLines={3}
                >
                  {question.text}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Retry button */}
          <View
            style={[
              gutters.padding_24,
              { borderTopWidth: 1, borderTopColor: '#E0E0E0' },
            ]}
          >
            <Pressable
              onPress={handleRetry}
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
                Повторити помилки
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeScreen>
  );
}

export default Mistakes;
