import { Image, ScrollView, Text, View } from 'react-native';

import { getQuestionImage } from '@/assets/questions/imagesMap';
import type { Question } from '@/services/questions/questions.types';
import { useTheme } from '@/theme';

interface QuestionCardProps {
  question: Question;
  currentIndex: number;
  totalCount: number;
}

function QuestionCard({ question, currentIndex, totalCount }: QuestionCardProps) {
  const { fonts, gutters, layout, backgrounds, borders } = useTheme();

  const imageSource = getQuestionImage(question.image);
  const progressPct = totalCount > 0 ? ((currentIndex + 1) / totalCount) * 100 : 0;

  return (
    <View
      style={[
        backgrounds.gray50,
        borders.rounded_16,
        gutters.padding_16,
        { borderWidth: 1, borderColor: '#E0E0E0' },
      ]}
    >
      {/* Progress indicator */}
      <View style={[layout.row, layout.justifyBetween, layout.itemsCenter, gutters.marginBottom_12]}>
        <Text style={[fonts.gray200, fonts.size_12]}>
          {`Питання ${currentIndex + 1} з ${totalCount}`}
        </Text>
        <Text style={[fonts.purple500, fonts.size_12, fonts.bold]}>
          {`${Math.round(progressPct)}%`}
        </Text>
      </View>

      {/* Progress bar */}
      <View
        style={[
          { height: 4, borderRadius: 2, backgroundColor: '#E0E0E0' },
          gutters.marginBottom_16,
        ]}
      >
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: '#44427D',
            width: `${progressPct}%`,
          }}
        />
      </View>

      {/* Question text */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text
          style={[
            fonts.gray800,
            fonts.size_16,
            { lineHeight: 24 },
            gutters.marginBottom_12,
          ]}
        >
          {question.text}
        </Text>

        {imageSource != null && (
          <Image
            source={imageSource}
            style={[
              { width: '100%', height: 180, borderRadius: 8 },
              gutters.marginBottom_12,
            ]}
            resizeMode="contain"
          />
        )}
      </ScrollView>
    </View>
  );
}

export default QuestionCard;
