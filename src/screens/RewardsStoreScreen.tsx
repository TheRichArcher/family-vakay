import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { useAuth } from '../contexts/AuthContext';
import { rewardsService } from '../services/rewardsService';
import { Reward, RewardRedemption, RewardRedemptionStatus } from '../types/rewards';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const DEFAULT_ICON = 'gift-outline';

const statusLabels: Record<RewardRedemptionStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  fulfilled: 'Fulfilled',
  denied: 'Denied',
};

const statusColors: Record<RewardRedemptionStatus, string> = {
  requested: colors.warning,
  approved: colors.primary,
  fulfilled: colors.success,
  denied: colors.error,
};

export default function RewardsStoreScreen() {
  const { user, refreshUser } = useAuth();
  const isKid = user?.role === 'kid';
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [isActive, setIsActive] = useState(true);

  const loadRewards = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rewardList, redemptionList] = await Promise.all([
        rewardsService.getRewards(),
        rewardsService.getRedemptions(),
      ]);
      setRewards(rewardList);
      setRedemptions(redemptionList);
      await refreshUser();
    } catch (error) {
      console.error('Failed to load rewards:', error);
      Alert.alert('Rewards unavailable', 'Could not load the rewards store.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  useFocusEffect(
    useCallback(() => {
      loadRewards();
    }, [loadRewards])
  );

  const activeRewards = useMemo(
    () => rewards.filter((reward) => reward.isActive !== false),
    [rewards]
  );

  const pendingRedemptions = useMemo(
    () => redemptions.filter((redemption) => redemption.status === 'requested'),
    [redemptions]
  );

  const resetForm = () => {
    setEditingRewardId(null);
    setTitle('');
    setDescription('');
    setPointsCost('');
    setIcon(DEFAULT_ICON);
    setIsActive(true);
  };

  const startEditing = (reward: Reward) => {
    setEditingRewardId(reward.id);
    setTitle(reward.title);
    setDescription(reward.description || '');
    setPointsCost(String(reward.pointsCost));
    setIcon(reward.icon || DEFAULT_ICON);
    setIsActive(reward.isActive !== false);
  };

  const saveReward = async () => {
    const cost = Number.parseInt(pointsCost, 10);
    if (!title.trim()) {
      Alert.alert('Missing title', 'Give the reward a name.');
      return;
    }
    if (!Number.isFinite(cost) || cost <= 0) {
      Alert.alert('Bad point cost', 'Point cost needs to be a positive number.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        pointsCost: cost,
        icon: icon.trim() || DEFAULT_ICON,
        isActive,
      };
      if (editingRewardId) {
        await rewardsService.updateReward(editingRewardId, payload);
      } else {
        await rewardsService.createReward(payload);
      }
      resetForm();
      await loadRewards();
    } catch (error) {
      console.error('Failed to save reward:', error);
      Alert.alert('Could not save reward', 'Try again in a minute.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteReward = (reward: Reward) => {
    Alert.alert('Delete reward?', `Remove "${reward.title}" from the store?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await rewardsService.deleteReward(reward.id);
            await loadRewards();
          } catch (error) {
            console.error('Failed to delete reward:', error);
            Alert.alert('Could not delete reward', 'Try again in a minute.');
          }
        },
      },
    ]);
  };

  const requestReward = async (reward: Reward) => {
    try {
      await rewardsService.redeemReward(reward.id);
      await loadRewards();
      Alert.alert('Request sent', 'An adult can approve it from the Rewards Store.');
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Could not request that reward.';
      Alert.alert('Not yet', message);
    }
  };

  const updateRedemption = async (redemption: RewardRedemption, status: RewardRedemptionStatus) => {
    try {
      await rewardsService.updateRedemption(redemption.id, status);
      await loadRewards();
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Could not update that request.';
      Alert.alert('Update failed', message);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Rewards Store"
        subtitle={isKid ? `${user?.points || 0} points available` : 'Create rewards and approve kid requests'}
        background="band"
      />

      {isKid ? (
        <>
          <View style={styles.pointsCard}>
            <Ionicons name="star" size={28} color={colors.warning} />
            <View>
              <Text style={styles.pointsValue}>{user?.points || 0} pts</Text>
              <Text style={styles.mutedText}>Earn points from approved challenges.</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Available Rewards</Text>
          {activeRewards.length === 0 ? (
            <Text style={styles.emptyText}>No rewards yet. Ask an adult to add some.</Text>
          ) : (
            activeRewards.map((reward) => (
              <View key={reward.id} style={styles.rewardCard}>
                <View style={styles.rewardHeader}>
                  <Ionicons name={(reward.icon || DEFAULT_ICON) as any} size={24} color={colors.primary} />
                  <View style={styles.rewardTitleWrap}>
                    <Text style={styles.rewardTitle}>{reward.title}</Text>
                    {!!reward.description && <Text style={styles.mutedText}>{reward.description}</Text>}
                  </View>
                  <Text style={styles.costText}>{reward.pointsCost} pts</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (user?.points || 0) < reward.pointsCost && styles.disabledButton,
                  ]}
                  disabled={(user?.points || 0) < reward.pointsCost}
                  onPress={() => requestReward(reward)}
                >
                  <Text style={styles.primaryButtonText}>Request Reward</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>My Requests</Text>
          {redemptions.length === 0 ? (
            <Text style={styles.emptyText}>No reward requests yet.</Text>
          ) : (
            redemptions.map((redemption) => <RedemptionCard key={redemption.id} redemption={redemption} />)
          )}
        </>
      ) : (
        <>
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{editingRewardId ? 'Edit Reward' : 'New Reward'}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Reward name"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor={colors.muted}
              multiline
            />
            <View style={styles.formRow}>
              <TextInput
                style={[styles.input, styles.pointsInput]}
                value={pointsCost}
                onChangeText={setPointsCost}
                placeholder="Points"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, styles.iconInput]}
                value={icon}
                onChangeText={setIcon}
                placeholder="Ionicon"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Visible in store</Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>
            <View style={styles.formActions}>
              {editingRewardId && (
                <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryButton} onPress={saveReward} disabled={isSaving}>
                <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Save Reward'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Approval Queue</Text>
          {pendingRedemptions.length === 0 ? (
            <Text style={styles.emptyText}>No pending reward requests.</Text>
          ) : (
            pendingRedemptions.map((redemption) => (
              <RedemptionCard
                key={redemption.id}
                redemption={redemption}
                actions={
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.approveButton} onPress={() => updateRedemption(redemption, 'approved')}>
                      <Text style={styles.actionButtonText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.denyButton} onPress={() => updateRedemption(redemption, 'denied')}>
                      <Text style={styles.actionButtonText}>Deny</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            ))
          )}

          <Text style={styles.sectionTitle}>Reward Catalog</Text>
          {rewards.length === 0 ? (
            <Text style={styles.emptyText}>No rewards in the store yet.</Text>
          ) : (
            rewards.map((reward) => (
              <View key={reward.id} style={styles.rewardCard}>
                <View style={styles.rewardHeader}>
                  <Ionicons name={(reward.icon || DEFAULT_ICON) as any} size={24} color={reward.isActive === false ? colors.muted : colors.primary} />
                  <View style={styles.rewardTitleWrap}>
                    <Text style={styles.rewardTitle}>{reward.title}</Text>
                    {!!reward.description && <Text style={styles.mutedText}>{reward.description}</Text>}
                    <Text style={styles.mutedText}>{reward.isActive === false ? 'Hidden' : 'Visible'} in store</Text>
                  </View>
                  <Text style={styles.costText}>{reward.pointsCost} pts</Text>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => startEditing(reward)}>
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.denyButton} onPress={() => deleteReward(reward)}>
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Redemption History</Text>
          {redemptions.length === 0 ? (
            <Text style={styles.emptyText}>No redemptions yet.</Text>
          ) : (
            redemptions.map((redemption) => (
              <RedemptionCard
                key={redemption.id}
                redemption={redemption}
                actions={
                  redemption.status === 'approved' ? (
                    <TouchableOpacity style={styles.approveButton} onPress={() => updateRedemption(redemption, 'fulfilled')}>
                      <Text style={styles.actionButtonText}>Mark Fulfilled</Text>
                    </TouchableOpacity>
                  ) : undefined
                }
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function RedemptionCard({ redemption, actions }: { redemption: RewardRedemption; actions?: React.ReactNode }) {
  return (
    <View style={styles.redemptionCard}>
      <View style={styles.rewardHeader}>
        <View style={styles.rewardTitleWrap}>
          <Text style={styles.rewardTitle}>{redemption.rewardTitle}</Text>
          <Text style={styles.mutedText}>
            {redemption.kidName || 'Kid'} requested {redemption.pointsCost} pts
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColors[redemption.status] }]}>
          <Text style={styles.statusText}>{statusLabels[redemption.status]}</Text>
        </View>
      </View>
      {actions}
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
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
  },
  pointsCard: {
    margin: 20,
    padding: 18,
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pointsValue: {
    ...typography.h2,
    color: colors.text,
  },
  formCard: {
    margin: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: colors.text,
    backgroundColor: colors.white,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pointsInput: {
    flex: 1,
  },
  iconInput: {
    flex: 2,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rewardCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  redemptionCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  rewardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardTitleWrap: {
    flex: 1,
  },
  rewardTitle: {
    ...typography.h3,
    color: colors.text,
  },
  mutedText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  costText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.white,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.primary,
  },
  disabledButton: {
    backgroundColor: colors.disabled,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  approveButton: {
    backgroundColor: colors.success,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  denyButton: {
    backgroundColor: colors.error,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  actionButtonText: {
    ...typography.button,
    color: colors.white,
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
});
