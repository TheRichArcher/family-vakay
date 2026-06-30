export const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (error && error.code) {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please try again.';
      case 'auth/email-already-in-use':
        return 'This email address is already in use by another account.';
      case 'auth/weak-password':
        return 'Your password is too weak. Please choose a stronger one.';
      default:
        return error.message || 'An unexpected error occurred. Please try again.';
    }
  }

  if (error && error.message) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}; 