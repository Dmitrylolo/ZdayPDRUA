import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import CategoryCard from '@/components/CategoryCard';
import { SafeScreen } from '@/components/templates';
import { useQuestions } from '@/hooks/domain/questions/useQuestions';
import { useQuestionStats } from '@/hooks/domain/questions/useQuestionStats';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import { useTheme } from '@/theme';

function Categories({ navigation }: RootScreenProps<Paths.Categories>) {
  const { fonts, gutters, layout, borders } = useTheme();
  const { sections } = useQuestions();
  const stats = useQuestionStats();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      stats.refresh();
    }, [stats.refresh]),
  );

  const answeredBySection = Object.fromEntries(
    stats.sectionStats.map(s => [s.id, s.answeredCount]),
  );

  const toggleSection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(sections.map(s => s.id)));
  }, [sections]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleStart = useCallback(() => {
    if (selectedIds.size === 0) return;
    navigation.navigate(Paths.Quiz, {
      sectionIds: Array.from(selectedIds),
    });
  }, [selectedIds, navigation]);

  const totalSelected = sections
    .filter(s => selectedIds.has(s.id))
    .reduce((sum, s) => sum + s.count, 0);

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
          Вибір розділів
        </Text>
        <Pressable onPress={selectedIds.size === sections.length ? clearAll : selectAll}>
          <Text style={[fonts.size_12, fonts.purple500]}>
            {selectedIds.size === sections.length ? 'Зняти все' : 'Вибрати все'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[gutters.padding_24]}
        showsVerticalScrollIndicator={false}
      >
        {sections.map(section => (
          <CategoryCard
            key={section.id}
            section={section}
            isSelected={selectedIds.has(section.id)}
            onPress={() => toggleSection(section.id)}
            answeredCount={answeredBySection[section.id] ?? 0}
          />
        ))}
      </ScrollView>

      {/* Start button */}
      <View
        style={[
          gutters.padding_24,
          { borderTopWidth: 1, borderTopColor: '#E0E0E0' },
        ]}
      >
        {selectedIds.size > 0 && (
          <Text style={[fonts.size_12, fonts.gray200, { textAlign: 'center', marginBottom: 8 }]}>
            {`${totalSelected} питань у ${selectedIds.size} розділах`}
          </Text>
        )}
        <Pressable
          onPress={handleStart}
          disabled={selectedIds.size === 0}
          style={({ pressed }) => [
            borders.rounded_16,
            {
              backgroundColor: selectedIds.size === 0 ? '#E0E0E0' : '#44427D',
              padding: 16,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[
              fonts.size_16,
              fonts.bold,
              { color: selectedIds.size === 0 ? '#A1A1A1' : '#FFFFFF' },
            ]}
          >
            Почати навчання
          </Text>
        </Pressable>
      </View>
    </SafeScreen>
  );
}

export default Categories;
