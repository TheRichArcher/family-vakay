import React, { useEffect, useRef } from 'react';
import { Modal, View, StyleSheet, Pressable, Platform } from 'react-native';
import { colors } from '../theme/colors';

interface AccessibleModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function AccessibleModal({ visible, onClose, children }: AccessibleModalProps) {
  const modalContentRef = useRef<View>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) {
      return;
    }

    triggerElementRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const content = modalContentRef.current as any;
      if (!content) return;

      const focusableElements = content.querySelectorAll(
        'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerElementRef.current?.focus();
    };
  }, [visible]);

  const onShow = () => {
    if (Platform.OS === 'web' && modalContentRef.current) {
      const content = modalContentRef.current as any;
      const focusableElements = content.querySelectorAll(
        'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  };

  return (
    <Modal
      accessible={visible}
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      onShow={onShow}
    >
      <Pressable onPress={onClose} style={styles.centeredView}>
        <Pressable 
            onPress={(e) => e.stopPropagation()} 
            style={styles.modalView}
            ref={modalContentRef}
            aria-modal={true}
            role="dialog"
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
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
  },
}); 