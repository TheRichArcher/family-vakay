import { Platform } from 'react-native';

export const blurActiveElement = () => {
  if (Platform.OS !== 'web') {
    return;
  }
  
  try {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && activeElement.blur) {
      activeElement.blur();
    }
  } catch (e) {
    // This is a best-effort utility, so we can ignore errors.
  }
}; 