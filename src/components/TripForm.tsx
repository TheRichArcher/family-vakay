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
import { ItineraryStop, Trip, TripData } from '../services/trips';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { userService, UserProfile } from '../services/userService';

interface TripFormProps {
  initialValues?: Partial<Trip>;
  onSubmit: (trip: TripData, newCoverImageUri?: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const DEFAULT_TRIP_DATE = new Date(2026, 6, 5);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
const MERIDIEM_OPTIONS = ['AM', 'PM'] as const;

const formatToYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatToUSDate = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
};

const normalizeYear = (year: number) => {
  if (year < 100) {
    return 2000 + year;
  }
  return year;
};

const isRealDate = (year: number, month: number, day: number) => {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};

const parseFlexibleDateInput = (value: string, defaultYear = DEFAULT_TRIP_DATE.getFullYear()) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const pieces = trimmed.split(/[./-]/).map(part => part.trim()).filter(Boolean);
  if (pieces.length < 2 || pieces.length > 3 || pieces.some(part => !/^\d+$/.test(part))) {
    return undefined;
  }

  let year = defaultYear;
  let month = Number(pieces[0]);
  let day = Number(pieces[1]);

  if (pieces.length === 3) {
    const first = Number(pieces[0]);
    const second = Number(pieces[1]);
    const third = Number(pieces[2]);
    const firstLooksLikeYear = pieces[0].length === 4 || first > 12;

    if (firstLooksLikeYear) {
      year = normalizeYear(first);
      month = second;
      day = third;
    } else {
      month = first;
      day = second;
      year = normalizeYear(third);
    }
  }

  if (!isRealDate(year, month, day)) {
    return undefined;
  }

  return new Date(year, month - 1, day);
};

const parseDateValue = (value?: string) => {
  if (!value) {
    return new Date(DEFAULT_TRIP_DATE);
  }

  return parseFlexibleDateInput(value) || new Date(DEFAULT_TRIP_DATE);
};

const parseUSDateInput = (value: string, defaultYear?: number) => parseFlexibleDateInput(value, defaultYear);

const formatDateInputValue = (value?: string, defaultYear?: number) => {
  if (!value) {
    return '';
  }

  const parsedDate = parseUSDateInput(value, defaultYear);
  if (parsedDate) {
    return formatToUSDate(parsedDate);
  }

  return value;
};

const formatDateInputForSubmit = (value: string, defaultYear?: number) => {
  const parsedDate = parseUSDateInput(value, defaultYear);
  return parsedDate ? formatToYYYYMMDD(parsedDate) : undefined;
};

