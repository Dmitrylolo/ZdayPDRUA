import { Pressable, Text, View } from 'react-native';

import type { QuestionSection } from '@/services/questions/questions.types';
import { useTheme } from '@/theme';

interface CategoryCardProps {
  section: QuestionSection;
  isSelected: boolean;
  onPress: () => void;
  answeredCount?: number;
}

function CategoryCard({
  section,
  isSelected,
  onPress,
  answeredCount = 0,
}: CategoryCardProps) {
  const { fonts, gutters, layout, borders } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        layout.row,
        layout.itemsCenter,
        borders.rounded_16,
        gutters.padding_16,
        gutters.marginBottom_12,
        {
          backgroundColor: isSelected ? '#E1E1EF' : '#FFFFFF',
          borderWidth: 1.5,
          borderColor: isSelected ? '#44427D' : '#E0E0E0',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Checkbox */}
      <View
        style={[
          layout.justifyCenter,
          layout.itemsCenter,
          {
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: isSelected ? '#44427D' : '#A1A1A1',
            backgroundColor: isSelected ? '#44427D' : 'transparent',
            marginRight: 12,
          },
        ]}
      >
        {isSelected && (
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' }}>
            ✓
          </Text>
        )}
      </View>

      {/* Section info */}
      <View style={[layout.flex_1]}>
        <Text
          style={[
            fonts.size_16,
            {
              color: isSelected ? '#44427D' : '#303030',
              fontWeight: isSelected ? 'bold' : 'normal',
              marginBottom: 2,
            },
          ]}
          numberOfLines={2}
        >
          {section.title}
        </Text>
        <Text style={[fonts.gray200, fonts.size_12]}>
          {`${section.count} питань`}
        </Text>
      </View>

      {/* Progress badge */}
      {answeredCount > 0 && (
        <View
          style={{
            backgroundColor: isSelected ? '#44427D' : '#E1E1EF',
            borderRadius: 10,
            paddingHorizontal: 8,
            paddingVertical: 3,
            marginLeft: 8,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: isSelected ? '#FFFFFF' : '#44427D',
            }}
          >
            {`${answeredCount}/${section.count}`}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default CategoryCard;
