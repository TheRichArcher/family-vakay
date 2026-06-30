import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { aiService } from '../services/aiService';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { KidDashboardStackParamList } from '../navigation/AppNavigator';
import { colors } from '../theme/colors';

type BedtimeStoryScreenRouteProp = RouteProp<KidDashboardStackParamList, 'BedtimeStory'>;

const questions = [
  "What was the most fun thing you did today?",
  "Who did you have the most fun with?",
  "What was the yummiest thing you ate?",
  "What do you want to dream about tonight?",
];

export default function BedtimeStoryScreen() {
  const route = useRoute<BedtimeStoryScreenRouteProp>();
  const tripId = route.params?.tripId;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [story, setStory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFinishedAnswering, setIsFinishedAnswering] = useState(false);

  const handleNextQuestion = () => {
    if (currentAnswer.trim().length === 0) {
      Alert.alert("Don't be shy!", "Please tell me a little something.");
      return;
    }

    const newAnswers = [...answers, currentAnswer];
    setAnswers(newAnswers);
    setCurrentAnswer('');

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setIsFinishedAnswering(true);
      handleGenerateStory(newAnswers);
    }
  };

  const handleGenerateStory = async (finalAnswers: string[]) => {
    setIsLoading(true);
    setStory('');
    
    // Create a story prompt from the answers
    const keywords = [
      `The hero of the story did something fun: ${finalAnswers[0]}.`,
      `They were with their friend: ${finalAnswers[1]}.`,
      `They ate something yummy: ${finalAnswers[2]}.`,
      `Tonight, they will dream of: ${finalAnswers[3]}.`,
    ];

    try {
      if (!tripId) {
        Alert.alert("Error", "Could not create a story without a trip selected.");
        setIsLoading(false);
        return;
      }
      const response = await aiService.createStory(keywords, tripId);
      setStory(response.text);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "We couldn't write a story right now. Please try again.";
      Alert.alert("Story Time Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleReset = () => {
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setCurrentAnswer('');
    setStory('');
    setIsLoading(false);
    setIsFinishedAnswering(false);
  };

  if (!tripId) {
    return (
        <View style={styles.container}>
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Trip information is missing. Please go back and try again.</Text>
            </View>
        </View>
    )
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text style={styles.loadingText}>Your amazing story is being written...</Text>
        </View>
      );
    }

    if (story) {
      return (
        <>
          <View style={styles.storyContainer}>
            <Text style={styles.storyText}>{story}</Text>
          </View>
          <TouchableOpacity style={styles.generateButton} onPress={handleReset}>
            <Text style={styles.generateButtonText}>✨ Start a New Story</Text>
          </TouchableOpacity>
        </>
      );
    }
    
    return (
      <>
        <Text style={styles.questionText}>{questions[currentQuestionIndex]}</Text>
        <TextInput
          style={styles.input}
          value={currentAnswer}
          onChangeText={setCurrentAnswer}
          placeholder="Tell me all about it..."
          placeholderTextColor="#888"
        />
        <TouchableOpacity style={styles.generateButton} onPress={handleNextQuestion}>
          <Text style={styles.generateButtonText}>
            {currentQuestionIndex < questions.length - 1 ? "Next Question" : "Write My Story!"}
          </Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
            <Ionicons name="moon" size={50} color={colors.accent} />
            <Text style={styles.title}>Bedtime Story Creator</Text>
            <Text style={styles.subtitle}>{!isFinishedAnswering ? "First, answer a few questions..." : "Once upon a time..."}</Text>
        </View>
        {renderContent()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a23',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    marginTop: 5,
    textAlign: 'center',
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#eee',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#1c1c3c',
    color: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3c3c5c',
    width: '100%',
    marginBottom: 20,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  generateButton: {
    backgroundColor: colors.secondary,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    width: '80%',
    marginTop: 10,
    marginBottom: 20,
  },
  generateButtonText: {
    color: colors.textLight,
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 18,
    color: '#aaa',
    marginTop: 20,
  },
  storyContainer: {
    marginTop: 20,
    backgroundColor: '#1c1c3c',
    borderRadius: 15,
    padding: 20,
    width: '100%',
  },
  storyText: {
    color: '#eee',
    fontSize: 17,
    lineHeight: 25,
  },
}); 