import React, { useState } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TripForm } from '../components/TripForm';
import { tripsService, TripData } from '../services/trips';
import { useAuth } from '../contexts/AuthContext';
import { AppNavigatorParamList } from '../navigation/AppNavigator';
import { storageService, generateUniqueFileName } from '../services/storageService';
import { colors } from '../theme/colors';

type CreateTripNavigationProp = NativeStackNavigationProp<AppNavigatorParamList, 'CreateTrip'>;

export default function CreateTripScreen() {
  const navigation = useNavigation<CreateTripNavigationProp>();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      let coverImageUrlToSave: string | undefined | null = tripFormData.coverImageUrl;
      let coverImageResizedToSave: string | undefined;
      let coverImageThumbToSave: string | undefined;

      if (newCoverImageUri) {
        const imageName = generateUniqueFileName(newCoverImageUri);
        const fileExt = imageName.split('.').pop()?.toLowerCase() || 'jpg';
        const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
        const { signed_url, image_url } = await tripsService.generateCoverUploadUrl(imageName, contentType);
        await storageService.uploadViaSignedUrl(newCoverImageUri, signed_url, contentType);
        const finalize = await tripsService.finalizeCoverUpload(image_url);
        // Store the storage path; rendering resolves via getDownloadURL at runtime
        coverImageUrlToSave = finalize.image_path;
        coverImageResizedToSave = finalize.resized_path || undefined;
        coverImageThumbToSave = finalize.thumbnail_path || undefined;
      }

      const finalTripData: TripData = {
        ...tripFormData,
        coverImageUrl: coverImageUrlToSave,
        coverImageResizedUrl: coverImageResizedToSave,
        coverImageThumbnailUrl: coverImageThumbToSave,
      };

      await tripsService.createTrip(finalTripData, user.uid);
      navigation.goBack();
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
      <TripForm
        onSubmit={handleSubmit}
        onCancel={() => navigation.goBack()}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
