import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ActivityIndicator, FlatList, 
  RefreshControl, Alert
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { tripsService, Trip } from '../services/trips';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { TripCard } from '../components/TripCard';

export default function AdminManageTripsScreen() {
  const { user, authInitializing } = useAuth();
  const navigation = useNavigation<any>();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTrips = useCallback(async () => {
    if (!user?.uid) {
      setTrips([]);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const userTrips = await tripsService.getTrips(user.uid);

      if (userTrips && Array.isArray(userTrips)) {
        setTrips(userTrips);
      } else {
        console.error('AdminManageTripsScreen: Error - expected an array of trips, but received:', userTrips);
        setTrips([]);
      }
    } catch (err) {
      console.error('AdminManageTripsScreen: Error loading trips:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      if (!authInitializing && user?.uid) {
        tripsService.getTrips(user.uid)
          .then(data => {
            if (Array.isArray(data)) {
              setTrips(data);
            } else {
              setTrips([]);
            }
          })
          .catch(err => {
            console.error('AdminManageTripsScreen: Error loading trips:', err);
            setTrips([]);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }, [authInitializing, user?.uid])
  );

  const handleDeleteTrip = async (tripId: string) => {
    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to delete this trip and all its activities? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              await tripsService.deleteTrip(tripId);
              setTrips(prevTrips => prevTrips.filter(trip => trip.id !== tripId));
              Alert.alert("Success", "Trip has been deleted.");
            } catch (error) {
              console.error("Failed to delete trip:", error);
              Alert.alert("Error", "Could not delete the trip. Please try again.");
            }
          }
        }
      ]
    );
  };

  const renderTripItem = ({ item }: { item: Trip }) => (
    <TripCard
      trip={item}
      onEdit={(trip) => navigation.navigate('EditTrip', { trip })}
      onDelete={handleDeleteTrip}
      onManageActivities={(tripId) => navigation.navigate('AdminManageTripActivities', { tripId })}
    />
  );

  if (authInitializing || isLoading && !trips.length) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Manage Trips</Text>
      
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={renderTripItem}
        ListEmptyComponent={<Text style={styles.noTripsText}>No trips found.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={loadTrips} tintColor={colors.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  tripsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  noTripsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 20,
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 20,
  }
}); 