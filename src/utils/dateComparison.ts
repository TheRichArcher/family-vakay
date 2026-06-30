
export function isDateInThePast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to the beginning of the day

  const comparisonDate = new Date(date);
  comparisonDate.setHours(0, 0, 0, 0); // Also set to the beginning of the day

  return comparisonDate < today;
} 