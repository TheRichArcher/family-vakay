import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const interests = [
  'Relaxation',
  'Foodie',
  'Constantly active',
  'Athletic',
  'Tourist',
];

interface InterestsSurveyProps {
  onSubmit: (interests: string[]) => void;
}

const InterestsSurvey = ({ onSubmit }: InterestsSurveyProps) => {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What are your interests?</Text>
      {interests.map((interest) => (
        <TouchableOpacity
          key={interest}
          style={[
            styles.interestButton,
            selectedInterests.includes(interest) && styles.selectedInterest,
          ]}
          onPress={() => toggleInterest(interest)}
        >
          <Text>{interest}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.submitButton} onPress={() => onSubmit(selectedInterests)}>
        <Text>Get Suggestions</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  interestButton: {
    padding: 15,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 10,
    alignItems: 'center',
  },
  selectedInterest: {
    backgroundColor: 'lightblue',
  },
  submitButton: {
    backgroundColor: 'blue',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
});

export default InterestsSurvey;
