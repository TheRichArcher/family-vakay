import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export const BudgetStatus = ({ budget, totalSpent }: { budget: number; totalSpent: number }) => {
  if (budget <= 0) {
    return (
      <Text style={styles.noBudget}>No budget set.</Text>
    );
  }

  const percentage = (totalSpent / budget) * 100;
  const remaining = budget - totalSpent;
  const isOverBudget = percentage > 100;

  return (
    <View style={styles.budgetStatusContainer}>
      <View style={styles.budgetRow}>
        <Text style={styles.budgetLabel}>Spent:</Text>
        <Text style={styles.budgetValue}>${totalSpent.toFixed(2)} / ${budget.toFixed(2)}</Text>
      </View>
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            { width: `${Math.min(percentage, 100)}%` },
            isOverBudget && styles.progressBarOver,
          ]}
        />
      </View>
      <Text style={[styles.remainingText, remaining < 0 && styles.remainingNegative]}>
        {remaining >= 0 ? `$${remaining.toFixed(2)} remaining` : `-$${Math.abs(remaining).toFixed(2)} over budget`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  noBudget: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  budgetStatusContainer: {},
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  budgetValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  progressBarContainer: {
    height: 8,
    width: '100%',
    backgroundColor: colors.backgroundAlt,
    borderRadius: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressBarOver: {
    backgroundColor: colors.error,
  },
  remainingText: {
    fontSize: 14,
    color: 'green',
    fontWeight: '500',
    textAlign: 'right',
  },
  remainingNegative: {
    color: colors.error,
  },
}); 