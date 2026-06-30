import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  Switch,
  Alert,
} from 'react-native';
import { Activity, PartialActivityData, Challenge } from '../services/activitiesService';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

type PriceRange = '$' | '$$' | '$$$' | '$$$$';
type PaymentStatus = 'unpaid' | 'deposit-paid' | 'paid';

interface ActivityFormProps {
  initialValues?: Partial<Activity>;
  onSubmit: (activityData: PartialActivityData, imageUris?: string[], coverImageUri?: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ActivityForm({
  initialValues,
  onSubmit,
  onCancel,
  isLoading,
}: ActivityFormProps) {
  const [name, setName] = useState(initialValues?.name || '');
  const [activityTypes, setActivityTypes] = useState<string[]>(initialValues?.activityTypes || []);
  const [description, setDescription] = useState(initialValues?.description || '');
  const [location, setLocation] = useState(initialValues?.location || '');
  const [website, setWebsite] = useState(initialValues?.website || '');
  const [budget, setBudget] = useState(initialValues?.budget?.toString() || '');
  const [cost, setCost] = useState(initialValues?.cost?.toString() || '');
  const [additionalExpenses, setAdditionalExpenses] = useState(initialValues?.additionalExpenses?.toString() || '');
  const [budgetCategory, setBudgetCategory] = useState(initialValues?.budgetCategory || '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(initialValues?.paymentStatus || 'unpaid');
  const [amountPaid, setAmountPaid] = useState(initialValues?.amountPaid?.toString() || '');
  const [imageUris, setImageUris] = useState<string[]>(initialValues?.imageUrls || []);
  const [challenges, setChallenges] = useState<Challenge[]>(initialValues?.challenges || []);
  const [newChallengeText, setNewChallengeText] = useState('');
  const [isSurprise, setIsSurprise] = useState(initialValues?.isSurprise || false);
  const [isBooked, setIsBooked] = useState(initialValues?.isBooked || false);
  const [isIdea, setIsIdea] = useState(initialValues?.isIdea ?? false);
  const [coverImageUri, setCoverImageUri] = useState(initialValues?.coverImageUrl || '');
  const [priceRange, setPriceRange] = useState<PriceRange | ''>(initialValues?.priceRange || '');

  const activityCategories = [
    'Dining', 'Outdoor', 'Entertainment', 'Adults Only', 'Relaxation'
  ];

  const activityPriceRanges: PriceRange[] = ['$', '$$', '$$$', '$$$$'];
  const budgetCategories = ['Lodging', 'Food', 'Transport', 'Activities', 'Shopping', 'Misc'];
  const paymentStatuses: Array<{ label: string; value: PaymentStatus }> = [
    { label: 'Unpaid', value: 'unpaid' },
    { label: 'Deposit Paid', value: 'deposit-paid' },
    { label: 'Paid', value: 'paid' },
  ];

  const handleActivityTypePress = (category: string) => {
    setActivityTypes(prev =>
      prev.includes(category)
        ? prev.filter(item => item !== category)
        : [...prev, category]
    );
  };

  const handlePriceRangePress = (range: PriceRange) => {
    setPriceRange((prev: PriceRange | '') => (prev === range ? '' : range));
  };

  const [activityDateTime, setActivityDateTime] = useState(() => {
    if (initialValues?.date) {
      const [year, month, day] = initialValues.date.split('-').map(Number);
      const initialDate = new Date(year, month - 1, day);

      if (initialValues?.time) {
        const timeMatch = initialValues.time.toLowerCase().match(/(\d{1,2}):(\d{2})\s*(am|pm)/);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const ampm = timeMatch[3];
          if (ampm === 'pm' && hours < 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
          initialDate.setHours(hours, minutes);
        }
      }
      return initialDate;
    }
    // For new activities, default to today for picker, but isDateSet will be false.
    return new Date();
  });

  const [activityEndDateTime, setActivityEndDateTime] = useState<Date | null>(() => {
    if (initialValues?.endTime && initialValues?.date) {
      const [year, month, day] = initialValues.date.split('-').map(Number);
      const endDate = new Date(year, month - 1, day);
      const timeMatch = initialValues.endTime.toLowerCase().match(/(\d{1,2}):(\d{2})\s*(am|pm)/);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3];
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        endDate.setHours(hours, minutes);
        return endDate;
      }
    }
    return null;
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [isDateSet, setIsDateSet] = useState(!!initialValues?.date);

  useEffect(() => {
    // When creating a new item, if it's not an idea, the date is considered set by default.
    // If it is an idea, the date is not set unless it has an initial value.
    if (!initialValues) {
      setIsDateSet(!isIdea);
    }
  }, [isIdea, initialValues]);

  const onDateChange = (_event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDateTime = new Date(selectedDate);
      if (activityDateTime) {
        newDateTime.setHours(activityDateTime.getHours(), activityDateTime.getMinutes());
      }
      setActivityDateTime(newDateTime);
      setIsDateSet(true);
    }
  };

  const onTimeChange = (_event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDateTime = activityDateTime ? new Date(activityDateTime) : new Date();
      newDateTime.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setActivityDateTime(newDateTime);
      setIsDateSet(true);
    }
  };

  const onEndDateChange = (_event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (selectedDate) {
      const newEndDateTime = activityEndDateTime ? new Date(activityEndDateTime) : new Date(activityDateTime);
      newEndDateTime.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setActivityEndDateTime(new Date(newEndDateTime));
    }
  };

  const onEndTimeChange = (_event: any, selectedTime?: Date) => {
    setShowEndTimePicker(false);
    if (selectedTime) {
      const newEndDateTime = activityEndDateTime ? new Date(activityEndDateTime) : new Date(activityDateTime);
      newEndDateTime.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setActivityEndDateTime(new Date(newEndDateTime));
    }
  };

  const renderDatePicker = (
    show: boolean,
    value: Date,
    onChange: (event: any, date?: Date) => void,
    showPickerSetter: React.Dispatch<React.SetStateAction<boolean>>,
    minimumDate?: Date,
  ) => {
    if (Platform.OS === 'web') {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      return (
        <input
          type="date"
          value={dateString}
          onChange={(e) => {
            if (e.target.valueAsDate) {
              const d = e.target.valueAsDate;
              const correctedDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
              onChange({}, correctedDate);
            }
          }}
          min={minimumDate?.toISOString().split('T')[0]}
          style={styles.input}
        />
      );
    }
    return (
      <>
        <TouchableOpacity onPress={() => showPickerSetter(true)}>
          <Text style={styles.input}>{value.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {show && <DateTimePicker value={value} mode="date" display="default" onChange={onChange} minimumDate={minimumDate} />}
      </>
    );
  };

  const renderTimePicker = (
    show: boolean,
    value: Date,
    onChange: (event: any, date?: Date) => void,
    showPickerSetter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    if (Platform.OS === 'web') {
      const timeString = value.toTimeString().split(' ')[0].substring(0, 5);
      return (
        <input
          type="time"
          value={timeString}
          onChange={(e) => {
            if (e.target.valueAsDate) {
              const d = e.target.valueAsDate;
              const newDate = new Date(value);
              newDate.setHours(d.getUTCHours(), d.getUTCMinutes());
              onChange({}, newDate);
            }
          }}
          style={styles.input}
        />
      );
    }
    return (
      <>
        <TouchableOpacity onPress={() => showPickerSetter(true)}>
          <Text style={styles.input}>{value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>
        {show && <DateTimePicker value={value} mode="time" display="default" onChange={onChange} />}
      </>
    );
  };

  const handleAddChallenge = () => {
    if (newChallengeText.trim()) {
      setChallenges([...challenges, { text: newChallengeText.trim(), completed: false }]);
      setNewChallengeText('');
    }
  };

  const handleRemoveChallenge = (index: number) => {
    setChallenges(challenges.filter((_, i) => i !== index));
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]) {
      setImageUris(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handleRemoveImage = (uriToRemove: string) => {
    setImageUris(prev => prev.filter(uri => uri !== uriToRemove));
  };

  const handlePickCoverImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        setCoverImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking cover image: ", error);
      Alert.alert("Error", "Could not pick an image. Please try again.");
    }
  };

  const handleRemoveCoverImage = () => {
    setCoverImageUri('');
  };

  const handleSubmit = () => {
    const activityData: PartialActivityData = {
      name,
      activityTypes,
      description,
      location,
      website: website.trim(),
      challenges,
      isSurprise,
      isBooked,
      isIdea,
      priceRange: priceRange || undefined,
      budgetCategory: budgetCategory || undefined,
      paymentStatus,
    };

    if (isDateSet && activityDateTime) {
      const year = activityDateTime.getFullYear();
      const month = String(activityDateTime.getMonth() + 1).padStart(2, '0');
      const day = String(activityDateTime.getDate()).padStart(2, '0');
      activityData.date = `${year}-${month}-${day}`;

      if (!isIdea) {
        activityData.time = activityDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
    }

    if (budget.trim()) {
      activityData.budget = parseFloat(budget);
    }
    if (cost.trim()) {
      const costValue = parseFloat(cost);
      if (!isNaN(costValue)) {
        activityData.cost = costValue;
        if (costValue > 0) {
          activityData.isBooked = true;
        }
      }
    }

    if (additionalExpenses.trim()) {
      const expensesValue = parseFloat(additionalExpenses);
      if (!isNaN(expensesValue)) {
        activityData.additionalExpenses = expensesValue;
      }
    }

    if (amountPaid.trim()) {
      const paidValue = parseFloat(amountPaid);
      if (!isNaN(paidValue)) {
        activityData.amountPaid = paidValue;
      }
    }

    if (activityEndDateTime) {
      activityData.endTime = activityEndDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }

    // Filter out images that are already uploaded
    const newImageUris = imageUris.filter(uri => !initialValues?.imageUrls?.includes(uri));

    // Determine if the cover image is a new upload
    const isNewCoverImage = coverImageUri && (
      coverImageUri.startsWith('file://') ||
      coverImageUri.startsWith('data:')
    );
    const newCoverImageUri = isNewCoverImage ? coverImageUri : undefined;

    // Preserve the existing remote cover image URL if a new one isn't being uploaded
    if (coverImageUri && coverImageUri.startsWith('http')) {
      activityData.coverImageUrl = coverImageUri;
    } else if (!coverImageUri) {
      // Handle image removal
      activityData.coverImageUrl = null;
    }
    // If coverImageUri is a local file, we don't set it on activityData here.
    // The parent screen will handle the upload and set the final URL.

    activityData.imageUrls = imageUris.filter(uri => uri.startsWith('http'));

    onSubmit(activityData, newImageUris, newCoverImageUri);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Activity Name" />

      <Text style={styles.label}>Price Range</Text>
      <View style={styles.categoryContainer}>
        {activityPriceRanges.map(range => (
          <TouchableOpacity
            key={range}
            style={[
              styles.categoryButton,
              priceRange === range && styles.categoryButtonSelected,
            ]}
            onPress={() => handlePriceRangePress(range)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                priceRange === range && styles.categoryButtonTextSelected,
              ]}
            >
              {range}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Activity Type</Text>
      <View style={styles.categoryContainer}>
        {activityCategories.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryButton,
              activityTypes.includes(category) && styles.categoryButtonSelected,
            ]}
            onPress={() => handleActivityTypePress(category)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                activityTypes.includes(category) && styles.categoryButtonTextSelected,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Activity Description (optional)"
        multiline
      />

      <Text style={styles.label}>Location (optional)</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Location" />

      <Text style={styles.label}>Website (optional)</Text>
      <TextInput style={styles.input} value={website} onChangeText={setWebsite} placeholder="https://example.com" keyboardType="url" />

      <View style={styles.surpriseContainer}>
        <Text style={styles.label}>Mark as Surprise?</Text>
        <Switch
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={isSurprise ? "#f5dd4b" : "#f4f3f4"}
          ios_backgroundColor="#3e3e3e"
          onValueChange={setIsSurprise}
          value={isSurprise}
        />
      </View>

      <View style={styles.surpriseContainer}>
        <Text style={styles.label}>Mark as Booked?</Text>
        <Switch
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={isBooked ? "#f5dd4b" : "#f4f3f4"}
          ios_backgroundColor="#3e3e3e"
          onValueChange={setIsBooked}
          value={isBooked}
        />
      </View>

      <View style={styles.surpriseContainer}>
        <Text style={styles.label}>Is this an Activity Idea?</Text>
        <Switch
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={isIdea ? "#f5dd4b" : "#f4f3f4"}
          ios_backgroundColor="#3e3e3e"
          onValueChange={setIsIdea}
          value={isIdea}
        />
      </View>

      {isDateSet && activityDateTime ? (
        <>
          <Text style={styles.label}>{isIdea ? 'Date (optional)' : 'Date'}</Text>
          {renderDatePicker(showDatePicker, activityDateTime, onDateChange, setShowDatePicker)}

          {!isIdea && (
            <>
              <Text style={styles.label}>Time</Text>
              {renderTimePicker(showTimePicker, activityDateTime, onTimeChange, setShowTimePicker)}

              {!activityEndDateTime && (
                <TouchableOpacity onPress={() => setActivityEndDateTime(new Date(activityDateTime))}>
                  <Text style={styles.linkText}>+ Add End Time</Text>
                </TouchableOpacity>
              )}

              {activityEndDateTime && (
                <>
                  <Text style={styles.label}>End Date</Text>
                  {renderDatePicker(showEndDatePicker, activityEndDateTime, onEndDateChange, setShowEndDatePicker, activityDateTime)}

                  <Text style={styles.label}>End Time</Text>
                  {renderTimePicker(showEndTimePicker, activityEndDateTime, onEndTimeChange, setShowEndTimePicker)}
                  <TouchableOpacity onPress={() => setActivityEndDateTime(null)}>
                    <Text style={[styles.linkText, styles.removeText]}>Remove End Time</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {isIdea && (
            <TouchableOpacity onPress={() => setIsDateSet(false)}>
              <Text style={[styles.linkText, styles.removeText]}>Remove Date</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <TouchableOpacity onPress={() => {
          setIsDateSet(true);
          setShowDatePicker(true);
        }}>
          <Text style={styles.linkText}>+ Add Date</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Budget</Text>
      <TextInput
        style={styles.input}
        value={budget}
        onChangeText={setBudget}
        placeholder="e.g., 50"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Budget Category</Text>
      <View style={styles.categoryContainer}>
        {budgetCategories.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryButton,
              budgetCategory === category && styles.categoryButtonSelected,
            ]}
            onPress={() => setBudgetCategory(prev => (prev === category ? '' : category))}
          >
            <Text
              style={[
                styles.categoryButtonText,
                budgetCategory === category && styles.categoryButtonTextSelected,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Cost</Text>
      <TextInput
        style={styles.input}
        value={cost}
        onChangeText={setCost}
        placeholder="e.g., 75.50"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Payment Status</Text>
      <View style={styles.categoryContainer}>
        {paymentStatuses.map(status => (
          <TouchableOpacity
            key={status.value}
            style={[
              styles.categoryButton,
              paymentStatus === status.value && styles.categoryButtonSelected,
            ]}
            onPress={() => setPaymentStatus(status.value)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                paymentStatus === status.value && styles.categoryButtonTextSelected,
              ]}
            >
              {status.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Amount Paid</Text>
      <TextInput
        style={styles.input}
        value={amountPaid}
        onChangeText={setAmountPaid}
        placeholder="e.g., 40"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Additional Expenses</Text>
      <TextInput
        style={styles.input}
        value={additionalExpenses}
        onChangeText={setAdditionalExpenses}
        placeholder="e.g., 20 for parking"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Cover Image</Text>
      <View style={styles.coverImageContainer}>
        {coverImageUri ? (
          <>
            <Image
              source={{ uri: coverImageUri }}
              style={[
                styles.coverImage,
                Platform.OS === 'web' && { height: 'auto', aspectRatio: 16/9 }
              ]}
            />
            <TouchableOpacity onPress={handleRemoveCoverImage} style={styles.removeImageIcon}>
              <Ionicons name="trash-bin-outline" size={24} color="white" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.imagePicker} onPress={handlePickCoverImage}>
            <Ionicons name="camera" size={40} color="#ccc" />
            <Text>Add Cover Photo</Text>
          </TouchableOpacity>
        )}
      </View>
      {coverImageUri && (
        <TouchableOpacity style={[styles.imagePicker, styles.changeImageButton]} onPress={handlePickCoverImage}>
          <Text style={styles.imagePickerButtonText}>Change Cover Photo</Text>
        </TouchableOpacity>
      )}

      {/* Image upload section */}
      <Text style={styles.label}>Gallery Images</Text>
      <View style={styles.imageContainer}>
        {imageUris.map((uri) => (
          <View key={uri} style={styles.imageWrapper}>
            <Image source={{ uri }} style={styles.image} />
            <TouchableOpacity onPress={() => handleRemoveImage(uri)} style={styles.removeImageButton}>
              <Text style={styles.removeImageButtonText}>X</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.addImageButton} onPress={handlePickImage}>
        <Text style={styles.buttonText}>Add Image</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Scavenger Hunt Challenges</Text>
      {challenges.map((challenge, index) => (
        <View key={index} style={styles.challengeContainer}>
          <Text style={styles.challengeText}>{challenge.text}</Text>
          <TouchableOpacity onPress={() => handleRemoveChallenge(index)}>
            <Text style={styles.removeChallengeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.addChallengeContainer}>
        <TextInput
          style={styles.challengeInput}
          value={newChallengeText}
          onChangeText={setNewChallengeText}
          placeholder="Add a new challenge"
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddChallenge}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.submitButton, !name && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading || !name}
        >
          <Text style={styles.buttonText}>{isLoading ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.background,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: colors.white,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 24,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  submitButton: {
    backgroundColor: colors.primary,
  },
  cancelButton: {
    backgroundColor: colors.backgroundAlt,
  },
  buttonText: {
    color: colors.textLight,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  imageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 10,
    marginBottom: 10,
  },
  image: {
    width: 150,
    height: 150,
    borderRadius: 8,
    backgroundColor: '#eef2f6',
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: colors.error,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageButtonText: {
    color: colors.textLight,
    fontWeight: 'bold',
  },
  challengeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 8,
  },
  challengeText: {
    flex: 1,
  },
  removeChallengeText: {
    color: colors.error,
  },
  addChallengeContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  challengeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.white,
  },
  addButton: {
    marginLeft: 8,
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.textLight,
    fontWeight: 'bold',
  },
  linkText: {
    color: colors.primary,
    marginBottom: 16,
  },
  removeText: {
    color: colors.error,
    textAlign: 'right',
  },
  surpriseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addImageButton: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  coverImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#eef2f6',
    marginBottom: 10,
    resizeMode: 'cover',
  },
  coverImageContainer: {
    position: 'relative',
    marginBottom: 16,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 220,
  },
  removeImageIcon: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    padding: 5,
  },
  imagePicker: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePickerButtonText: {
    color: colors.textLight,
    fontWeight: 'bold',
    marginTop: 8,
  },
  changeImageButton: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  categoryButton: {
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    minWidth: '45%',
  },
  categoryButtonSelected: {
    backgroundColor: colors.primary,
  },
  categoryButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  categoryButtonTextSelected: {
    color: colors.textLight,
  },
});