const formatItineraryTime = (value?: string | null) => {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return undefined;
  }

  const meridiemMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])(?:\.?m\.?)?$/i);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] || '0');
    const meridiem = meridiemMatch[3].toUpperCase() === 'A' ? 'AM' : 'PM';
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return undefined;
    }
    return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`;
  }

  const hour24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hour24Match) {
    const hour = Number(hour24Match[1]);
    const minute = Number(hour24Match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return undefined;
    }
    if (hour > 12 || hour === 0 || hour24Match[1].startsWith('0')) {
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const meridiem = hour >= 12 ? 'PM' : 'AM';
      return `${displayHour}:${String(minute).padStart(2, '0')} ${meridiem}`;
    }
  }

  return undefined;
};

const getYearOptions = (baseYear: number) => (
  Array.from({ length: 9 }, (_, index) => baseYear - 1 + index)
);

const getDateParts = (value: string, defaultDate: Date) => {
  const parsed = parseFlexibleDateInput(value, defaultDate.getFullYear()) || defaultDate;
  return {
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
    year: parsed.getFullYear(),
  };
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const setDatePart = (
  value: string,
  defaultDate: Date,
  part: 'month' | 'day' | 'year',
  nextValue: number,
) => {
  const current = getDateParts(value, defaultDate);
  const next = { ...current, [part]: nextValue };
  next.day = Math.min(next.day, getDaysInMonth(next.year, next.month));
  return formatToUSDate(new Date(next.year, next.month - 1, next.day));
};

const getTimeParts = (value?: string | null) => {
  const formatted = formatItineraryTime(value);
  if (!formatted) {
    return undefined;
  }

  const match = formatted.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
  if (!match) {
    return undefined;
  }

  return {
    hour: Number(match[1]),
    minute: match[2],
    meridiem: match[3] as typeof MERIDIEM_OPTIONS[number],
  };
};

const buildTimeValue = (
  parts: { hour?: number; minute?: string; meridiem?: typeof MERIDIEM_OPTIONS[number] },
  fallback?: string | null,
) => {
  const current = getTimeParts(fallback) || { hour: 12, minute: '00', meridiem: 'PM' as const };
  const hour = parts.hour ?? current.hour;
  const minute = parts.minute ?? current.minute;
  const meridiem = parts.meridiem ?? current.meridiem;
  return `${hour}:${minute} ${meridiem}`;
};

export function TripForm({ initialValues, onSubmit, onCancel, isLoading: externalLoading }: TripFormProps) {
  const { user } = useAuth();
  const initialStartDateValue = parseDateValue(initialValues?.startDate);
  const initialEndDateValue = parseDateValue(initialValues?.endDate);
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [location, setLocation] = useState(initialValues?.location || '');
  const [budget, setBudget] = useState(initialValues?.budget?.toString() || '');
  const [startDate, setStartDate] = useState(initialStartDateValue);
  const [endDate, setEndDate] = useState(initialEndDateValue);
  const [startDateInput, setStartDateInput] = useState(formatToUSDate(initialStartDateValue));
  const [endDateInput, setEndDateInput] = useState(formatToUSDate(initialEndDateValue));
  const [status, setStatus] = useState<Trip['status']>(initialValues?.status || 'upcoming');
  const initialTripType = initialValues?.tripType === 'cruise' ? 'multiLocation' : (initialValues?.tripType || 'standard');
  const [tripType, setTripType] = useState<'standard' | 'multiLocation'>(initialTripType as 'standard' | 'multiLocation');
  const [itinerary, setItinerary] = useState<ItineraryStop[]>(
    initialValues?.itinerary?.map(stop => ({
      ...stop,
      date: formatDateInputValue(stop.date, initialStartDateValue.getFullYear()),
      arrivalTime: formatItineraryTime(stop.arrivalTime) || stop.arrivalTime,
      departureTime: formatItineraryTime(stop.departureTime) || stop.departureTime,
    })) || []
  );
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

  const addItineraryStop = () => {
    const nextIndex = itinerary.length;
    const defaultDate = new Date(startDate);
    defaultDate.setDate(startDate.getDate() + nextIndex);
    const clampedDate = defaultDate > endDate ? endDate : defaultDate;
    setItinerary(prev => [
      ...prev,
      {
        id: `stop-${Date.now()}-${nextIndex}`,
        date: formatToUSDate(clampedDate),
        type: nextIndex === 0 ? 'embark' : 'port',
        portName: nextIndex === 0 ? location || 'Embarkation' : '',
        location: '',
        arrivalTime: '',
        departureTime: '',
        notes: '',
      },
    ]);
  };

  const updateItineraryStop = (id: string, updates: Partial<ItineraryStop>) => {
    setItinerary(prev => prev.map(stop => stop.id === id ? { ...stop, ...updates } : stop));
  };

  const removeItineraryStop = (id: string) => {
    setItinerary(prev => prev.filter(stop => stop.id !== id));
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

    const ownerId = initialValues?.ownerId || user.uid;
    const participants = Array.from(new Set([...selectedParticipants, ownerId]));
    const cleanItinerary: ItineraryStop[] = [];

    if (tripType === 'multiLocation') {
      for (let index = 0; index < itinerary.length; index += 1) {
        const stop = itinerary[index];
        const hasAnyStopData = Boolean(
          stop.date ||
          stop.portName ||
          stop.location ||
          stop.arrivalTime ||
          stop.departureTime ||
          stop.notes
        );

        if (!hasAnyStopData) {
          continue;
        }

        const stopName = stop.type === 'sea' ? (stop.portName || 'At Sea') : stop.portName?.trim();
        if (!stopName) {
          Alert.alert('Missing Stop Name', `Add a name for itinerary day ${index + 1}.`);
          return;
        }

        const formattedDate = formatDateInputForSubmit(stop.date, startDate.getFullYear());
        if (!formattedDate) {
          Alert.alert('Invalid Date', `Fix the date for itinerary day ${index + 1}. Use 7/5, 7-5, 7/5/26, or 2026-07-05.`);
          return;
        }

        const arrivalTime = formatItineraryTime(stop.arrivalTime);
        if (stop.arrivalTime && !arrivalTime) {
          Alert.alert('Invalid Arrival Time', `Fix the arrival time for itinerary day ${index + 1}. Use AM/PM, like 12:00 PM, or clear 24-hour time like 14:30.`);
          return;
        }

        const departureTime = formatItineraryTime(stop.departureTime);
        if (stop.departureTime && !departureTime) {
          Alert.alert('Invalid Departure Time', `Fix the departure time for itinerary day ${index + 1}. Use AM/PM, like 12:00 PM, or clear 24-hour time like 14:30.`);
          return;
        }

        cleanItinerary.push({
          ...stop,
          date: formattedDate,
          portName: stopName,
          location: stop.location || undefined,
          arrivalTime,
          departureTime,
          notes: stop.notes || undefined,
        });
      }
    }

    const tripData: TripData = {
      name,
      description,
      location,
      startDate: formatToYYYYMMDD(startDate),
      endDate: formatToYYYYMMDD(endDate),
      status,
      participants,
      ownerId,
      coverImageUrl: coverImageLocalUri,
      tripType,
      itinerary: tripType === 'multiLocation' ? cleanItinerary : [],
    };

    if (budget) {
      tripData.budget = parseFloat(budget);
    }

    setIsSubmittingInternal(true);

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
      setStartDateInput(formatToUSDate(newDate));
      if (newDate > endDate) {
        setEndDate(newDate);
        setEndDateInput(formatToUSDate(newDate));
      }
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      setEndDate(newDate);
      setEndDateInput(formatToUSDate(newDate));
    }
  };

  const renderDatePicker = (
    show: boolean,
    value: Date,
    inputValue: string,
    setInputValue: React.Dispatch<React.SetStateAction<string>>,
    onChange: (event: any, date?: Date) => void,
    showPickerSetter: React.Dispatch<React.SetStateAction<boolean>>,
    minimumDate?: Date
  ) => {
    if (Platform.OS === 'web') {
      return (
        <View style={styles.dateInputContainer}>
          <TextInput
            style={styles.webDateInput}
            value={inputValue}
            onChangeText={(text) => {
              setInputValue(text);
              const parsedDate = parseUSDateInput(text, value.getFullYear());
              if (parsedDate) {
                const nextDate = minimumDate && parsedDate < minimumDate ? minimumDate : parsedDate;
                onChange({}, nextDate);
                if (nextDate !== parsedDate) {
                  setInputValue(formatToUSDate(nextDate));
                }
              }
            }}
            onBlur={() => {
              const parsedDate = parseUSDateInput(inputValue, value.getFullYear());
              if (parsedDate) {
                const nextDate = minimumDate && parsedDate < minimumDate ? minimumDate : parsedDate;
                setInputValue(formatToUSDate(nextDate));
                onChange({}, nextDate);
              } else {
                setInputValue(formatToUSDate(value));
              }
            }}
            placeholder="7/5 or 07-05-2026"
            keyboardType="numbers-and-punctuation"
            editable={!isLoading}
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
            {formatToUSDate(value)}
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

  const renderItineraryDateControl = (stop: ItineraryStop, index: number) => {
    const parts = getDateParts(stop.date, startDate);
    const yearOptions = getYearOptions(startDate.getFullYear());

    return (
      <View style={styles.structuredField}>
        <Text style={styles.compactLabel}>Date</Text>
        <View style={styles.dateSelectRow}>
          <View style={styles.selectShell}>
            <Picker
              enabled={!isLoading}
              selectedValue={parts.month}
              style={styles.compactPicker}
              testID={`itinerary-${index}-month`}
              onValueChange={(value) => updateItineraryStop(stop.id, {
                date: setDatePart(stop.date, startDate, 'month', Number(value)),
              })}
            >
              {MONTH_OPTIONS.map(month => (
                <Picker.Item key={month} label={String(month).padStart(2, '0')} value={month} />
              ))}
            </Picker>
          </View>
          <Text style={styles.dateSeparator}>/</Text>
          <View style={styles.selectShell}>
            <Picker
              enabled={!isLoading}
              selectedValue={parts.day}
              style={styles.compactPicker}
              testID={`itinerary-${index}-day`}
              onValueChange={(value) => updateItineraryStop(stop.id, {
                date: setDatePart(stop.date, startDate, 'day', Number(value)),
              })}
            >
              {DAY_OPTIONS.map(day => (
                <Picker.Item key={day} label={String(day).padStart(2, '0')} value={day} />
              ))}
            </Picker>
          </View>
          <Text style={styles.dateSeparator}>/</Text>
          <View style={[styles.selectShell, styles.yearSelectShell]}>
            <Picker
              enabled={!isLoading}
              selectedValue={parts.year}
              style={styles.compactPicker}
              testID={`itinerary-${index}-year`}
              onValueChange={(value) => updateItineraryStop(stop.id, {
                date: setDatePart(stop.date, startDate, 'year', Number(value)),
              })}
            >
              {yearOptions.map(year => (
                <Picker.Item key={year} label={String(year)} value={year} />
              ))}
            </Picker>
          </View>
        </View>
      </View>
    );
  };

  const renderItineraryTimeControl = (
    stop: ItineraryStop,
    index: number,
    field: 'arrivalTime' | 'departureTime',
    label: string,
  ) => {
    const parts = getTimeParts(stop[field]);
    if (!parts) {
      return (
        <View style={styles.timeControl}>
          <Text style={styles.compactLabel}>{label}</Text>
          <TouchableOpacity
            style={[styles.setTimeButton, isLoading && styles.buttonDisabled]}
            disabled={isLoading}
            testID={`itinerary-${index}-${field}-set`}
            onPress={() => updateItineraryStop(stop.id, { [field]: '12:00 PM' })}
          >
            <Text style={styles.setTimeButtonText}>Set {label.toLowerCase()} time</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const timeValue = parts;

    return (
      <View style={styles.timeControl}>
        <View style={styles.timeControlHeader}>
          <Text style={styles.compactLabel}>{label}</Text>
          {!!parts && (
            <TouchableOpacity
              onPress={() => updateItineraryStop(stop.id, { [field]: undefined })}
              disabled={isLoading}
            >
              <Text style={styles.clearTimeText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.timeSelectRow}>
          <View style={styles.timeSelectShell}>
            <Picker
              enabled={!isLoading}
              selectedValue={timeValue.hour}
              style={styles.compactPicker}
              testID={`itinerary-${index}-${field}-hour`}
              onValueChange={(value) => updateItineraryStop(stop.id, {
                [field]: buildTimeValue({ hour: Number(value) }, stop[field]),
              })}
            >
              {HOUR_OPTIONS.map(hour => (
                <Picker.Item key={hour} label={String(hour)} value={hour} />
              ))}
            </Picker>
          </View>
          <View style={styles.timeSelectShell}>
            <Picker
              enabled={!isLoading}
              selectedValue={timeValue.minute}
              style={styles.compactPicker}
              testID={`itinerary-${index}-${field}-minute`}
              onValueChange={(value) => updateItineraryStop(stop.id, {
                [field]: buildTimeValue({ minute: String(value) }, stop[field]),
              })}
            >
              {MINUTE_OPTIONS.map(minute => (
                <Picker.Item key={minute} label={minute} value={minute} />
              ))}
            </Picker>
          </View>
          <View style={styles.timeSelectShell}>
            <Picker
              enabled={!isLoading}
              selectedValue={timeValue.meridiem}
              style={styles.compactPicker}
              testID={`itinerary-${index}-${field}-meridiem`}
              onValueChange={(value) => updateItineraryStop(stop.id, {
                [field]: buildTimeValue({ meridiem: value as typeof MERIDIEM_OPTIONS[number] }, stop[field]),
              })}
            >
              {MERIDIEM_OPTIONS.map(meridiem => (
                <Picker.Item key={meridiem} label={meridiem} value={meridiem} />
              ))}
            </Picker>
          </View>
        </View>
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

          <Text style={styles.label}>Trip Type</Text>
          <View style={styles.statusContainer}>
            {(['standard', 'multiLocation'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.statusButton,
                  tripType === type && styles.statusButtonActive,
                  isLoading && styles.buttonDisabled,
                ]}
                onPress={() => setTripType(type)}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    tripType === type && styles.statusButtonTextActive,
                  ]}
                >
                  {type === 'standard' ? 'Single Location' : 'Multiple Locations'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tripType === 'multiLocation' && (
            <View style={styles.itinerarySection}>
              <View style={styles.itineraryHeader}>
                <Text style={styles.sectionTitle}>Trip Itinerary</Text>
                <TouchableOpacity
                  style={[styles.smallButton, isLoading && styles.buttonDisabled]}
                  onPress={addItineraryStop}
                  disabled={isLoading}
                >
                  <Text style={styles.smallButtonText}>Add Stop</Text>
                </TouchableOpacity>
              </View>

              {itinerary.length === 0 ? (
                <Text style={styles.helperText}>Add each city, stop, travel day, sea day, park day, or resort move.</Text>
              ) : (
                itinerary.map((stop, index) => (
                  <View key={stop.id} style={styles.stopCard}>
                    <View style={styles.stopHeader}>
                      <Text style={styles.stopTitle}>Day {index + 1}</Text>
                      <TouchableOpacity onPress={() => removeItineraryStop(stop.id)} disabled={isLoading}>
                        <Text style={styles.removeStopText}>Remove</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.compactLabel}>Stop Type</Text>
                    <View style={styles.stopTypeRow}>
                      {(['embark', 'port', 'sea', 'debark'] as const).map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[styles.stopTypeButton, stop.type === type && styles.stopTypeButtonActive]}
                          onPress={() => updateItineraryStop(stop.id, {
                            type,
                            portName: type === 'sea' && !stop.portName ? 'At Sea' : stop.portName,
                          })}
                          disabled={isLoading}
                        >
                          <Text style={[styles.stopTypeText, stop.type === type && styles.stopTypeTextActive]}>
                            {type === 'embark'
                              ? 'Start'
                              : type === 'port'
                                ? 'Location'
                                : type === 'sea'
                                  ? 'Travel/Sea'
                                  : 'End'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TextInput
                      style={styles.input}
                      value={stop.portName}
                      onChangeText={(value) => updateItineraryStop(stop.id, { portName: value })}
                      placeholder={stop.type === 'sea' ? 'Travel day or At Sea' : 'City, park, resort, or port name'}
                      editable={!isLoading}
                    />
                    {renderItineraryDateControl(stop, index)}
                    <TextInput
                      style={styles.input}
                      value={stop.location || ''}
                      onChangeText={(value) => updateItineraryStop(stop.id, { location: value })}
                      placeholder="Specific area, terminal, hotel, park, or neighborhood (optional)"
                      editable={!isLoading}
                    />
                    <View style={styles.timeRow}>
                      {renderItineraryTimeControl(stop, index, 'arrivalTime', 'Arrive')}
                      {renderItineraryTimeControl(stop, index, 'departureTime', 'Depart')}
                    </View>
                    <TextInput
                      style={[styles.input, styles.compactTextArea]}
                      value={stop.notes || ''}
                      onChangeText={(value) => updateItineraryStop(stop.id, { notes: value })}
                      placeholder="Notes, constraints, travel buffer, all-aboard time..."
                      multiline
                      editable={!isLoading}
                    />
                  </View>
                ))
              )}
            </View>
          )}

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
          {renderDatePicker(showStartDatePicker, startDate, startDateInput, setStartDateInput, handleStartDateChange, setShowStartDatePicker)}

          <Text style={styles.label}>End Date</Text>
          {renderDatePicker(showEndDatePicker, endDate, endDateInput, setEndDateInput, handleEndDateChange, setShowEndDatePicker, startDate)}

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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
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
  itinerarySection: {
    marginBottom: 16,
  },
  itineraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonText: {
    color: colors.textLight,
    fontWeight: '700',
  },
  stopCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stopTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  removeStopText: {
    color: colors.error,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: 6,
  },
  stopTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  stopTypeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
  },
  stopTypeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stopTypeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  stopTypeTextActive: {
    color: colors.textLight,
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  structuredField: {
    marginBottom: 16,
  },
  dateSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectShell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    height: 44,
    width: 86,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compactPicker: {
    height: 44,
    width: '100%',
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  dateSeparator: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  yearSelectShell: {
    width: 112,
  },
  timeControl: {
    flexGrow: 0,
    flexShrink: 1,
    width: 300,
    maxWidth: '100%',
  },
  timeControlHeader: {
    minHeight: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timeSelectRow: {
    flexDirection: 'row',
    gap: 6,
  },
  timeSelectShell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    height: 44,
    width: 82,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  setTimeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.background,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  setTimeButtonText: {
    color: colors.primary,
    fontWeight: '700',
  },
  clearTimeText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  compactTextArea: {
    minHeight: 70,
    textAlignVertical: 'top',
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
