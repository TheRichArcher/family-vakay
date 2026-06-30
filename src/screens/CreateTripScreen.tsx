import React, { useState } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TripForm } from '../components/TripForm';
import { tripsService, TripData } from '../services/trips';
import { useAuth } from '../contexts/AuthContext';
import { AppNavigatorParamList } from '../navigation/AppNavigator';
import { storageService, generateUniqueFileName } from '../services/storageService';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

type CreateTripNavigationProp = NativeStackNavigationProp<AppNavigatorParamList, 'CreateTrip'>;

export default function CreateTripScreen() {
  const navigation = useNavigation<CreateTripNavigationProp>();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnToTrips = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation as any).navigate('App', { screen: 'Trips' });
    }
  };

  const handleSubmit = async (tripFormData: TripData, newCoverImageUri?: string) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a trip');
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const initialTripData: TripData = {
        ...tripFormData,
        coverImageUrl: undefined,
        coverImageResizedUrl: undefined,
        coverImageThumbnailUrl: undefined,
      };

      const createdTrip = await tripsService.createTrip(initialTripData, user.uid);

      if (newCoverImageUri) {
        try {
          const imageName = generateUniqueFileName(newCoverImageUri);
          const finalize = await storageService.uploadViaBackendDirect(newCoverImageUri, imageName, createdTrip.id);
          await tripsService.updateTrip(createdTrip.id, {
            coverImageUrl: finalize.image_path,
            coverImageResizedUrl: finalize.resized_path || undefined,
            coverImageThumbnailUrl: finalize.thumbnail_path || undefined,
          });
        } catch (coverError) {
          console.error('Trip was created, but cover upload failed:', coverError);
          Alert.alert(
            'Trip Created',
            'Your trip was saved, but the cover image could not be uploaded. You can edit the trip and try the image again.'
          );
        }
      }
      returnToTrips();
    } catch (error) {
      console.error('Failed to create trip:', error);
      const detail = (error as any)?.response?.data?.detail || (error as Error)?.message;
      Alert.alert('Error', detail || 'Failed to create trip. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={returnToTrips}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={styles.backButtonText}>Trips</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create a New Trip</Text>
      </View>
      <TripForm
        onSubmit={handleSubmit}
        onCancel={returnToTrips}
        isLoading={isSubmitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
