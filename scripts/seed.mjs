import { writeFile } from 'node:fs/promises'
import { selectPortraits } from './portraits.mjs'
const apollo = 'https://www.nasa.gov/mission/apollo-11/'
const nasaDates =
  'https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo11info.html'
const eagle =
  'https://nssdc.gsfc.nasa.gov/imgcat/html/object_page/a11_h_44_6642.html'
const drops = 'https://www.weather.gov/fgz/Rainbow'
const water = 'https://water.usgs.gov/edu/watercycle-kids-beg.html'
const topics = new Map()
const variants = []
const topic = (slug, title, subject) => {
  topics.set(slug, { title, subject })
  return slug
}
const add = (
  slug,
  kind,
  prompt,
  presentation,
  solution,
  explanation,
  source_title,
  source_url,
  difficulty = 'standard',
) =>
  variants.push({
    slug,
    kind,
    prompt,
    presentation,
    solution,
    explanation,
    source_title,
    source_url,
    difficulty,
  })
const cards = (labels) =>
  labels.map((label, i) => ({ id: 'option-' + (i + 1), label }))
const year = (slug, prompt, y, min, max, scale, explanation, title, url) =>
  add(
    slug,
    'when',
    prompt,
    { min, max, precision: 'year' },
    {
      min: y,
      max: y,
      precision: 'year',
      scale,
      label: y > 0 ? y + ' CE' : 1 - y + ' BCE',
    },
    explanation,
    title,
    url,
  )
const place = (slug, prompt, label, lat, lng, scale, explanation, title, url) =>
  add(
    slug,
    'where',
    prompt,
    {},
    { lat, lng, scale, label },
    explanation,
    title,
    url,
  )
const order = (slug, prompt, labels, result, explanation, title, url) => {
  const options = cards(labels)
  add(
    slug,
    'how',
    prompt,
    { options },
    { correct: options.map((o) => o.id), label: result },
    explanation,
    title,
    url,
  )
}
const evidence = (slug, prompt, labels, n, result, explanation, title, url) => {
  const options = cards(labels)
  add(
    slug,
    'why',
    prompt,
    { mechanic: 'evidence', options },
    {
      mechanic: 'evidence',
      correct: options.slice(0, n).map((o) => o.id),
      label: result,
    },
    explanation,
    title,
    url,
  )
}
const flight = topic('apollo-11', 'Apollo 11', 'Technology & inventions')
const people = [
  [
    'Neil Armstrong',
    '4f0bd2',
    'https://images.nasa.gov/details/S69-31741',
    'Q1615',
    1930,
    2012,
  ],
  [
    'Buzz Aldrin',
    '8c81ee',
    'https://images.nasa.gov/details/S69-31743',
    'Q2252',
    1930,
    null,
  ],
  [
    'Michael Collins',
    '0ab599',
    'https://images.nasa.gov/details/S69-31742',
    'Q104859',
    1930,
    2021,
  ],
  [
    'Jim Lovell',
    'bdc394',
    'https://www.nasa.gov/former-astronaut-james-a-lovell/',
    'Q111240',
    1928,
    2025,
  ],
]
const pool = people.map(([subject, file, url, wikidata, birth, death], i) => ({
  id: 'portrait-' + i,
  subject,
  image: '/media/' + file + '.jpg',
  license: 'Public domain (NASA)',
  artist: 'NASA',
  medium: 'photograph',
  url,
  occupation: 'astronaut',
  period: 'Apollo program',
  region: 'United States',
  birth,
  death,
  wikidata,
  field: 'Human spaceflight',
}))
const portraits = selectPortraits(pool[0], pool)
if (portraits.length !== 4)
  throw new Error('The WHO seed needs four compatible portraits.')
