import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList,
  TextInput, RefreshControl, Button
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { tripsService, Trip } from '../services/trips';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TripsStackParamList, AppTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { Ionicons } from '@expo/vector-icons';
import { AccessibleModal } from '../components/AccessibleModal';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import { TripCard } from '../components/TripCard';
import ScreenHeader from '../components/ScreenHeader';
import { typography } from '../theme/typography';

// This is the main screen for displaying a user's trips.
type TripsNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<TripsStackParamList, 'TripsList'>,
  CompositeNavigationProp<
    BottomTabNavigationProp<AppTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

export default function TripsScreen() {
  const { user, authInitializing, refreshUser } = useAuth();
  const navigation = useNavigation<TripsNavigationProp>();
  const canCreateTrips = user?.role !== 'kid';
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoinModalVisible, setJoinModalVisible] = useState(false);
  const [vacationCode, setVacationCode] = useState('');
  const [joinTripError, setJoinTripError] = useState<string | null>(null);

  const loadTrips = useCallback(async () => {
    if (!user?.uid) {
      // If user is not logged in or uid is not available,
      // set trips to empty and stop loading.
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
        // This handles cases where the API returns something other than an array.
        console.error('TripsScreen: Error - expected an array of trips, but received:', userTrips);
        setTrips([]); // Clear any existing trips
      }
    } catch (err) {
      console.error('TripsScreen: Error loading trips:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  // useFocusEffect to reload trips when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const fetchTrips = async () => {
        if (!user || authInitializing) return;

        setIsLoading(true);
        try {
          const fetchedTrips = await tripsService.getTrips(user.uid);
          if (isActive && Array.isArray(fetchedTrips)) {
            setTrips(fetchedTrips);
          } else if (isActive) {
            setTrips([]);
          }
        } catch (err) {
          if (isActive) {
            setJoinTripError('Failed to load trips. Please pull down to refresh.');
            setTrips([]);
          }
          console.error("Failed to fetch trips:", err);
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      };

      fetchTrips();

      return () => {
        // Optional: Any cleanup actions when the screen goes out of focus
      };
    }, [authInitializing, user?.uid, loadTrips]) // Rerun effect if auth state or loadTrips changes
  );

  const handleJoinTrip = async () => {
    setJoinTripError(null);
    if (!vacationCode.trim() || !user) {
      setJoinTripError('Please enter a valid vacation code.');
      return;
    }
    try {
      const tripToJoin = await tripsService.getTripByCode(vacationCode);
      if (!tripToJoin) {
        setJoinTripError('No trip found with that code. Please check the code and try again.');
        return;
      }

      if (tripToJoin.participants.includes(user.uid) || tripToJoin.ownerId === user.uid) {
        setJoinTripError("You're already part of this trip!");
        return;
      }

      const updatedParticipants = [...tripToJoin.participants, user.uid];
      await tripsService.updateTrip(tripToJoin.id, { participants: updatedParticipants });

      setJoinModalVisible(false);
      setVacationCode('');
      loadTrips(); // Refresh the list of trips
    } catch (error) {
      console.error('Error joining trip:', error);
      setJoinTripError('Could not join the trip. Please try again.');
    }
  };

  const renderTripItem = ({ item }: { item: Trip }) => (
    <TripCard
      trip={item}
      onPress={(trip) => navigation.navigate('TripDetail', { tripId: trip.id })}
    />
  );

  if (authInitializing || isLoading && !trips.length) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Handle case where user exists but profile data (like name) is missing
  if (user && !user.name) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Could not load your profile.</Text>
        <Button title="Tap to retry" onPress={refreshUser} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Welcome, Back!" background="band" />

      <View style={styles.card}>
        {canCreateTrips && (
          <>
            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('CreateTrip')}>
              <Ionicons name="add-circle-outline" size={32} color={colors.primary} style={styles.actionButtonIcon} />
              <View>
                <Text style={styles.actionButtonTitle}>New Trip</Text>
                <Text style={styles.actionButtonText}>Plan a new vacation for your family.</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
          </>
        )}
        <TouchableOpacity style={styles.actionButton} onPress={() => setJoinModalVisible(true)}>
          <Ionicons name="people-circle" size={32} color={colors.primary} style={styles.actionButtonIcon} />
          <View>
            <Text style={styles.actionButtonTitle}>Join a Trip</Text>
            <Text style={styles.actionButtonText}>Use a vacation code to join a trip.</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.tripsTitle}>My Trips</Text>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={renderTripItem}
        ListEmptyComponent={<Text style={styles.noTripsText}>You have no trips planned yet.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={loadTrips} tintColor={colors.primary} />
        }
      />

      <AccessibleModal
        visible={isJoinModalVisible}
        onClose={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Join a Trip with a Code</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Vacation Code"
            value={vacationCode}
            onChangeText={setVacationCode}
            autoCapitalize="characters"
            placeholderTextColor={colors.textSecondary}
          />
          {joinTripError && <Text style={styles.errorTextModal}>{joinTripError}</Text>}
          <View style={styles.modalButtonContainer}>
             <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setJoinModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.submitButton]} onPress={handleJoinTrip}>
                <Text style={styles.modalButtonText}>Join</Text>
            </TouchableOpacity>
          </View>
            <TouchableOpacity style={{ marginTop: 10 }} onPress={() => {
              setJoinModalVisible(false);
              navigation.navigate('QRScanner', { mode: 'trip' } as any);
            }}>
              <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Scan QR Instead</Text>
            </TouchableOpacity>
        </View>
      </AccessibleModal>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: 15,
    padding: 0,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  actionButton: {
    backgroundColor: colors.white,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  actionButtonIcon: {
    marginRight: 16,
  },
  actionButtonTitle: {
    ...typography.h3,
    color: colors.text,
  },
  actionButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tripsTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  tripCard: {
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tripInfo: {
    flex: 1,
  },
  tripName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text
  },
  tripDates: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  tripActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noTripsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 20,
    fontSize: 16,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 15,
    padding: 25,
    width: '90%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: colors.text,
  },
  input: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  modalButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: colors.primary,
  },
  modalButtonText: {
    color: colors.textLight,
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorTextModal: {
    color: colors.error,
    marginBottom: 15,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 18,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 20,
  }
});
