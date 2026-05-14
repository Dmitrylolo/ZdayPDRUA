import { ChevronRight } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { SafeScreen } from '@/components/templates';
import { Paths } from '@/navigation/paths';
import type { RootScreenProps } from '@/navigation/types';
import {
  VEHICLE_CATEGORIES,
  vehicleCategoryStorage,
  type VehicleCategoryId,
} from '@/services/vehicleCategory/vehicleCategory';
import { useTheme } from '@/theme';

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
  },
  android: { elevation: 3 },
  default: {},
});

function CategoryPicker({ navigation }: RootScreenProps<Paths.CategoryPicker>) {
  const { fonts, gutters, layout, borders } = useTheme();

  const current = vehicleCategoryStorage.getSelected();
  const canGoBack = navigation.canGoBack();

  const handleSelect = (id: VehicleCategoryId) => {
    vehicleCategoryStorage.setSelected(id);
    if (canGoBack) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: Paths.Home }] });
    }
  };

  return (
    <SafeScreen>
      {/* Header */}
      <View
        style={[
          gutters.paddingHorizontal_24,
          gutters.paddingVertical_16,
          { borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
        ]}
      >
        <Text
          style={[
            fonts.size_24,
            fonts.bold,
            fonts.gray800,
            { letterSpacing: -0.3 },
          ]}
        >
          Категорія водія
        </Text>
        <Text style={[fonts.size_12, fonts.gray200, { marginTop: 4 }]}>
          Вибір категорії фільтрує питання та статистику
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[gutters.padding_24]}
        showsVerticalScrollIndicator={false}
      >
        {VEHICLE_CATEGORIES.map(cat => {
          const isSelected = cat.id === current;
          return (
            <Pressable
              key={cat.id}
              onPress={() => handleSelect(cat.id)}
              style={({ pressed }) => [
                borders.rounded_16,
                cardShadow,
                gutters.marginBottom_12,
                {
                  backgroundColor: '#FFFFFF',
                  borderWidth: 2,
                  borderColor: isSelected ? '#44427D' : '#F0F0F0',
                  padding: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {/* Emoji badge */}
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: isSelected ? '#E1E1EF' : '#F7F7F7',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 14,
                }}
              >
                <Text style={{ fontSize: 26 }}>{cat.emoji}</Text>
              </View>

              {/* Text */}
              <View style={[layout.flex_1]}>
                <Text
                  style={[
                    fonts.size_16,
                    fonts.bold,
                    { color: isSelected ? '#44427D' : '#303030', marginBottom: 2 },
                  ]}
                >
                  {cat.label}
                </Text>
                <Text style={[fonts.size_12, fonts.gray200]}>
                  {cat.description}
                </Text>
              </View>

              {/* Arrow / checkmark */}
              {isSelected ? (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#44427D',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#FFF', fontSize: 14 }}>✓</Text>
                </View>
              ) : (
                <ChevronRight size={20} color="#A1A1A1" />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeScreen>
  );
}

export default CategoryPicker;
