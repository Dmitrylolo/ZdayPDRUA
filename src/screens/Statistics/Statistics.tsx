import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SafeScreen } from '@/components/templates';
import type { SectionStat } from '@/hooks/domain/questions/useQuestionStats';
import { useQuestionStats } from '@/hooks/domain/questions/useQuestionStats';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { useTheme } from '@/theme';

/** Animated progress bar that runs from 0 → pct on mount */
function AnimatedBar({
  pct,
  color,
  height = 6,
  bgColor = '#F0F0F0',
}: {
  pct: number;
  color: string;
  height?: number;
  bgColor?: string;
}) {
  const fill = useSharedValue(0);
  const empty = useSharedValue(100);

  useEffect(() => {
    fill.value = withTiming(pct, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
    empty.value = withTiming(100 - pct, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  // only run on mount (key trick handles re-mount on re-open)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillStyle = useAnimatedStyle(() => ({ flex: fill.value }));
  const emptyStyle = useAnimatedStyle(() => ({ flex: empty.value }));

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        overflow: 'hidden',
        flexDirection: 'row',
        backgroundColor: bgColor,
        flex: 1,
      }}
    >
      <Animated.View style={[fillStyle, { backgroundColor: color }]} />
      <Animated.View style={emptyStyle} />
    </View>
  );
}

function SectionRow({
  section,
  isExpanded,
  onToggle,
}: {
  section: SectionStat;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { fonts, gutters, layout, borders } = useTheme();
  const pct =
    section.totalCount > 0
      ? Math.round((section.answeredCount / section.totalCount) * 100)
      : 0;
  const correctPct =
    section.answeredCount > 0
      ? Math.round((section.correctCount / section.answeredCount) * 100)
      : 0;

  const hasActivity = section.answeredCount > 0;

  return (
    <View
      style={[
        borders.rounded_16,
        gutters.marginBottom_12,
        {
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: isExpanded ? '#44427D' : '#E0E0E0',
          overflow: 'hidden',
        },
      ]}
    >
      {/* Header row */}
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          layout.row,
          layout.itemsCenter,
          gutters.padding_16,
          { opacity: pressed ? 0.8 : 1 },
        ]}
      >
        {/* Toggle arrow */}
        <View style={{ width: 20, marginRight: 8, alignItems: 'center' }}>
          {isExpanded ? (
            <ChevronDown size={16} color="#44427D" />
          ) : (
            <ChevronRight size={16} color="#A1A1A1" />
          )}
        </View>

        {/* Title */}
        <Text
          style={[
            fonts.size_12,
            { flex: 1, color: '#303030', lineHeight: 16 },
          ]}
          numberOfLines={2}
        >
          {section.title}
        </Text>

        {/* Badge: answered/total */}
        <View style={{ marginLeft: 8, alignItems: 'flex-end' }}>
          <Text
            style={[
              fonts.size_12,
              fonts.bold,
              {
                color: hasActivity ? '#44427D' : '#A1A1A1',
              },
            ]}
          >
            {`${section.answeredCount}/${section.totalCount}`}
          </Text>
          {hasActivity && (
            <Text style={[fonts.size_12, { color: '#A1A1A1' }]}>
              {`${pct}%`}
            </Text>
          )}
        </View>
      </Pressable>

      {/* Animated progress bar in header */}
      {hasActivity && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row' }}>
          <AnimatedBar
            key={`header-${section.id}-${section.answeredCount}`}
            pct={pct}
            color={correctPct >= 70 ? '#27AE60' : '#44427D'}
          />
        </View>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <View
          style={[
            gutters.padding_16,
            { borderTopWidth: 1, borderTopColor: '#F0F0F0' },
          ]}
        >
          {/* Stats row */}
          <View style={[layout.row, { gap: 24, marginBottom: 12 }]}>
            <View style={layout.itemsCenter}>
              <Text style={[fonts.size_16, fonts.bold, { color: '#303030' }]}>
                {section.totalCount}
              </Text>
              <Text style={[fonts.size_12, { color: '#A1A1A1' }]}>
                всього
              </Text>
            </View>
            <View style={layout.itemsCenter}>
              <Text style={[fonts.size_16, fonts.bold, { color: '#44427D' }]}>
                {section.answeredCount}
              </Text>
              <Text style={[fonts.size_12, { color: '#A1A1A1' }]}>
                відповіли
              </Text>
            </View>
            <View style={layout.itemsCenter}>
              <Text style={[fonts.size_16, fonts.bold, { color: '#27AE60' }]}>
                {section.correctCount}
              </Text>
              <Text style={[fonts.size_12, { color: '#A1A1A1' }]}>
                правильно
              </Text>
            </View>
            <View style={layout.itemsCenter}>
              <Text style={[fonts.size_16, fonts.bold, { color: '#C13333' }]}>
                {section.wrongCount}
              </Text>
              <Text style={[fonts.size_12, { color: '#A1A1A1' }]}>
                помилки
              </Text>
            </View>
          </View>

          {/* Correct rate bar */}
          {section.answeredCount > 0 && (
            <View>
              <View style={[layout.row, layout.justifyBetween, { marginBottom: 4 }]}>
                <Text style={[fonts.size_12, { color: '#A1A1A1' }]}>
                  Точність відповідей
                </Text>
                <Text style={[fonts.size_12, fonts.bold, { color: correctPct >= 70 ? '#27AE60' : '#C13333' }]}>
                  {`${correctPct}%`}
                </Text>
              </View>
              <AnimatedBar
                key={`detail-${section.id}-${section.correctCount}`}
                pct={correctPct}
                color={correctPct >= 70 ? '#27AE60' : '#C13333'}
              />
            </View>
          )}

          {section.answeredCount === 0 && (
            <Text style={[fonts.size_12, { color: '#A1A1A1', fontStyle: 'italic' }]}>
              Ще не відповідали на питання цього розділу
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function Statistics({ navigation }: RootScreenProps<Paths.Statistics>) {
  const { fonts, gutters, layout, borders } = useTheme();
  const stats = useQuestionStats();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  // Animated overall bar
  const barFill = useSharedValue(0);
  const barEmpty = useSharedValue(100);
  const fillStyle = useAnimatedStyle(() => ({ flex: barFill.value }));
  const emptyStyle = useAnimatedStyle(() => ({ flex: barEmpty.value }));

  useFocusEffect(
    useCallback(() => {
      stats.refresh();
    }, [stats.refresh]),
  );

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.coveragePercentage]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
          Статистика
        </Text>
        <Pressable onPress={stats.resetProgress}>
          <Text style={[fonts.size_12, { color: '#C13333' }]}>Скинути</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[gutters.padding_24]}
        showsVerticalScrollIndicator={false}
      >
        {/* Overall summary card */}
        <View
          style={[
            borders.rounded_16,
            gutters.padding_16,
            gutters.marginBottom_16,
            { backgroundColor: '#44427D' },
          ]}
        >
          <Text style={[fonts.size_12, { color: '#E1E1EF', marginBottom: 8 }]}>
            Загальний прогрес
          </Text>

          {/* Animated coverage bar */}
          <View
            style={[
              layout.row,
              layout.itemsCenter,
              { gap: 12, marginBottom: 6 },
            ]}
          >
            <View
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                overflow: 'hidden',
                flexDirection: 'row',
                backgroundColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Animated.View
                style={[fillStyle, { backgroundColor: '#FFFFFF' }]}
              />
              <Animated.View style={emptyStyle} />
            </View>
            <Text
              style={[
                fonts.size_12,
                fonts.bold,
                { color: '#FFFFFF', width: 36, textAlign: 'right' },
              ]}
            >
              {`${stats.coveragePercentage}%`}
            </Text>
          </View>
          <Text style={[fonts.size_12, { color: '#E1E1EF', marginBottom: 16 }]}>
            {`${stats.uniqueAnswered} з ${stats.totalQuestions} питань відповіли`}
          </Text>

          {/* 4 stat pills */}
          <View style={[layout.row, { gap: 8 }]}>
            <View
              style={[
                layout.flex_1,
                layout.itemsCenter,
                { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 8 },
              ]}
            >
              <Text style={[fonts.size_16, fonts.bold, { color: '#FFFFFF' }]}>
                {`${stats.correctPercentage}%`}
              </Text>
              <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
                точність
              </Text>
            </View>
            <View
              style={[
                layout.flex_1,
                layout.itemsCenter,
                { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 8 },
              ]}
            >
              <Text style={[fonts.size_16, fonts.bold, { color: '#FFFFFF' }]}>
                {stats.uniqueAnswered}
              </Text>
              <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
                питань
              </Text>
            </View>
            <View
              style={[
                layout.flex_1,
                layout.itemsCenter,
                { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 8 },
              ]}
            >
              <Text style={[fonts.size_16, fonts.bold, { color: '#A8EBC5' }]}>
                {stats.correctCount}
              </Text>
              <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
                правильно
              </Text>
            </View>
            <View
              style={[
                layout.flex_1,
                layout.itemsCenter,
                { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 8 },
              ]}
            >
              <Text style={[fonts.size_16, fonts.bold, { color: '#FFAAAA' }]}>
                {stats.wrongCount}
              </Text>
              <Text style={[fonts.size_12, { color: '#E1E1EF' }]}>
                помилки
              </Text>
            </View>
          </View>
        </View>

        {/* Section accordion */}
        <View style={[layout.row, layout.justifyBetween, layout.itemsCenter, { marginBottom: 12 }]}>
          <Text style={[fonts.size_16, fonts.bold, fonts.gray800]}>
            По розділах
          </Text>
          <Pressable
            onPress={() => {
              if (expandedSections.size === stats.sectionStats.length) {
                setExpandedSections(new Set());
              } else {
                setExpandedSections(new Set(stats.sectionStats.map(s => s.id)));
              }
            }}
          >
            <Text style={[fonts.size_12, fonts.purple500]}>
              {expandedSections.size === stats.sectionStats.length
                ? 'Згорнути всі'
                : 'Розгорнути всі'}
            </Text>
          </Pressable>
        </View>

        {stats.sectionStats.map(section => (
          <SectionRow
            key={section.id}
            section={section}
            isExpanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
          />
        ))}

        {stats.uniqueAnswered === 0 && (
          <View style={[layout.itemsCenter, gutters.marginTop_32]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📊</Text>
            <Text
              style={[
                fonts.size_16,
                fonts.gray400,
                { textAlign: 'center' },
              ]}
            >
              {'Поки що немає даних.\nПройдіть кілька питань!'}
            </Text>
            <Pressable
              onPress={() => navigation.navigate(Paths.Categories)}
              style={[gutters.marginTop_16]}
            >
              <Text style={[fonts.size_16, fonts.purple500]}>
                Почати навчання →
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

export default Statistics;
