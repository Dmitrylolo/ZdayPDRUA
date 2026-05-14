import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SafeScreen } from '@/components/templates';
import { useQuestionStats } from '@/hooks/domain/questions/useQuestionStats';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { useTheme } from '@/theme';

type MenuCard = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  onPress: () => void;
  accent?: boolean;
};

function Home({ navigation }: RootScreenProps<Paths.Home>) {
  const { fonts, gutters, layout, borders } = useTheme();
  const stats = useQuestionStats();

  useFocusEffect(
    useCallback(() => {
      stats.refresh();
    }, [stats.refresh]),
  );

  const menuCards: MenuCard[] = [
    {
      id: 'training',
      title: 'Навчання',
      subtitle: 'Вивчай за розділами',
      emoji: '📚',
      onPress: () => navigation.navigate(Paths.Categories),
      accent: true,
    },
    {
      id: 'exam',
      title: 'Іспит',
      subtitle: '20 випадкових питань',
      emoji: '📝',
      onPress: () => navigation.navigate(Paths.Exam),
    },
    {
      id: 'mistakes',
      title: 'Помилки',
      subtitle: `${stats.questionsWithMistakes.length} питань`,
      emoji: '⚠️',
      onPress: () => navigation.navigate(Paths.Mistakes),
    },
    {
      id: 'statistics',
      title: 'Статистика',
      subtitle: `${stats.correctPercentage}% правильно`,
      emoji: '📊',
      onPress: () => navigation.navigate(Paths.Statistics),
    },
  ];

  return (
    <SafeScreen>
      <ScrollView
        contentContainerStyle={[gutters.padding_24]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[gutters.marginBottom_32, gutters.marginTop_16]}>
          <Text
            style={[
              fonts.size_32,
              fonts.bold,
              fonts.gray800,
              { letterSpacing: -0.5 },
            ]}
          >
            Здай ПДР UA
          </Text>
          <Text style={[fonts.size_16, fonts.gray200, { marginTop: 4 }]}>
            Підготовка до іспиту
          </Text>
        </View>

        {/* Overall progress card */}
        <View
          style={[
            borders.rounded_16,
            gutters.padding_16,
            gutters.marginBottom_32,
            { backgroundColor: '#44427D' },
          ]}
        >
          <View style={[layout.row, layout.justifyBetween, layout.itemsCenter, { marginBottom: 10 }]}>
            <Text style={[fonts.size_16, { color: '#E1E1EF' }]}>
              Загальний прогрес
            </Text>
            <Text
              style={[fonts.size_24, fonts.bold, { color: '#FFFFFF' }]}
            >
              {`${stats.coveragePercentage}%`}
            </Text>
          </View>

          {/* Coverage bar */}
          <View
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: '#FFFFFF',
                width: `${stats.coveragePercentage}%`,
              }}
            />
          </View>

          <View style={[layout.row, layout.justifyBetween, { marginTop: 8 }]}>
            <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
              {`Відповіли ${stats.uniqueAnswered} з ${stats.totalQuestions}`}
            </Text>
            <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
              {`✓ ${stats.correctCount}  ✗ ${stats.wrongCount}`}
            </Text>
          </View>
        </View>

        {/* Menu grid */}
        <View style={[layout.row, layout.wrap, { gap: 12 }]}>
          {menuCards.map(card => (
            <Pressable
              key={card.id}
              onPress={card.onPress}
              style={({ pressed }) => [
                borders.rounded_16,
                {
                  backgroundColor: card.accent ? '#44427D' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: card.accent ? '#44427D' : '#E0E0E0',
                  padding: 20,
                  width: '47%',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: 32, marginBottom: 8 }}>{card.emoji}</Text>
              <Text
                style={[
                  fonts.size_16,
                  fonts.bold,
                  { color: card.accent ? '#FFFFFF' : '#303030', marginBottom: 4 },
                ]}
              >
                {card.title}
              </Text>
              <Text
                style={[
                  fonts.size_12,
                  { color: card.accent ? '#E1E1EF' : '#A1A1A1' },
                ]}
              >
                {card.subtitle}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

export default Home;
