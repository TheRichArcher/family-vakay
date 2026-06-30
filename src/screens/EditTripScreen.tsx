import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TripForm } from '../components/TripForm';
import { tripsService, TripData, Trip } from '../services/trips';
import { AppNavigatorParamList } from '../navigation/AppNavigator';
import { storageService, generateUniqueFileName } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme/colors';

type EditTripRouteProp = RouteProp<AppNavigatorParamList, 'EditTrip'>;
type EditTripNavigationProp = NativeStackNavigationProp<AppNavigatorParamList, 'EditTrip'>;

export default function EditTripScreen() {
  const navigation = useNavigation<EditTripNavigationProp>();
  const route = useRoute<EditTripRouteProp>();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const { trip } = route.params as { trip: Trip };

  const handleSubmit = async (tripFormData: TripData, newCoverImageUri?: string) => {
    if (!user?.uid) {
      Alert.alert('Error', 'You must be logged in to edit a trip.');
      return;
    }
    if (user.uid !== trip.ownerId) {
      Alert.alert('Permission Denied', 'You can only edit your own trips.');
      return;
    }

    setIsLoading(true);
    try {
      let coverImageUrlToSave: string | undefined | null = tripFormData.coverImageUrl;

      if (newCoverImageUri && newCoverImageUri !== trip.coverImageUrl) {
        const imageName = generateUniqueFileName(newCoverImageUri);
        const fileExt = imageName.split('.').pop()?.toLowerCase() || 'jpg';
        const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
        try {
          // Try backend direct upload first to bypass any browser CORS/network issues
          const direct = await storageService.uploadViaBackendDirect(newCoverImageUri, imageName);
          // Store the storage path; viewer resolves via getDownloadURL
          coverImageUrlToSave = direct.image_path;
          if (direct.thumbnail_path || direct.resized_path) {
            await tripsService.updateTrip(trip.id, {
              coverImageThumbnailUrl: direct.thumbnail_path || undefined,
              coverImageResizedUrl: direct.resized_path || undefined,
            } as any);
          }
        } catch (eDirect) {
          console.warn('Backend direct upload failed; trying signed URL...', eDirect);
          try {
            const { signed_url, image_url } = await tripsService.generateCoverUploadUrl(imageName, contentType);
            await storageService.uploadViaSignedUrl(newCoverImageUri, signed_url, contentType);
            const finalize = await tripsService.finalizeCoverUpload(image_url);
            // Store the storage path; StorageImage resolves to a signed URL
            coverImageUrlToSave = finalize.image_path;
            // Optionally persist derivative paths when available
            if (finalize.thumbnail_path || finalize.resized_path) {
              await tripsService.updateTrip(trip.id, {
                coverImageThumbnailUrl: finalize.thumbnail_path || undefined,
                coverImageResizedUrl: finalize.resized_path || undefined,
              } as any);
            }
          } catch (eSigned) {
            console.warn('Signed URL upload failed; falling back to Firebase SDK upload.', eSigned);
            const fallbackPath = `trip_cover_images/${user.uid}/${trip.id}/${imageName}`;
            coverImageUrlToSave = await storageService.uploadImageAndGetDownloadURL(newCoverImageUri, fallbackPath);
          }
        }
      } else if (newCoverImageUri === null) {
        // Handle image removal
        coverImageUrlToSave = null;
      }
      
      const finalTripData: Partial<TripData> = {
        name: tripFormData.name,
        description: tripFormData.description,
        location: tripFormData.location,
        startDate: tripFormData.startDate,
        endDate: tripFormData.endDate,
        budget: tripFormData.budget,
        status: tripFormData.status,
        participants: tripFormData.participants,
        coverImageUrl: coverImageUrlToSave,
      };
      
      await tripsService.updateTrip(trip.id, finalTripData);
      
      navigation.goBack();
    } catch (error: any) {
      console.error('DEBUG: EditTripScreen - Error updating trip:', error);
      Alert.alert('Error Updating Trip', error?.message || String(error));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  
  if (!trip) {
    return (
        <View style={styles.loadingContainer}>
            <Text>Error: Trip data not found for editing.</Text>
        </View>
    )
  }

  return (
    <View style={styles.container}>
      <TripForm
        initialValues={trip}
        onSubmit={handleSubmit}
        onCancel={() => navigation.goBack()}
        isLoading={isLoading}
      />
    </View>
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
    backgroundColor: colors.background,
  },
}); 