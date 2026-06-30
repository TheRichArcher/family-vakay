import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { AdminStackParamList } from '../navigation/AppNavigator';
import { Trip, tripsService } from '../services/trips';
import { activitiesService, Activity } from '../services/activitiesService';
import { format, parseISO, isValid } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { getDateTime } from '../utils/dateUtils';
import ActivityCard from '../components/ActivityCard';
import { colors } from '../theme/colors';

type AdminManageTripActivitiesRouteProp = RouteProp<AdminStackParamList, 'AdminManageTripActivities'>;

interface GroupedActivities {
  [key: string]: Activity[];
}

export default function AdminManageTripActivitiesScreen() {
  const route = useRoute<AdminManageTripActivitiesRouteProp>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { tripId } = route.params;

  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [groupedActivities, setGroupedActivities] = useState<GroupedActivities>({});
  const [activityIdeas, setActivityIdeas] = useState<Activity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadActivities = useCallback(async () => {
    if (!tripId) return;
    setIsLoadingActivities(true);
    try {
      const fetchedActivities = await activitiesService.getActivitiesForTrip(tripId);

      const ideas = fetchedActivities.filter(a => a.isIdea);
      const scheduled = fetchedActivities.filter(a => !a.isIdea);
      
      const sortedIdeas = ideas.sort((a, b) => getDateTime(a).getTime() - getDateTime(b).getTime());
      setActivityIdeas(sortedIdeas);

      const sortedActivities = scheduled.sort((a: any, b: any) => getDateTime(a).getTime() - getDateTime(b).getTime());
      
      const groups: GroupedActivities = sortedActivities.reduce((acc: any, activity: any) => {
        if (activity.date && isValid(parseISO(activity.date))) {
          const activityDate = format(parseISO(activity.date), 'yyyy-MM-dd');
          if (!acc[activityDate]) acc[activityDate] = [];
          acc[activityDate].push(activity);
        }
        return acc;
      }, {} as GroupedActivities);
      
      setGroupedActivities(groups);
    } catch (error) {
      console.error("Failed to load activities:", error);
      Alert.alert("Error", "Could not load activities for this trip.");
    } finally {
      setIsLoadingActivities(false);
    }
  }, [tripId]);

  const fetchTripDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const trip = await tripsService.getTripById(tripId);
      if (trip) {
        setCurrentTrip(trip);
        navigation.setOptions({ title: `Manage: ${trip.name}` });
        await loadActivities();
      } else {
        Alert.alert("Error", "Trip not found.");
        navigation.goBack();
      }
    } catch (error) {
      console.error("Failed to fetch trip details:", error);
      Alert.alert("Error", "Could not load trip details.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tripId, navigation, loadActivities]);

  useFocusEffect(
    useCallback(() => {
      fetchTripDetails();
    }, [fetchTripDetails])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchTripDetails();
  }, [fetchTripDetails]);
  
  const handleEditActivity = (activity: Activity) => {
    navigation.navigate('EditActivity', { activity });
  };

  const handleDeleteActivity = (activity: Activity) => {
    Alert.alert("Delete Activity", "Are you sure you want to delete this activity?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          if (activity.tripId) {
            await activitiesService.deleteActivity(activity.tripId, activity.id);
            loadActivities(); // Refresh
          }
        } catch (error) {
          Alert.alert("Error", "Could not delete activity.");
        }
      }}
    ]);
  };

  if (isLoading || !currentTrip) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>{currentTrip.name}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('CreateActivity', { tripId: currentTrip.id })}>
            <Ionicons name="add" size={24} color={colors.white} />
            <Text style={styles.addButtonText}>Add Activity</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.activitiesSection}>
        <Text style={styles.sectionTitle}>Scheduled Activities</Text>
        {isLoadingActivities ? <ActivityIndicator size="large" color={colors.primary} /> : Object.keys(groupedActivities).length === 0 ? <Text style={styles.emptyMessage}>No activities scheduled for this view.</Text> :
          Object.keys(groupedActivities).map(date => (
            <View key={date}>
              <View style={styles.daySeparator}><Text style={styles.daySeparatorText}>{format(parseISO(date), 'EEEE, MMM d, yyyy')}</Text></View>
              {groupedActivities[date].map(item => (
                <ActivityCard
                  key={item.id}
                  item={item}
                  user={user}
                  onEdit={() => handleEditActivity(item)}
                  onDelete={() => handleDeleteActivity(item)}
                  canPerformAdminActions
                  canDelete
                />
              ))}
            </View>
          ))
        }
      </View>

      <View style={styles.activitiesSection}>
        <Text style={styles.sectionTitle}>Activity Ideas</Text>
        {activityIdeas.length === 0 ? <Text style={styles.emptyMessage}>No matching ideas found.</Text> :
          activityIdeas.map(item => (
            <ActivityCard
              key={item.id}
              item={item}
              isIdeaSection={true}
              user={user}
              onEdit={() => handleEditActivity(item)}
              onSchedule={() => handleEditActivity(item)}
              onDelete={() => handleDeleteActivity(item)}
              canPerformAdminActions
              canDelete
            />
          ))
        }
      </View>
    </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  addButtonText: {
    color: colors.white,
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  daySeparator: { paddingVertical: 12, backgroundColor: colors.background, marginTop: 16, borderBottomWidth: 1, borderTopWidth: 1, borderColor: colors.border },
  daySeparatorText: { fontSize: 16, fontWeight: 'bold', color: colors.textSecondary, textAlign: 'center' },
  activitiesSection: { marginTop: 16, marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  emptyMessage: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
}); 