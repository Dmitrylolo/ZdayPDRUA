import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const OPTIONS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
} as const;

export const haptics = {
  /** Light tap — answer option selected, generic button press */
  selection: () => ReactNativeHapticFeedback.trigger('selection', OPTIONS),
  /** Soft impact — "Далі", confirm actions */
  impactLight: () => ReactNativeHapticFeedback.trigger('impactLight', OPTIONS),
  /** Success notification — correct answer revealed */
  success: () =>
    ReactNativeHapticFeedback.trigger('notificationSuccess', OPTIONS),
  /** Error notification — wrong answer revealed */
  error: () => ReactNativeHapticFeedback.trigger('notificationError', OPTIONS),
};
