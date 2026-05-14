import { useFocusEffect } from '@react-navigation/native';
import {
  AlertCircle,
  BarChart2,
  BookOpen,
  ChevronRight,
  ClipboardList,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SafeScreen } from '@/components/templates';
import { useQuestionStats } from '@/hooks/domain/questions/useQuestionStats';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import {
  VEHICLE_CATEGORIES,
  vehicleCategoryStorage,
} from '@/services/vehicleCategory/vehicleCategory';
import { useTheme } from '@/theme';

const ICON_COLORS = {
  training: '#44427D',
  exam: '#2980B9',
  mistakes: '#E67E22',
  statistics: '#27AE60',
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  android: { elevation: 4 },
  default: {},
});

function useCountUp(target: number, trigger: number) {
  const [value, setValue] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (target === 0) { setValue(0); return; }
    let step = 0;
    const steps = 40;
    timerRef.current = setInterval(() => {
      step++;
      setValue(Math.round((step / steps) * target));
      if (step >= steps) {
        setValue(target);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 900 / steps);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return value;
}

function Home({ navigation }: RootScreenProps<Paths.Home>) {
  const { fonts, gutters, layout, borders } = useTheme();
  const stats = useQuestionStats();
  const [animTrigger, setAnimTrigger] = useState(0);

  const activeCategoryId = vehicleCategoryStorage.getSelected();
  const activeCategory = VEHICLE_CATEGORIES.find(c => c.id === activeCategoryId);

  // Reanimated shared values for progress bar (fill/empty flex)
  const barFill = useSharedValue(0);
  const barEmpty = useSharedValue(100);
  const fillStyle = useAnimatedStyle(() => ({ flex: barFill.value }));
  const emptyStyle = useAnimatedStyle(() => ({ flex: barEmpty.value }));

  useFocusEffect(
    useCallback(() => {
      stats.refresh();
    }, [stats.refresh]),
  );

  // Animate whenever stats change (on focus refresh)
  useEffect(() => {
    barFill.value = 0;
    barEmpty.value = 100;
    barFill.value = withTiming(stats.coveragePercentage, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
    barEmpty.value = withTiming(100 - stats.coveragePercentage, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
    setAnimTrigger(t => t + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.coveragePercentage, stats.uniqueAnswered]);

  const displayPct = useCountUp(stats.coveragePercentage, animTrigger);
  const displayAnswered = useCountUp(stats.uniqueAnswered, animTrigger);

  const menuCards = [
    {
      id: 'training',
      title: 'Навчання',
      subtitle: 'Вивчай за розділами',
      icon: <BookOpen size={28} color={ICON_COLORS.training} />,
      iconBg: '#E1E1EF',
      onPress: () => navigation.navigate(Paths.Categories),
    },
    {
      id: 'exam',
      title: 'Іспит',
      subtitle: '20 випадкових питань',
      icon: <ClipboardList size={28} color={ICON_COLORS.exam} />,
      iconBg: '#D6EAF8',
      onPress: () => navigation.navigate(Paths.Exam),
    },
    {
      id: 'mistakes',
      title: 'Помилки',
      subtitle: `${stats.questionsWithMistakes.length} питань`,
      icon: <AlertCircle size={28} color={ICON_COLORS.mistakes} />,
      iconBg: '#FDEBD0',
      onPress: () => navigation.navigate(Paths.Mistakes),
    },
    {
      id: 'statistics',
      title: 'Статистика',
      subtitle: `${stats.correctPercentage}% правильно`,
      icon: <BarChart2 size={28} color={ICON_COLORS.statistics} />,
      iconBg: '#D5F5E3',
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
        <View style={[layout.row, layout.itemsCenter, layout.justifyBetween, gutters.marginBottom_24, gutters.marginTop_16]}>
          <View>
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
              Підготовка до іспиту ПДР
            </Text>
          </View>

          {/* Category badge */}
          <Pressable
            onPress={() => navigation.navigate(Paths.CategoryPicker)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#E1E1EF',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 16, marginRight: 4 }}>
              {activeCategory?.emoji ?? '📚'}
            </Text>
            <Text style={[fonts.size_12, fonts.bold, { color: '#44427D', marginRight: 2 }]}>
              {activeCategoryId ?? 'all'}
            </Text>
            <ChevronRight size={12} color="#44427D" />
          </Pressable>
        </View>

        {/* Overall progress card */}
        <View
          style={[
            borders.rounded_16,
            gutters.padding_16,
            gutters.marginBottom_24,
            {
              backgroundColor: '#44427D',
              shadowColor: '#44427D',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
            },
          ]}
        >
          <View
            style={[
              layout.row,
              layout.justifyBetween,
              layout.itemsCenter,
              { marginBottom: 12 },
            ]}
          >
            <Text style={[fonts.size_16, { color: '#E1E1EF' }]}>
              Загальний прогрес
            </Text>
            <Text style={[fonts.size_24, fonts.bold, { color: '#FFFFFF' }]}>
              {`${displayPct}%`}
            </Text>
          </View>

          {/* Animated flex progress bar */}
          <View
            style={{
              height: 8,
              borderRadius: 4,
              overflow: 'hidden',
              flexDirection: 'row',
              backgroundColor: 'rgba(255,255,255,0.2)',
              marginBottom: 10,
            }}
          >
            <Animated.View
              style={[fillStyle, { backgroundColor: '#FFFFFF', borderRadius: 4 }]}
            />
            <Animated.View style={emptyStyle} />
          </View>

          <View style={[layout.row, layout.justifyBetween]}>
            <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
              {`Відповіли ${displayAnswered} з ${stats.totalQuestions}`}
            </Text>
            <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
              {`✓ ${stats.correctCount}  ✗ ${stats.wrongCount}`}
            </Text>
          </View>
        </View>

        {/* Menu grid — all cards equal, differentiated by icon color */}
        <View style={[layout.row, layout.wrap, { gap: 12 }]}>
          {menuCards.map(card => (
            <Pressable
              key={card.id}
              onPress={card.onPress}
              style={({ pressed }) => [
                borders.rounded_16,
                cardShadow,
                {
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#F0F0F0',
                  padding: 20,
                  width: '47%',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {/* Colored icon container */}
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: card.iconBg,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                {card.icon}
              </View>
              <Text
                style={[
                  fonts.size_16,
                  fonts.bold,
                  fonts.gray800,
                  { marginBottom: 4 },
                ]}
              >
                {card.title}
              </Text>
              <Text style={[fonts.size_12, fonts.gray200]}>
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
