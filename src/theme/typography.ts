import { colors } from './colors';

export const typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
  h1: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: colors.secondary,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: colors.secondary,
  },
  h3: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.textSecondary,
  },
  body: {
    fontSize: 16,
    color: colors.text,
  },
  caption: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  button: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.textLight,
  },
};