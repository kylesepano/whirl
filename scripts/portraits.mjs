function licensed(person) {
  return Boolean(
    person?.subject &&
      person.image &&
      person.url?.startsWith('https://') &&
      person.artist &&
      person.license &&
      person.medium,
  )
}
function similarity(target, person) {
  const weight = (field, points) =>
    target[field] && target[field] === person[field] ? points : 0
  const age =
    Number.isFinite(target.birth) && Number.isFinite(person.birth)
      ? Math.abs(target.birth - person.birth)
      : 100
  return (
    weight('occupation', 60) +
    weight('period', 35) +
    weight('region', 10) +
    weight('field', 20) +
    Math.max(0, 30 - age)
  )
}
export function selectPortraits(target, pool) {
  if (!licensed(target)) return []
  const choices = [target]
  const seenImages = new Set([target.image]),
    seenPeople = new Set([target.wikidata || target.subject])
  const ranked = pool
    .filter(
      (p) =>
        licensed(p) &&
        p.medium === target.medium &&
        similarity(target, p) >= 45,
    )
    .sort((a, b) => similarity(target, b) - similarity(target, a))
  for (const p of ranked) {
    const id = p.wikidata || p.subject
    if (seenImages.has(p.image) || seenPeople.has(id)) continue
    choices.push(p)
    seenImages.add(p.image)
    seenPeople.add(id)
    if (choices.length === 4) return choices
  }
  return []
}
