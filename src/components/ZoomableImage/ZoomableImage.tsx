import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { ImageSourcePropType } from 'react-native';

import { haptics } from '@/utils/haptics';

const SCREEN = Dimensions.get('window');

interface ZoomableImageProps {
  source: ImageSourcePropType;
}

function ZoomableImage({ source }: ZoomableImageProps) {
  const [open, setOpen] = useState(false);

  // Zoom + pan shared values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1, { duration: 250 });
    savedScale.value = 1;
    tx.value = withTiming(0, { duration: 250 });
    ty.value = withTiming(0, { duration: 250 });
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const openModal = () => {
    haptics.impactLight();
    setOpen(true);
  };

  const closeModal = () => setOpen(false);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate(e => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) resetZoom();
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate(e => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      if (scale.value > 1.05) {
        resetZoom();
      } else {
        scale.value = withTiming(2.5, { duration: 300 });
        savedScale.value = 2.5;
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: tx.value },
      { translateY: ty.value },
    ],
  }));

  return (
    <>
      {/* Thumbnail — tap opens lightbox */}
      <Pressable onPress={openModal} style={styles.thumb}>
        <Image
          source={source}
          style={styles.thumbImage}
          resizeMode="contain"
        />
        {/* Zoom hint overlay */}
        <View style={styles.zoomHint} pointerEvents="none">
          <View style={styles.zoomHintBadge}>
            <X size={10} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} />
          </View>
        </View>
      </Pressable>

      {/* Lightbox modal */}
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.overlay}>
          {/* Close button */}
          <Pressable
            onPress={() => {
              runOnJS(resetZoom)();
              closeModal();
            }}
            style={styles.closeBtn}
            hitSlop={12}
          >
            <X size={24} color="#FFFFFF" />
          </Pressable>

          {/* Zoomable image */}
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.imageWrapper, animStyle]}>
              <Image
                source={source}
                style={styles.fullImage}
                resizeMode="contain"
              />
            </Animated.View>
          </GestureDetector>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: '100%',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: 180,
  },
  zoomHint: {
    position: 'absolute',
    bottom: 6,
    right: 6,
  },
  zoomHintBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    width: SCREEN.width,
    height: SCREEN.width,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN.width,
    height: SCREEN.width,
  },
});

export default ZoomableImage;
