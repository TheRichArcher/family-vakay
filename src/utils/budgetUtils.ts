import { Activity } from '../services/activitiesService';

export const budgetCategories = ['Lodging', 'Food', 'Transport', 'Activities', 'Shopping', 'Misc'];

export const getActivityPlannedAmount = (activity: Pick<Activity, 'budget' | 'cost' | 'additionalExpenses'>): number => {
  const explicitBudget = Number(activity.budget) || 0;
  const knownCost = (Number(activity.cost) || 0) + (Number(activity.additionalExpenses) || 0);
  return explicitBudget > 0 ? explicitBudget : knownCost;
};

export const getActivityActualAmount = (activity: Pick<Activity, 'cost' | 'additionalExpenses'>): number => (
  (Number(activity.cost) || 0) + (Number(activity.additionalExpenses) || 0)
);

export const getActivityPaidAmount = (activity: Pick<Activity, 'amountPaid' | 'paymentStatus' | 'cost' | 'additionalExpenses'>): number => {
  const actual = getActivityActualAmount(activity);
  if (activity.paymentStatus === 'paid') {
    return actual;
  }
  return Number(activity.amountPaid) || 0;
};

export const getActivityBudgetCategory = (activity: Pick<Activity, 'budgetCategory' | 'activityTypes'>): string => {
  if (activity.budgetCategory) {
    return activity.budgetCategory;
  }
  const type = activity.activityTypes?.[0];
  if (!type) {
    return 'Misc';
  }
  if (['Dining', 'Food'].includes(type)) return 'Food';
  if (['Outdoor', 'Entertainment', 'Relaxation', 'Tourist', 'Active'].includes(type)) return 'Activities';
  return budgetCategories.includes(type) ? type : 'Misc';
};

export const formatCurrency = (value: number): string => `$${value.toFixed(2)}`;
