export const DAYS_PER_YEAR = 365
export const SECS_PER_DAY = 86400
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12

export function getFormattedStringFromDays(numberOfDays) {
  const years = Math.floor(numberOfDays / DAYS_PER_YEAR)
  const months = Math.floor((numberOfDays % DAYS_PER_YEAR) / DAYS_PER_MONTH)
  const days = Math.floor((numberOfDays % DAYS_PER_YEAR) % DAYS_PER_MONTH)

  const yearsDisplay =
    years > 0 ? years + (years == 1 ? ' year ' : ' years ') : ''
  const monthsDisplay =
    months > 0 ? months + (months == 1 ? ' month ' : ' months ') : ''
  const daysDisplay = days > 0 ? days + (days == 1 ? ' day' : ' days') : ''
  return yearsDisplay + monthsDisplay + daysDisplay
}

export const yearToDays = (val) => {
  return DAYS_PER_YEAR * val
}
export const daysToYear = (val) => {
  return val / DAYS_PER_YEAR
}
export const yearToSecs = (val) => {
  return DAYS_PER_YEAR * val * SECS_PER_DAY
}

export const secsToDays = (val) => {
  return val / SECS_PER_DAY
}