add(
  flight,
  'who',
  'Which Apollo astronaut was the first person to walk on the Moon?',
  { options: portraits.map(({ id, image }) => ({ id, image })) },
  { correct: portraits[0].id, label: portraits[0].subject, credits: portraits },
  'Neil Armstrong stepped onto the lunar surface first. Buzz Aldrin joined him there while Michael Collins remained in lunar orbit.',
  'Apollo 11 mission',
  apollo,
  'easy',
)
place(
  flight,
  'Where on Earth did Apollo 11 lift off from Launch Pad 39A?',
  'Kennedy Space Center, Florida',
  28.608422,
  -80.604133,
  780,
  'Apollo 11 launched from the Kennedy Space Center on the Atlantic coast of Florida.',
  'Apollo by the Numbers',
  'https://www.nasa.gov/wp-content/uploads/2023/04/sp-4029.pdf',
)
year(
  flight,
  'In which year did the first crewed Moon landing take place?',
  1969,
  1900,
  2020,
  14,
  'The Apollo 11 lunar module landed in the Sea of Tranquility on July 20, 1969.',
  'Apollo 11 mission data',
  nasaDates,
)
add(
  flight,
  'what',
  'Which spacecraft is shown in this photograph?',
  {
    options: cards([
      'Eagle ascent stage',
      'Columbia command module',
      'Sputnik 1',
      'Voyager 1',
    ]),
    images: ['87af12', '3a7c50', '1e94b9', '62bef1'].map(
      (id) => '/media/' + id + '.jpg',
    ),
  },
  {
    correct: 'option-1',
    label: 'Eagle ascent stage',
    credits: [
      {
        license: 'Public domain (NASA)',
        artist: 'Michael Collins / NASA',
        url: eagle,
      },
    ],
  },
  'Michael Collins photographed the upper stage of Eagle as it returned from the lunar surface to dock with Columbia.',
  'Apollo 11 photo AS11-44-6642',
  eagle,
)
order(
  flight,
  'Put these Apollo 11 milestones in chronological order.',
  [
    'Launch from Florida',
    'Land in the Sea of Tranquility',
    'Dock Eagle ascent stage with Columbia',
    'Splash down on Earth',
  ],
  'From launch to splashdown',
  'The crew reached lunar orbit before descending in Eagle. After the Moon walk, Eagle’s ascent stage took Armstrong and Aldrin back to Columbia for the journey home.',
  'Apollo 11 mission overview',
  apollo,
)
const rainbow = topic('rainbow', 'Primary rainbows', 'Science')
evidence(
  rainbow,
  'Choose the events that move sunlight through a raindrop to form a primary rainbow.',
  [
    'Sunlight bends when it enters a droplet.',
    'Light reflects from the inside back surface.',
    'Light bends again as it exits.',
    'Wind changes the wavelength of the light.',
    'The droplet emits its own visible light.',
  ],
  3,
  'Refraction, internal reflection, then refraction',
  'Light changes direction at each air–water boundary. Wavelengths bend by different amounts, which helps separate the colors.',
  'How Do Rainbows Form?',
  drops,
)
const cycle = topic('water-cycle', 'Water cycle', 'Nature & biology')
order(
  cycle,
  'Follow water from the ocean through a cloud and back to a river.',
  [
    'Ocean water evaporates',
    'Water vapor condenses into cloud droplets',
    'Rain falls to the ground',
    'Runoff enters a river',
  ],
  'Evaporation, condensation, precipitation, runoff',
  'This is one possible route in the water cycle. Water may also soak into the ground or remain stored in snow and ice.',
  'USGS Water Science School',
  water,
)
add(
  cycle,
  'why',
  'Match each water-cycle observation with the process that explains it.',
  {
    mechanic: 'matching',
    pairs: cards([
      'A puddle shrinks on a warm day',
      'A cloud forms as moist air cools',
      'Water flows downhill after rain',
    ]),
    matches: [
      { id: 'run', label: 'Surface runoff' },
      { id: 'evap', label: 'Evaporation' },
      { id: 'cond', label: 'Condensation' },
    ],
  },
  {
    mechanic: 'matching',
    correct: { 'option-1': 'evap', 'option-2': 'cond', 'option-3': 'run' },
    label: 'Evaporation, condensation, and runoff',
  },
  'Liquid water can become vapor by evaporation. Cooling turns some vapor back into droplets. Water that does not soak in can move over the surface.',
  'USGS Water Science School',
  water,
)
const wright = topic('wright-flyer', 'Wright Flyer', 'Technology & inventions')
year(
  wright,
  'In what year did the Wright Flyer make its first powered flight?',
  1903,
  1820,
  1960,
  17,
  'The Wright brothers first flew the 1903 Flyer at Kitty Hawk on December 17. Orville piloted the first flight of the day.',
  'Smithsonian National Air and Space Museum',
  'https://www.si.edu/object/1903-wrightflyer%3Anasm_A19610048000',
)
const machu = topic('machu-picchu', 'Machu Picchu', 'Geography')
place(
  machu,
  'Pin the historic sanctuary of Machu Picchu.',
  'Machu Picchu, Peru',
  -13.184934,
  -72.533443,
  780,
  'The Inca sanctuary lies in the Peruvian Andes above the Urubamba River.',
  'UNESCO World Heritage coordinates',
  'https://whc.unesco.org/en/list/274/maps/',
)
const taj = topic('taj-mahal', 'Taj Mahal', 'Arts & culture')
place(
  taj,
  'Pin the city landmark where the Taj Mahal stands.',
  'Agra, India',
  27.1748,
  78.0421,
  850,
  'Shah Jahan commissioned the mausoleum in Agra in memory of Mumtaz Mahal.',
  'UNESCO World Heritage listing',
  'https://whc.unesco.org/en/list/252/',
)
const petra = topic('petra', 'Petra', 'Arts & culture')
place(
  petra,
  'Locate the ancient Nabataean city of Petra.',
  'Petra, Jordan',
  30.3286,
  35.4419,
  620,
  'The site lies in southern Jordan between the Dead Sea and the Red Sea.',
  'UNESCO World Heritage listing',
  'https://whc.unesco.org/en/list/326/',
)
const darwin = topic(
  'origin-of-species',
  'On the Origin of Species',
  'Nature & biology',
)
year(
  darwin,
  'When was the first edition of On the Origin of Species published?',
  1859,
  1740,
  1980,
  20,
  'John Murray published the first edition of Charles Darwin’s book in London in 1859.',
  'Darwin Online first edition',
  'https://darwin-online.org.uk/converted/published/1859_Origin_F373/1859_Origin_F373.html',
)
const sputnik = topic('sputnik-1', 'Sputnik 1', 'Technology & inventions')
year(
  sputnik,
  'When did Sputnik 1 become the first artificial satellite to orbit Earth?',
  1957,
  1880,
  2020,
  13,
  'The Soviet Union launched Sputnik 1 on October 4, 1957.',
  'NASA history of Sputnik',
  'https://www.nasa.gov/history/sputnik-and-the-dawn-of-the-space-age/',
)
const a8 = topic('apollo-8', 'Apollo 8', 'History')
year(
  a8,
  'When did Apollo 8 carry its crew into lunar orbit?',
  1968,
  1900,
  2020,
  12,
  'Frank Borman, Jim Lovell, and Bill Anders became the first crew to orbit the Moon in December 1968.',
  'NASA Apollo 8 mission',
  'https://www.nasa.gov/mission/apollo-8/',
)
const web = topic('world-wide-web', 'World Wide Web', 'Technology & inventions')
year(
  web,
  'In what year did Tim Berners-Lee write his first proposal for the World Wide Web at CERN?',
  1989,
  1920,
  2025,
  14,
  'Berners-Lee wrote his first proposal in March 1989 while working at CERN.',
  'CERN, The birth of the Web',
  'https://home.cern/science/computing/birth-web',
)
const declaration = topic(
  'us-declaration',
  'Declaration of Independence',
  'Civics & world knowledge',
)
year(
  declaration,
  'In what year did the Continental Congress adopt the United States Declaration of Independence?',
  1776,
  1660,
  1890,
  24,
  'Congress adopted the Declaration on July 4, 1776. The signing of the engrossed document happened later.',
  'National Archives, Declaration transcript',
  'https://www.archives.gov/founding-docs/declaration-transcript',
)
const congress = topic(
  'us-legislation',
  'United States federal legislation',
  'Civics & world knowledge',
)
order(
  congress,
  'Arrange this typical route for a federal bill that is signed into law.',
  [
    'Introduce the bill in one chamber',
    'The chamber passes the bill',
    'Both chambers approve identical text',
    'The President signs the bill',
  ],
  'Introduction, passage, agreement, signature',
  'Both chambers must agree on identical text before it goes to the President. A veto override is a different route to enactment.',
  'Congress.gov legislative process',
  'https://www.congress.gov/legislative-process',
)
const museum = topic(
  'constitution',
  'United States Constitution',
  'Civics & world knowledge',
)
year(
  museum,
  'In what year did delegates sign the United States Constitution in Philadelphia?',
  1787,
  1660,
  1900,
  24,
  'The convention delegates signed the Constitution on September 17, 1787. Ratification followed.',
  'National Archives Constitution',
  'https://www.archives.gov/founding-docs/constitution',
)
const a13 = topic('apollo-13', 'Apollo 13', 'History')
year(
  a13,
  'In what year did the Apollo 13 mission launch?',
  1970,
  1900,
  2020,
  12,
  'Apollo 13 launched in April 1970. After an oxygen tank exploded the crew returned safely without landing on the Moon.',
  'NASA Apollo 13 mission',
  'https://www.nasa.gov/mission/apollo-13/',
)
const pyramid = topic('giza', 'Giza pyramid complex', 'History')
place(
  pyramid,
  'Pin the pyramid complex that includes the Great Pyramid of Khufu.',
  'Giza, Egypt',
  29.9792,
  31.1342,
  850,
  'The Great Pyramid is part of the ancient Memphite necropolis on the Giza Plateau.',
  'UNESCO Memphis and its Necropolis',
  'https://whc.unesco.org/en/list/86/',
)
const strings = (x) => "'" + String(x).replaceAll("'", "''") + "'"
const j = (x) => strings(JSON.stringify(x)) + '::jsonb'
const sql = [
  '-- Generated by node scripts/seed.mjs. Reapply safely without overwriting reviewed content.',
]
for (const [slug, { title, subject }] of topics)
  sql.push(
    'insert into public.topics(slug,title,subject) values(' +
      [slug, title, subject].map(strings).join(',') +
      ') on conflict(slug) do nothing;',
  )
