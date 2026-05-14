import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: boolean;
}

function StatCard({ title, value, subtitle, accent = false }: StatCardProps) {
  const { fonts, gutters, layout, borders } = useTheme();

  return (
    <View
      style={[
        borders.rounded_16,
        gutters.padding_16,
        layout.itemsCenter,
        {
          backgroundColor: accent ? '#44427D' : '#FFFFFF',
          borderWidth: 1,
          borderColor: accent ? '#44427D' : '#E0E0E0',
          minWidth: 140,
        },
      ]}
    >
      <Text
        style={[
          fonts.size_32,
          fonts.bold,
          { color: accent ? '#FFFFFF' : '#44427D', marginBottom: 4 },
        ]}
      >
        {String(value)}
      </Text>
      <Text
        style={[
          fonts.size_12,
          { color: accent ? '#E1E1EF' : '#4D4D4D', textAlign: 'center' },
        ]}
      >
        {title}
      </Text>
      {subtitle != null && (
        <Text
          style={[
            fonts.size_12,
            { color: accent ? '#E1E1EF' : '#A1A1A1', marginTop: 2, textAlign: 'center' },
          ]}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

export default StatCard;
