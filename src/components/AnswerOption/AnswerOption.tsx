import { Check, X } from 'lucide-react-native';
import { Platform, Pressable, Text, View } from 'react-native';

import type { Answer } from '@/services/questions/questions.types';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

export type AnswerState = 'default' | 'selected' | 'correct' | 'wrong';

interface AnswerOptionProps {
  answer: Answer;
  state: AnswerState;
  onPress: () => void;
  disabled: boolean;
}

const STATE_COLORS: Record<AnswerState, { bg: string; border: string; text: string }> = {
  default: { bg: '#FFFFFF', border: '#E0E0E0', text: '#303030' },
  selected: { bg: '#E1E1EF', border: '#44427D', text: '#44427D' },
  correct: { bg: '#E8F5E9', border: '#27AE60', text: '#1B5E20' },
  wrong: { bg: '#FFEBEE', border: '#C13333', text: '#C13333' },
};

const LABEL = ['А', 'Б', 'В', 'Г', 'Д'];

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  android: { elevation: 3 },
  default: {},
});

function AnswerOption({ answer, state, onPress, disabled }: AnswerOptionProps) {
  const { gutters, layout, borders, fonts } = useTheme();
  const colors = STATE_COLORS[state];
  const label = LABEL[(answer.index - 1) % LABEL.length] ?? String(answer.index);

  return (
    <Pressable
      onPress={() => {
        if (!disabled) haptics.selection();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        layout.row,
        layout.itemsCenter,
        borders.rounded_16,
        gutters.padding_16,
        gutters.marginBottom_12,
        cardShadow,
        {
          backgroundColor: pressed && !disabled ? '#F5F5F5' : colors.bg,
          borderWidth: 1.5,
          borderColor: colors.border,
          opacity: disabled && state === 'default' ? 0.5 : 1,
        },
      ]}
    >
      {/* Label circle */}
      <View
        style={[
          layout.justifyCenter,
          layout.itemsCenter,
          {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.border,
            marginRight: 12,
          },
        ]}
      >
        {state === 'correct' ? (
          <Check size={16} color="#FFFFFF" strokeWidth={3} />
        ) : state === 'wrong' ? (
          <X size={16} color="#FFFFFF" strokeWidth={3} />
        ) : (
          <Text style={[fonts.size_12, fonts.bold, { color: '#FFFFFF' }]}>
            {label}
          </Text>
        )}
      </View>
      <Text
        style={[
          { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
        ]}
      >
        {answer.text}
      </Text>
    </Pressable>
  );
}

export default AnswerOption;
