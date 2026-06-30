import { parseISO, isValid } from 'date-fns';

export const convertFirestoreTimestampToString = (timestamp: any): string | null => {
  if (!timestamp) {
    return null;
  }
  // Check if it's a Firestore-like timestamp object (from web SDK)
  if (timestamp.seconds && typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000).toISOString().split('T')[0];
  }
  // Check for the private _seconds property (from older SDKs or serialization)
  if (timestamp._seconds && typeof timestamp._seconds === 'number') {
    return new Date(timestamp._seconds * 1000).toISOString().split('T')[0];
  }
  // If it's already a string, pass it through
  if (typeof timestamp === 'string') {
    return timestamp.split('T')[0];
  }
  // If it's a Date object, convert it
  if (timestamp instanceof Date) {
    return timestamp.toISOString().split('T')[0];
  }
  // Return null if it's an unrecognizable format
  return null;
};

export const getDateTime = (activity: { date?: string | null, time?: string | null }): Date => {
  if (!activity.date) {
    return new Date('2999-12-31');
  }

  let dateToParse = activity.date.split('T')[0]; // Ensure we only have the date part

  if (activity.time) {
    // Attempt to handle 'h:mm a' format if present
    const timeMatch = activity.time.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3];
      
      if (ampm.toLowerCase() === 'pm' && hours < 12) {
        hours += 12;
      } else if (ampm.toLowerCase() === 'am' && hours === 12) {
        hours = 0;
      }
      
      const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      dateToParse += `T${timeString}`;
    } else if (activity.time.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
      // Handle 'HH:mm' or 'HH:mm:ss'
      dateToParse += `T${activity.time}`;
    } else {
      // If time format is unknown, don't append it to avoid invalid dates
      dateToParse += `T00:00:00`;
    }
  } else {
    dateToParse += 'T00:00:00';
  }
  
  const parsedDate = parseISO(dateToParse);

  if (isValid(parsedDate)) {
    return parsedDate;
  }
  
  // Final fallback for any other invalid date format
  return new Date('2999-12-31');
}; 