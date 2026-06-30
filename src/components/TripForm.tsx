import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Image,
} from 'react-native';
import { colors } from '../theme/colors';
import { Trip, TripData } from '../services/trips';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { userService, UserProfile } from '../services/userService';

interface TripFormProps {
  initialValues?: Partial<Trip>;
  onSubmit: (trip: TripData, newCoverImageUri?: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

// Re-triggering deployment with a comment
export function TripForm({ initialValues, onSubmit, onCancel, isLoading: externalLoading }: TripFormProps) {
  const { user } = useAuth();
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [location, setLocation] = useState(initialValues?.location || '');
  const [budget, setBudget] = useState(initialValues?.budget?.toString() || '');
  const [startDate, setStartDate] = useState(initialValues?.startDate ? new Date(`${initialValues.startDate}T00:00:00`) : new Date());
  const [endDate, setEndDate] = useState(initialValues?.endDate ? new Date(`${initialValues.endDate}T00:00:00`) : new Date());
  const [status, setStatus] = useState<Trip['status']>(initialValues?.status || 'upcoming');
  const [isSubmittingInternal, setIsSubmittingInternal] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [allParticipants, setAllParticipants] = useState<UserProfile[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(initialValues?.participants || []);


  const [coverImageLocalUri, setCoverImageLocalUri] = useState<string | null>(initialValues?.coverImageUrl || null);

  const isLoading = externalLoading || isSubmittingInternal;

  useEffect(() => {
    if (initialValues?.coverImageUrl) {
      setCoverImageLocalUri(initialValues.coverImageUrl);
    }
  }, [initialValues?.coverImageUrl]);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          alert('Sorry, we need camera roll permissions to make this work!');
        }
      }
    })();
  }, []);

  useEffect(() => {
    const fetchTripParticipants = async () => {
      if (user?.uid) {
        try {
          const familyId = user.familyId || (user as any).family_id;
          // 1. Get all participant UIDs from the trip object. This is the source of truth.
          const tripParticipantIds = initialValues?.participants || [];

          // 2. Fetch all family members to display the full list of potential participants.
          const fallbackCurrentUser = {
            uid: user.uid,
            name: user.name || user.email || 'Me',
            email: user.email || undefined,
            role: user.role || 'member',
            familyId,
            isKid: user.role === 'kid',
          } as UserProfile;
          const family = familyId
            ? await userService.getFamilyMembers(familyId)
            : [fallbackCurrentUser];
          // 3. Fetch profiles for ALL participants on the trip.
          const participantProfiles = tripParticipantIds.length > 0
            ? await userService.getUsersByIds(tripParticipantIds)
            : [];

          // 4. Combine the list of actual participants with all family members for the checklist.
          // This ensures that existing participants are shown, and other family members can be added.
          const combined = [...participantProfiles, ...family];
          const uniqueParticipants = Array.from(new Map(combined.map(p => [p.uid, p])).values());

          // Sort by name for consistent display
          uniqueParticipants.sort((a, b) => a.name.localeCompare(b.name));

          setAllParticipants(uniqueParticipants);

          // If this is a new trip, pre-select all family members.
          if (!initialValues) {
            const participantIds = family.map(m => m.uid);
            setSelectedParticipants(participantIds.length > 0 ? participantIds : [user.uid]);
          } else {
            // For an existing trip, ensure the selection matches the actual participants.
            setSelectedParticipants(tripParticipantIds);
          }

        } catch (error) {
          console.error("Failed to fetch trip participants:", error);
          if (!initialValues) {
            setAllParticipants([{
              uid: user.uid,
              name: user.name || user.email || 'Me',
              email: user.email || undefined,
              role: user.role || 'member',
              familyId: user.familyId || (user as any).family_id,
              isKid: user.role === 'kid',
            } as UserProfile]);
            setSelectedParticipants([user.uid]);
          } else {
            Alert.alert("Error", "Could not load trip participant information.");
          }
        }
      }
    };
    fetchTripParticipants();
  }, [user?.uid, user?.familyId, (user as any)?.family_id, initialValues]);

  const toggleParticipant = (uid: string) => {
    setSelectedParticipants(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const pickImage = async () => {
    if (isLoading) return;
    const { status: mediaLibraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (mediaLibraryStatus !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setCoverImageLocalUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!name || !description || !location) {
      Alert.alert('Missing Information', 'Please fill in all required fields: Name, Description, and Location.');
      return;
    }
    if (selectedParticipants.length === 0) {
      Alert.alert('No Participants', 'Please select at least one family member to join the trip.');
      return;
    }
    if (!user?.uid) {
      Alert.alert('Authentication Error', 'You must be logged in.');
      return;
    }

    setIsSubmittingInternal(true);

    const formatToYYYYMMDD = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const tripData: TripData = {
      name,
      description,
      location,
      startDate: formatToYYYYMMDD(startDate),
      endDate: formatToYYYYMMDD(endDate),
      status,
      participants: selectedParticipants,
      ownerId: user.uid,
      coverImageUrl: coverImageLocalUri,
    };

    if (budget) {
      tripData.budget = parseFloat(budget);
    }

    try {
      await onSubmit(tripData, coverImageLocalUri && coverImageLocalUri !== initialValues?.coverImageUrl ? coverImageLocalUri : undefined);
    } catch (error) {
      console.error("TripForm.tsx: Error during submission process:", error);
      Alert.alert("Submission Error", `An error occurred: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSubmittingInternal(false);
    }
  };

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    setShowStartDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      setStartDate(newDate);
      if (newDate > endDate) {
        setEndDate(newDate);
      }
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      setEndDate(newDate);
    }
  };

  const renderDatePicker = (
    show: boolean,
    value: Date,
    onChange: (event: any, date?: Date) => void,
    showPickerSetter: React.Dispatch<React.SetStateAction<boolean>>,
    minimumDate?: Date
  ) => {
    if (Platform.OS === 'web') {
      return (
        <View style={styles.dateInputContainer}>
          <input
            type="date"
            value={value.toISOString().split('T')[0]}
            onChange={(e) => {
              const [year, month, day] = e.target.value.split('-').map(Number);
              const newDate = new Date(year, month - 1, day);
              onChange({}, newDate);
            }}
            min={minimumDate?.toISOString().split('T')[0]}
            style={styles.webDateInput}
          />
        </View>
      );
    }

    return (
      <View style={styles.dateInputContainer}>
        <TouchableOpacity
          style={styles.dateInput}
          onPress={() => showPickerSetter(true)}
        >
          <Text style={styles.dateInputText}>
            {value.toLocaleDateString()}
          </Text>
        </TouchableOpacity>
        {show && (
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onChange}
            minimumDate={minimumDate}
            timeZoneName={'local'}
          />
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter trip name"
            editable={!isLoading}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g., A week of adventure in the mountains"
            multiline
            numberOfLines={4}
            editable={!isLoading}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g., Denver, CO"
            editable={!isLoading}
          />

          <Text style={styles.label}>Total Budget (optional)</Text>
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={setBudget}
            placeholder="e.g., 2000"
            keyboardType="numeric"
            editable={!isLoading}
          />

          <Text style={styles.label}>Participants</Text>
          <View style={styles.participantsContainer}>
            {allParticipants.map(member => (
              <TouchableOpacity
                key={member.uid}
                style={styles.participantItem}
                onPress={() => toggleParticipant(member.uid)}
                disabled={isLoading}
              >
                <View style={[styles.checkbox, selectedParticipants.includes(member.uid) && styles.checkboxSelected]}>
                  {selectedParticipants.includes(member.uid) && <Text style={styles.checkboxIcon}>✓</Text>}
                </View>
                <Text style={styles.participantName}>{member.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Cover Image</Text>
          <View style={styles.imagePickerContainer}>
            {coverImageLocalUri ? (
              <Image source={{ uri: coverImageLocalUri }} style={styles.imagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.imagePlaceholderText}>No image selected</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.buttonBase, styles.imagePickerButton, isLoading && styles.buttonDisabled]}
              onPress={pickImage}
              disabled={isLoading}
            >
              <Text style={styles.imagePickerButtonText}>{coverImageLocalUri && initialValues?.coverImageUrl === coverImageLocalUri ? 'Change Image' : (coverImageLocalUri ? 'Change Image' : 'Select Image')}</Text>
            </TouchableOpacity>
            {coverImageLocalUri && (
              <TouchableOpacity
                style={[styles.buttonBase, styles.removeImageButton, isLoading && styles.buttonDisabled]}
                onPress={() => setCoverImageLocalUri(null)}
                disabled={isLoading}
              >
                <Text style={styles.imagePickerButtonText}>Remove Image</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>Start Date</Text>
          {renderDatePicker(showStartDatePicker, startDate, handleStartDateChange, setShowStartDatePicker)}

          <Text style={styles.label}>End Date</Text>
          {renderDatePicker(showEndDatePicker, endDate, handleEndDateChange, setShowEndDatePicker, startDate)}

          {initialValues && (
            <>
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusContainer}>
                {(['upcoming', 'in-progress', 'completed'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusButton,
                      status === s && styles.statusButtonActive,
                      isLoading && styles.buttonDisabled,
                    ]}
                    onPress={() => setStatus(s)}
                    disabled={isLoading}
                  >
                    <Text
                      style={[
                        styles.statusButtonText,
                        status === s && styles.statusButtonTextActive,
                      ]}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.buttonBase, styles.cancelButton, isLoading && styles.buttonDisabled]}
              onPress={onCancel}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.buttonBase,
                styles.submitButton,
                (!name || !description || !location) && styles.buttonDisabled,
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isLoading || !name || !description || !location}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                {isSubmittingInternal ? 'Saving...' : (externalLoading ? 'Loading...' : 'Save')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: colors.surface,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateInputContainer: {
    marginBottom: 16,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surface,
  },
  dateInputText: {
    fontSize: 16,
    color: colors.text,
  },
  webDateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  statusContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  statusButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  statusButtonTextActive: {
    color: colors.textLight,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  buttonBase: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.backgroundAlt,
  },
  submitButton: {
    backgroundColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  imagePickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textLight,
  },
  imagePickerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  imagePreview: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#eef2f6',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#eef2f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    color: colors.muted,
  },
  imagePickerButton: {
    backgroundColor: colors.primary,
    marginBottom: 5,
    width: '100%',
  },
  removeImageButton: {
    backgroundColor: colors.error,
    width: '100%',
  },
  participantsContainer: {
    marginBottom: 16,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxIcon: {
    color: colors.textLight,
    fontWeight: 'bold',
  },
  participantName: {
    fontSize: 16,
  },
});
