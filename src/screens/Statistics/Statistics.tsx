import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SafeScreen } from '@/components/templates';
import type { SectionStat } from '@/hooks/domain/questions/useQuestionStats';
import { useQuestionStats } from '@/hooks/domain/questions/useQuestionStats';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { useTheme } from '@/theme';

function MiniBar({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <View
      style={{ height: 6, borderRadius: 3, backgroundColor: '#F0F0F0', flex: 1 }}
    >
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
          width: `${pct}%`,
        }}
      />
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
        <Text
          style={[
            fonts.size_12,
            { color: '#44427D', width: 16, marginRight: 8 },
          ]}
        >
          {isExpanded ? '▼' : '▶'}
        </Text>

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

      {/* Mini progress bar in header */}
      {hasActivity && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <MiniBar
            value={section.answeredCount}
            total={section.totalCount}
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
              <MiniBar
                value={section.correctCount}
                total={section.answeredCount}
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

  useFocusEffect(
    useCallback(() => {
      stats.refresh();
    }, [stats.refresh]),
  );

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
          <Text style={[fonts.size_24, fonts.purple500]}>←</Text>
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

          {/* Coverage bar */}
          <View
            style={[layout.row, layout.itemsCenter, { gap: 12, marginBottom: 6 }]}
          >
            <View
              style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' }}
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
            <Text style={[fonts.size_12, fonts.bold, { color: '#FFFFFF', width: 36, textAlign: 'right' }]}>
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
