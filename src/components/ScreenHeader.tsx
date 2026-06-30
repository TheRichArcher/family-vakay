import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  background?: 'none' | 'band';
};

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, subtitle, background = 'none' }) => {
  const isBand = background === 'band';
  return (
    <View style={[styles.container, isBand && styles.band]}>
      <Text style={[styles.title, isBand && styles.titleOnBand]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, isBand && styles.subtitleOnBand]}>{subtitle}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  band: {
    backgroundColor: colors.primary,
    paddingVertical: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  titleOnBand: {
    color: colors.textLight,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.textSecondary,
  },
  subtitleOnBand: {
    color: 'rgba(255,255,255,0.9)',
  },
});

export default ScreenHeader;


