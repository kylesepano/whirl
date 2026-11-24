import type { ComponentProps } from 'react'
import countries from './countries.json'

export const countriesByCode = new Map(countries.map((country) => [country.code, country]))

export function CountrySelect(props: ComponentProps<'select'>) {
  return (
    <select {...props}>
      <option value="">Select a country</option>
      {countries.map(({ code, name }) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  )
}
