import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AccessibleModal } from './AccessibleModal';
import { colors } from '../theme/colors';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ visible, title, message, onCancel, onConfirm }: ConfirmModalProps) {
  return (
    <AccessibleModal
      visible={visible}
      onClose={onCancel}
    >
      <View style={styles.modalView}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalMessage}>{message}</Text>
        <View style={styles.buttonContainer}>
          <Pressable
            style={[styles.button, styles.buttonCancel]}
            onPress={onCancel}
          >
            <Text style={styles.textStyle}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.buttonConfirm]}
            onPress={onConfirm}
          >
            <Text style={styles.textStyle}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </AccessibleModal>
  );
}

const styles = StyleSheet.create({
  modalView: {
    margin: 20,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalMessage: {
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    borderRadius: 8,
    padding: 10,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
  },
  buttonCancel: {
    backgroundColor: colors.muted,
  },
  buttonConfirm: {
    backgroundColor: colors.error,
  },
  textStyle: {
    color: colors.textLight,
    fontWeight: 'bold',
    textAlign: 'center',
  },
}); 