for (const q of variants)
  sql.push(
    'insert into public.questions(topic_id,kind,prompt,difficulty,presentation,solution,explanation,source_title,source_url,status,verified_at) select id,' +
      [q.kind, q.prompt, q.difficulty]
        .map(strings)
        .concat(
          [j(q.presentation), j(q.solution)],
          [q.explanation, q.source_title, q.source_url, 'published'].map(
            strings,
          ),
          ["'2026-11-23T00:00:00Z'::timestamptz"],
        )
        .join(',') +
      ' from public.topics where slug=' +
      strings(q.slug) +
      ' on conflict do nothing;',
  )
sql.push(`insert into public.courses(id,title,description,subject,published) values('00000000-0000-4000-8000-000000000011','Road to the Moon','Follow Apollo 11 from the Florida launch pad to the Sea of Tranquility and back.','Space exploration',true) on conflict do nothing;
insert into public.lessons(course_id,title,body,position) values
('00000000-0000-4000-8000-000000000011','Meet the crew','Neil Armstrong commanded Apollo 11. Michael Collins piloted the command module Columbia. Buzz Aldrin piloted the lunar module Eagle, which took him and Armstrong to the surface.',1),
('00000000-0000-4000-8000-000000000011','From the Moon to Earth','The ascent stage of Eagle carried Armstrong and Aldrin to lunar orbit. After docking with Columbia, the crew returned to Earth and splashed down in the Pacific.',2) on conflict do nothing;
insert into public.course_questions select '00000000-0000-4000-8000-000000000011',q.id from public.questions q join public.topics t on t.id=q.topic_id where t.slug='apollo-11' and q.status='published' on conflict do nothing;
insert into public.assessments(id,course_id,title,published) values('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','Apollo 11 mission check',true) on conflict do nothing;
insert into public.assessment_questions select '00000000-0000-4000-8000-000000000012',q.id,row_number() over(order by q.kind) from public.questions q join public.topics t on t.id=q.topic_id where t.slug='apollo-11' and q.kind in ('where','when','how') and q.status='published' on conflict do nothing;`)
await writeFile(
  new URL('../supabase/migrations/202611230004_seed.sql', import.meta.url),
  sql.join('\n') + '\n',
)
console.log(
  topics.size +
    ' verified topic bundles, ' +
    variants.length +
    ' published variants',
)
