import { yearLabel } from './api'
const msPerDay = 86_400_000
function newDate(year: number, month: number, day: number) {
  const result = new Date(0)
  result.setUTCFullYear(year, month - 1, day)
  return result
}
export function parseHistoricalDate(text: string) {
  const match = /^(\d{1,6})-(\d{2})-(\d{2})(?:\s+(BCE|CE))?$/i.exec(text.trim())
  if (!match) return null
  const [, year, month, day, era] = match
  if (+year < 1 || +year > 100000) return null
  const astronomical = era?.toUpperCase() === 'BCE' ? 1 - +year : +year
  const result = newDate(astronomical, +month, +day)
  if (
    result.getUTCFullYear() !== astronomical ||
    result.getUTCMonth() + 1 !== +month ||
    result.getUTCDate() !== +day
  )
    return null
  const start = newDate(astronomical, 1, 1).getTime(),
    end = newDate(astronomical + 1, 1, 1).getTime()
  return astronomical + (result.getTime() - start) / (end - start)
}
export function formatHistoricalDate(value: number) {
  const year = Math.floor(value)
  const start = newDate(year, 1, 1).getTime(),
    end = newDate(year + 1, 1, 1).getTime()
  const day = Math.min(
    Math.round((end - start) / msPerDay) - 1,
    Math.round(((value - year) * (end - start)) / msPerDay),
  )
  const date = new Date(start + day * msPerDay)
  return (
    date.toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }) +
    ', ' +
    yearLabel(year)
  )
}
