import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { KidDashboardStackParamList, TripsStackParamList } from '../navigation/AppNavigator';
import { activitiesService } from '../services/activitiesService';
import { tripsService } from '../services/trips';
import { userService, UserProfile } from '../services/userService';
import { colors } from '../theme/colors';

type LeaderboardRouteProp = RouteProp<TripsStackParamList & KidDashboardStackParamList, 'Leaderboard'>;

interface Score {
  userId: string;
  name: string;
  points: number;
}

export default function LeaderboardScreen() {
  const route = useRoute<LeaderboardRouteProp>();
  const { tripId } = route.params;
  const [scores, setScores] = useState<Score[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLeaderboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const trip = await tripsService.getTripById(tripId);
      if (!trip || !trip.participants) {
        setScores([]);
        return;
      }

      const participantProfiles = await Promise.all(
        trip.participants.map(uid => userService.getUserProfile(uid))
      );

      const kids = participantProfiles.filter((p): p is UserProfile => p !== null && p.role === 'kid');
      const activities = await activitiesService.getActivitiesForTrip(tripId);

      const calculatedScores: Score[] = kids.map(kid => {
        const totalPoints = activities.reduce((sum, activity) => {
          const activityPoints = (activity.challenges || []).reduce((challengeSum, challenge) => {
            const completion = challenge.completions?.[kid.uid];
            return challengeSum + (completion?.pointsAwarded || 0);
          }, 0);
          return sum + activityPoints;
        }, 0);

        return {
          userId: kid.uid,
          name: kid.name || 'Anonymous Kid',
          points: totalPoints,
        };
      });

      calculatedScores.sort((a, b) => b.points - a.points);
      setScores(calculatedScores);

    } catch (error) {
      console.error("Failed to load leaderboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      loadLeaderboardData();
    }, [loadLeaderboardData])
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text>Calculating scores...</Text>
      </View>
    );
  }

  const renderScoreItem = ({ item, index }: { item: Score, index: number }) => {
    const rank = index + 1;
    let medal = '';
    if (rank === 1) medal = '🥇';
    else if (rank === 2) medal = '🥈';
    else if (rank === 3) medal = '🥉';

    return (
      <View style={styles.scoreItem}>
        <Text style={styles.rank}>{rank}{medal}</Text>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.points}>{item.points} pts</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏆 Leaderboard 🏆</Text>
      {scores.length === 0 ? (
        <Text style={styles.noScoresText}>No kids have scored points yet. Let the games begin!</Text>
      ) : (
        <FlatList
          data={scores}
          keyExtractor={(item) => item.userId}
          renderItem={renderScoreItem}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: colors.accent,
  },
  listContainer: {
    paddingBottom: 20,
  },
  scoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  rank: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.accent,
    width: 60,
  },
  name: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  points: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.success,
  },
  noScoresText: {
    textAlign: 'center',
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 50,
  }
});
