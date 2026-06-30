import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { TripsStackParamList } from '../navigation/AppNavigator';
import { activitiesService, Activity } from '../services/activitiesService';
import { tripsService, Trip } from '../services/trips';
import { colors } from '../theme/colors';
import { userService, UserProfile } from '../services/userService';

type ReportScreenRouteProp = RouteProp<TripsStackParamList, 'Report'>;

export default function ReportScreen() {
  const route = useRoute<ReportScreenRouteProp>();
  const { tripId } = route.params;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [participants, setParticipants] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const tripDetails = await tripsService.getTripById(tripId);
      setTrip(tripDetails);

      if (tripDetails) {
        const fetchedActivities = await activitiesService.getActivitiesForTrip(tripId);
        setActivities(fetchedActivities);

        if (tripDetails.participants) {
          const participantProfiles = await Promise.all(
            tripDetails.participants.map(uid => userService.getUserProfile(uid))
          );
          setParticipants(participantProfiles.filter((p): p is UserProfile => p !== null));
        }
      }
    } catch (error) {
      console.error("Failed to fetch report data:", error);
      Alert.alert("Error", "Could not load trip report data.");
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const calculateKidsAverageRating = (activity: Activity) => {
    const kidParticipants = participants.filter(p => p.role === 'kid');
    const kidIds = kidParticipants.map(k => k.uid);

    if (!activity.ratings || kidIds.length === 0) {
      return 'N/A';
    }

    const kidRatings = Object.entries(activity.ratings)
      .filter(([userId]) => kidIds.includes(userId))
      .map(([, rating]) => {
        return rating.rating;
      })
      .filter(r => r > 0);

    if (kidRatings.length === 0) {
      return 'N/A';
    }

    const avg = kidRatings.reduce((sum: number, r) => sum + r, 0) / kidRatings.length;

    if (avg >= 2.5) return '🤩 Loved It!';
    if (avg >= 1.5) return '🙂 It was OK';
    return 'Not a Fan';
  };

  if (isLoading) {
    return <ActivityIndicator size="large" style={styles.loader} />;
  }

  if (!trip) {
    return <Text style={styles.errorText}>Trip not found.</Text>;
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{trip.name} Report</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity Ratings</Text>
        {activities.filter(a => !a.isIdea).map(activity => (
          <View key={activity.id} style={styles.activityCard}>
            <Text style={styles.activityName}>{activity.name}</Text>
            <Text style={styles.kidRating}>
              Kid's Rating: {calculateKidsAverageRating(activity)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: colors.text,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: colors.error,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: colors.text,
  },
  activityCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '600',
  },
  kidRating: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 5,
  },
});
