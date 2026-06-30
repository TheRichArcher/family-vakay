import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackParamList } from '../navigation/AppNavigator';
import { Activity, activitiesService } from '../services/activitiesService';
import { Trip, tripsService } from '../services/trips';
import ScreenHeader from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { formatCurrency, getActivityActualAmount, getActivityBudgetCategory, getActivityPaidAmount, getActivityPlannedAmount } from '../utils/budgetUtils';

type BudgetRouteProp = RouteProp<AdminStackParamList, 'BudgetCommandCenter'>;

type CategorySummary = {
  category: string;
  planned: number;
  actual: number;
  paid: number;
};

export default function BudgetCommandCenterScreen() {
  const route = useRoute<BudgetRouteProp>();
  const navigation = useNavigation<any>();
  const { tripId } = route.params;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadBudget = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tripDetails, tripActivities] = await Promise.all([
        tripsService.getTripById(tripId),
        activitiesService.getActivitiesForTrip(tripId),
      ]);
      setTrip(tripDetails);
      setActivities(tripActivities);
      navigation.setOptions({ title: `Budget: ${tripDetails.name}` });
    } catch (error) {
      console.error('Failed to load budget command center:', error);
      Alert.alert('Budget unavailable', 'Could not load the trip budget.');
    } finally {
      setIsLoading(false);
    }
  }, [navigation, tripId]);

  useFocusEffect(
    useCallback(() => {
      loadBudget();
    }, [loadBudget])
  );

  const summary = useMemo(() => {
    const scheduled = activities.filter(activity => !activity.isIdea);
    const ideas = activities.filter(activity => activity.isIdea);
    const booked = scheduled.filter(activity => activity.isBooked);
    const planned = scheduled.reduce((sum, activity) => sum + getActivityPlannedAmount(activity), 0);
    const actual = booked.reduce((sum, activity) => sum + getActivityActualAmount(activity), 0);
    const paid = scheduled.reduce((sum, activity) => sum + getActivityPaidAmount(activity), 0);
    const ideaExposure = ideas.reduce((sum, activity) => sum + getActivityPlannedAmount(activity), 0);
    const categories = new Map<string, CategorySummary>();

    scheduled.forEach(activity => {
      const category = getActivityBudgetCategory(activity);
      const current = categories.get(category) || { category, planned: 0, actual: 0, paid: 0 };
      current.planned += getActivityPlannedAmount(activity);
      if (activity.isBooked) {
        current.actual += getActivityActualAmount(activity);
      }
      current.paid += getActivityPaidAmount(activity);
      categories.set(category, current);
    });

    return {
      scheduled,
      ideas,
      booked,
      planned,
      actual,
      paid,
      unpaid: Math.max(actual - paid, 0),
      ideaExposure,
      categories: Array.from(categories.values()).sort((a, b) => b.planned - a.planned),
    };
  }, [activities]);

  if (isLoading || !trip) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const totalBudget = Number(trip.budget) || 0;
  const remaining = totalBudget - summary.actual;
  const projectedRemaining = totalBudget - summary.planned - summary.ideaExposure;
  const budgetUsedPercent = totalBudget > 0 ? Math.min((summary.actual / totalBudget) * 100, 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Budget Command Center" subtitle={trip.name} background="band" />

      <View style={styles.commandGrid}>
        <MetricCard label="Trip Budget" value={formatCurrency(totalBudget)} icon="wallet-outline" />
        <MetricCard label="Booked Spend" value={formatCurrency(summary.actual)} icon="card-outline" tone={remaining < 0 ? 'danger' : 'normal'} />
        <MetricCard label="Remaining" value={formatCurrency(remaining)} icon="speedometer-outline" tone={remaining < 0 ? 'danger' : 'success'} />
        <MetricCard label="Unpaid" value={formatCurrency(summary.unpaid)} icon="receipt-outline" tone={summary.unpaid > 0 ? 'warning' : 'success'} />
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Budget Burn</Text>
          <Text style={styles.panelMeta}>{summary.booked.length} booked activities</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, remaining < 0 && styles.progressDanger, { width: `${budgetUsedPercent}%` }]} />
        </View>
        <Text style={[styles.remainingText, remaining < 0 && styles.dangerText]}>
          {remaining >= 0 ? `${formatCurrency(remaining)} left after booked spend` : `${formatCurrency(Math.abs(remaining))} over budget`}
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Decision Board Exposure</Text>
        <Text style={styles.bodyText}>
          If every current idea gets scheduled, projected remaining becomes {formatCurrency(projectedRemaining)}.
        </Text>
        <Text style={styles.panelMeta}>{summary.ideas.length} ideas carrying {formatCurrency(summary.ideaExposure)} in possible spend</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Category Breakdown</Text>
        {summary.categories.length === 0 ? (
          <Text style={styles.emptyText}>No categorized spend yet.</Text>
        ) : (
          summary.categories.map(category => (
            <View key={category.category} style={styles.categoryRow}>
              <View style={styles.categoryLabelWrap}>
                <Text style={styles.categoryLabel}>{category.category}</Text>
                <Text style={styles.panelMeta}>Paid {formatCurrency(category.paid)}</Text>
              </View>
              <View style={styles.categoryAmounts}>
                <Text style={styles.categoryAmount}>{formatCurrency(category.planned)}</Text>
                <Text style={styles.panelMeta}>actual {formatCurrency(category.actual)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Payment Watchlist</Text>
        {summary.scheduled.filter(activity => getActivityActualAmount(activity) > getActivityPaidAmount(activity)).length === 0 ? (
          <Text style={styles.emptyText}>Nothing unpaid right now.</Text>
        ) : (
          summary.scheduled
            .filter(activity => getActivityActualAmount(activity) > getActivityPaidAmount(activity))
            .map(activity => (
              <TouchableOpacity key={activity.id} style={styles.watchRow} onPress={() => navigation.navigate('EditActivity', { activity })}>
                <View style={styles.watchTextWrap}>
                  <Text style={styles.watchTitle}>{activity.name}</Text>
                  <Text style={styles.panelMeta}>{getActivityBudgetCategory(activity)} • {activity.paymentStatus || 'unpaid'}</Text>
                </View>
                <Text style={styles.watchAmount}>{formatCurrency(getActivityActualAmount(activity) - getActivityPaidAmount(activity))}</Text>
              </TouchableOpacity>
            ))
        )}
      </View>
    </ScrollView>
  );
}

function MetricCard({ label, value, icon, tone = 'normal' }: { label: string; value: string; icon: any; tone?: 'normal' | 'success' | 'warning' | 'danger' }) {
  const color = tone === 'danger' ? colors.error : tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.primary;
  return (
    <View style={styles.metricCard}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 20,
  },
  metricCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricValue: {
    ...typography.h3,
    color: colors.text,
    marginTop: 10,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  panel: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  panelTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 10,
  },
  panelMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bodyText: {
    ...typography.body,
    color: colors.text,
    marginBottom: 8,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.backgroundAlt,
    overflow: 'hidden',
    marginVertical: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressDanger: {
    backgroundColor: colors.error,
  },
  remainingText: {
    ...typography.body,
    color: colors.success,
    textAlign: 'right',
  },
  dangerText: {
    color: colors.error,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
  },
  categoryLabelWrap: {
    flex: 1,
  },
  categoryLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  categoryAmounts: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  watchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
    gap: 12,
  },
  watchTextWrap: {
    flex: 1,
  },
  watchTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  watchAmount: {
    ...typography.body,
    fontWeight: '700',
    color: colors.warning,
  },
});
