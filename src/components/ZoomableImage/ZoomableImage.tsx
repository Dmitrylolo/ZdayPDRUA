import type { ImageSourcePropType } from 'react-native';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const IMAGE_HEIGHT = 180;

interface ZoomableImageProps {
  source: ImageSourcePropType;
}

function ZoomableImage({ source }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1, { duration: 250 });
    savedScale.value = 1;
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate(e => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      // snap back to 1x on release
      reset();
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    // Spacer keeps layout height fixed; image overflows its container on zoom
    <View style={styles.container}>
      <GestureDetector gesture={pinch}>
        <Animated.View style={[StyleSheet.absoluteFillObject, animStyle]}>
          <Image
            source={source}
            style={styles.image}
            resizeMode="contain"
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: IMAGE_HEIGHT,
    overflow: 'visible',
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
  },
});

export default ZoomableImage;
