import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { activitiesService, Challenge } from '../services/activitiesService';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { StorageImage } from './StorageImage';

interface KidsScavengerHuntProps {
  tripId: string;
}

const KidsScavengerHunt: React.FC<KidsScavengerHuntProps> = ({ tripId }) => {
  const navigation = useNavigation<any>();
  const [challenges, setChallenges] = useState<{ activityId: string; challenge: Challenge; activityName: string; }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHuntData = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedActivities = await activitiesService.getActivitiesForTrip(tripId);
      const huntChallenges = fetchedActivities
        .flatMap(activity =>
          (activity.challenges || []).map(challenge => ({
            activityId: activity.id,
            challenge,
            activityName: activity.name
          }))
        );
      setChallenges(huntChallenges);
    } catch (error) {
      console.error("Failed to load scavenger hunt data for admin:", error);
      Alert.alert("Error", "Could not load scavenger hunt data.");
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadHuntData();
  }, [loadHuntData]);

  const handleApprove = async (activityId: string, challengeIndex: number, userId: string) => {
    try {
      await activitiesService.updateChallengeStatus(activityId, challengeIndex, userId, 'approved', 'Great job!', 10);
      loadHuntData(); // Refresh
    } catch (error) {
      Alert.alert("Error", "Could not approve challenge.");
    }
  };

  const handleReject = async (activityId: string, challengeIndex: number, userId: string) => {
    try {
      await activitiesService.updateChallengeStatus(activityId, challengeIndex, userId, 'rejected', 'Try again!', 0);
      loadHuntData(); // Refresh
    } catch (error) {
      Alert.alert("Error", "Could not reject challenge.");
    }
  };

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 20 }} size="large" color={colors.primary} />;
  }

  const pendingSubmissions = challenges.flatMap(c =>
    Object.entries(c.challenge.completions || {})
        .filter(([_, completion]) => completion.status === 'pending')
        .map(([userId, completion]) => ({
            ...c,
            userId,
            completion,
            challengeIndex: c.challenge.completions ? Object.keys(c.challenge.completions).indexOf(userId) : -1
        }))
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.fullHuntButton}
        onPress={() => navigation.navigate('ScavengerHunt', { tripId })}
      >
        <Ionicons name="search-circle" size={20} color={colors.white} />
        <Text style={styles.fullHuntButtonText}>Open Full Scavenger Hunt</Text>
      </TouchableOpacity>

      <Text style={styles.subHeader}>Pending Submissions</Text>

      {pendingSubmissions.length === 0 ? (
        <Text style={styles.noSubmissionsText}>No pending submissions to review.</Text>
      ) : (
        <ScrollView horizontal style={styles.submissionsScrollView}>
          {pendingSubmissions.map(({ activityId, challenge, activityName, userId, completion, challengeIndex }, index) => (
            <View key={`${activityId}-${challengeIndex}-${userId}`} style={styles.submissionCard}>
              <Text style={styles.submissionUserText}>Submission from user: {userId}</Text>
              <Text style={styles.submissionChallengeText}>{challenge.text}</Text>
              {completion.imageUrl && (
                <StorageImage path={completion.imageUrl} style={styles.submissionImage} />
              )}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={() => handleApprove(activityId, challengeIndex, userId)}
                >
                  <Ionicons name="checkmark" size={20} color={colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => handleReject(activityId, challengeIndex, userId)}
                >
                  <Ionicons name="close" size={20} color={colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  fullHuntButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  fullHuntButtonText: {
    color: colors.white,
    fontWeight: '600',
    marginLeft: 8,
  },
  subHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 10,
  },
  noSubmissionsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    paddingVertical: 20,
  },
  submissionsScrollView: {
    paddingBottom: 10,
  },
  submissionCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginRight: 10,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  submissionUserText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  submissionChallengeText: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 8,
  },
  submissionImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  actionButton: {
    padding: 10,
    borderRadius: 20,
    marginLeft: 10,
  },
  approveButton: {
    backgroundColor: colors.success,
  },
  rejectButton: {
    backgroundColor: colors.error,
  },
});

export default KidsScavengerHunt;
