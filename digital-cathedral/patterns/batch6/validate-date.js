/**
 * isValidDate - Validates a date given year, month, and day.
 * Correctly handles leap years (divisible by 4, except centuries unless divisible by 400).
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @param {number} day - The day of the month
 * @returns {boolean} True if the date is valid
 */
function isValidDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Leap year calculation
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  if (isLeap) daysInMonth[1] = 29;

  return day <= daysInMonth[month - 1];
}

module.exports = isValidDate;
