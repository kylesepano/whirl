"""Build the bulk question migration from cached, publicly sourced fact records."""

import argparse
import concurrent.futures
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.whirl/catalog'
PREFIXES = '''
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
'''
WIKIDATA = 'https://qlever.dev/api/wikidata'
NE_PLACES = ('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
             'v5.1.2/geojson/ne_10m_populated_places_simple.geojson')

# The subject, relation, minimum number of Wikipedia links, and query limit.
# Query several possible answers so the compiler can reject ambiguous records.
QUERIES = {
    'film': ('?item wdt:P31 wd:Q11424', 'P57', 'P577', 10, 4000),
    'books': ('?item wdt:P31 ?class . VALUES ?class { wd:Q7725634 wd:Q8261 wd:Q47461344 }',
              'P50', None, 9, 3300),
    'album': ('?item wdt:P31 wd:Q482994', 'P175', 'P577', 8, 3300),
    'game': ('?item wdt:P31 wd:Q7889', 'P178', 'P577', 8, 3000),
    'sports-team': ('?item wdt:P31 ?class . VALUES ?class { wd:Q476028 wd:Q13393265 wd:Q12973014 }',
                    'P115', None, 8, 1900),
    'player': ('?item wdt:P106 ?class; wdt:P54 ?team . '
               'VALUES ?class { wd:Q937857 wd:Q3665646 wd:Q11774891 wd:Q12803994 }',
               'P19', None, 19, 2300),
    'battle': ('?item wdt:P31 ?class . VALUES ?class { wd:Q178561 wd:Q188055 }',
               'P585', None, 8, 2600),
    'treaty': ('?item wdt:P31 ?class . VALUES ?class { wd:Q131569 wd:Q645180 }',
               'P585', None, 6, 1600),
    'animal': ('?item wdt:P31 wd:Q16521 . FILTER EXISTS { ?item wdt:P171+ wd:Q729 }',
               'P225', None, 18, 2300),
    'art': ('?item wdt:P31 wd:Q3305213', 'P170', None, 6, 2400),
    'landmark': ('?item wdt:P31 ?class . VALUES ?class { wd:Q23413 wd:Q4989906 wd:Q1497375 wd:Q12280 }',
                 'P17', None, 9, 2500),
    'spacecraft': ('?item wdt:P31 ?class . VALUES ?class { wd:Q26529 wd:Q40218 wd:Q2133344 }',
                   'P619', None, 6, 1900),
    'scientist': ('?item wdt:P106 ?class . VALUES ?class { wd:Q169470 wd:Q593644 wd:Q170790 wd:Q864503 }',
                  'P569', None, 22, 1600),
}


def download(name, url, accept='application/json'):
    path = CACHE / name
    if path.exists():
        return
    request = urllib.request.Request(url, headers={
        'Accept': accept,
        'User-Agent': 'WHIRL-Quiz-Catalog/1.0',
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=65) as response:
                data = response.read()
            json.loads(data)
            path.write_bytes(data)
            return
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def wikidata_query(name, spec):
    where, property_id, date_property, minimum, limit = spec
    is_literal = property_id in {'P585', 'P225', 'P619', 'P569'}
    answer = 'BIND(STR(?value) AS ?answer)' if is_literal else (
        '?value rdfs:label ?answer . FILTER(LANG(?answer) = "en")'
    )
    date = f'OPTIONAL {{ ?item wdt:{date_property} ?date . }}' if date_property else ''
    query = PREFIXES + f'''
SELECT DISTINCT ?item ?name ?value ?answer ?date ?links WHERE {{
  {{ SELECT DISTINCT ?item ?links WHERE {{
    {where} .
    ?item wikibase:sitelinks ?links; wdt:{property_id} ?v .
    ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> .
    FILTER(?links >= {minimum})
  }} ORDER BY DESC(?links) ?item LIMIT {limit} }}
  ?item rdfs:label ?name; wdt:{property_id} ?value .
  FILTER(LANG(?name) = "en")
  {answer}
  {date}
}}
ORDER BY DESC(?links) ?item ?answer ?date
'''
    download('bulk-wd-' + name + '.json',
             WIKIDATA + '?' + urllib.parse.urlencode({'query': query}),
             'application/sparql-results+json')


def fetch_sources():
    CACHE.mkdir(parents=True, exist_ok=True)
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        jobs = {pool.submit(wikidata_query, name, spec): name for name, spec in QUERIES.items()}
        jobs[pool.submit(download, 'ne-places-10m.json', NE_PLACES)] = 'Natural Earth places'
        for page in range(10):
            url = f'https://api.tvmaze.com/shows?page={page}'
            jobs[pool.submit(download, f'tv{page}.json', url)] = f'TVmaze page {page}'
        for job in concurrent.futures.as_completed(jobs):
            try:
                job.result()
                print('Cached', jobs[job], flush=True)
            except Exception as error:
                failures.append(f'{jobs[job]}: {error}')
    if failures:
        raise SystemExit('Could not fetch all catalog sources:\n' + '\n'.join(failures))


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def key(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value.casefold())
                    if not unicodedata.combining(c))
    return ' '.join(re.findall(r'[^\W_]+', value))


def facts(name):
    file = CACHE / ('bulk-wd-' + name + '.json')
    grouped = {}
    for result in read_json(file)['results']['bindings']:
        row = {k: v['value'] for k, v in result.items()}
        item = row['item'].rsplit('/', 1)[-1]
        fact = grouped.setdefault(item, {
            'id': item, 'name': row['name'], 'answers': {}, 'dates': set(), 'links': int(row['links']),
        })
        fact['answers'][row['value']] = row['answer']
        if row.get('date'):
            fact['dates'].add(row['date'])
    return list(grouped.values())


def year_of(date):
    match = re.match(r'^(\d{4})-', date)
    if match and 100 <= int(match[1]) <= 2025:
        return int(match[1])
    return None


def spelling_aliases(answer):
    folded = ''.join(c for c in unicodedata.normalize('NFD', answer)
                     if not unicodedata.combining(c))
    return list(dict.fromkeys([answer, folded, answer.replace('’', "'"), folded.replace('’', "'")]))


class Catalog:
    def __init__(self):
        self.rows = []
        self.prompts = set()
        self.topics = set()
        self.countries = {row['code']: row['name'] for row in read_json(ROOT / 'src/countries.json')}
        for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            if migration.name >= '202611240006':
                break
            for line in migration.read_text(encoding='utf-8').splitlines():
                if line.lstrip().startswith('{"slug":'):
                    record = json.loads(line.strip().rstrip(','))
                    self.topics.add((record['subject'], key(record['title'])))
                    self.prompts.add(key(record['prompt']))

    def add(self, slug, title, subject, kind, prompt, presentation, solution, explanation,
            source_title, source_url, difficulty):
        title = ' '.join(title.split())
        prompt = ' '.join(prompt.split())
        topic = (subject, key(title))
        normalized_prompt = key(prompt)
        if topic in self.topics or normalized_prompt in self.prompts:
            return False
        if not (2 <= len(title) <= 165 and 8 <= len(prompt) <= 500 and len(explanation) >= 10):
            return False
        self.topics.add(topic)
        self.prompts.add(normalized_prompt)
        self.rows.append(dict(
            slug='bulk-' + slug, title=title, subject=subject, kind=kind, prompt=prompt,
            presentation=presentation, solution=solution, explanation=explanation,
            source_title=source_title, source_url=source_url, difficulty=difficulty,
        ))
        return True

    def text(self, slug, title, subject, kind, prompt, answer, explanation, source, difficulty):
        if not 1 <= len(answer) <= 180:
            return False
        return self.add(slug, title, subject, kind, prompt, {'mechanic': 'text'},
                        {'label': answer, 'aliases': spelling_aliases(answer)},
                        explanation, *source, difficulty)

    def year(self, slug, title, subject, prompt, year, explanation, source, difficulty):
        start = (year // 100) * 100 - 20
        return self.add(slug, title, subject, 'when', prompt,
                        {'min': start, 'max': start + 145, 'precision': 'year'},
                        {'label': str(year) + ' CE', 'min': year, 'max': year,
                         'precision': 'year', 'scale': 12},
                        explanation, *source, difficulty)

    def country(self, slug, title, subject, prompt, code, explanation, source, difficulty):
        return self.add(slug, title, subject, 'where', prompt, {'mechanic': 'country'},
                        {'label': self.countries[code], 'country': code},
                        explanation, *source, difficulty)


def add_wikidata(catalog):
    groups = {
        'film': ('Movie & TV series', 1100, 'who', 'Who directed the film “{name}”?', '{answer} directed the film “{name}”.'),
        'books': ('Literature', 1050, 'who', 'Who wrote “{name}”?', '“{name}” was written by {answer}.'),
        'album': ('Music', 1050, 'who', 'Which artist or group recorded the album “{name}”?', '“{name}” is credited to {answer}.'),
        'game': ('Pop culture', 680, 'who', 'Who developed the video game “{name}”?', '“{name}” was developed by {answer}.'),
        'sports-team': ('Sports', 450, 'what', 'Which home venue is associated with {name}?', 'The home venue listed for {name} is {answer}.'),
        'player': ('Sports', 570, 'what', 'What is the birthplace of the athlete {name}?', '{name} was born in {answer}.'),
        'battle': ('History', 720, 'when', 'In what year did the {name} take place?', 'The date recorded for the {name} falls in {answer}.'),
        'treaty': ('History', 220, 'when', 'What year is associated with the adoption or signing of the {name}?', 'The date recorded for the {name} falls in {answer}.'),
        'animal': ('Animals', 730, 'what', 'Which animal has the scientific name {answer}?', 'The scientific name for {name} is {answer}.'),
        'art': ('Art & Design', 520, 'who', 'Who painted “{name}”?', '“{name}” is a painting by {answer}.'),
        'landmark': ('General knowledge', 370, 'where', 'Which country is home to {name}?', '{name} is located in {answer}.'),
        'spacecraft': ('Space & Astronomy', 115, 'when', 'In what year was the spacecraft {name} launched?', '{name} was launched in {answer}.'),
        'scientist': ('Science', 340, 'when', 'In what year was the scientist {name} born?', '{name} was born in {answer}.'),
    }
    country_codes = {key(name): code for code, name in catalog.countries.items()}
    country_codes.update({
        'united states of america': 'USA', 'russian federation': 'RUS',
        'czech republic': 'CZE', 'people s republic of china': 'CHN',
    })
    # Titles that represent a corpus or unknown instead of a single credited creator.
    generic = {'anonymous', 'unknown', 'various authors', 'traditional', 'collective',
               'various artists', 'unidentified artist', 'no value'}
    for category, (subject, limit, kind, question, detail) in groups.items():
        records = facts(category)
        names = Counter(key(fact['name']) for fact in records)
        added = 0
        for record in records:
            name = record['name']
            if len(record['answers']) != 1 or names[key(name)] != 1 or not name.strip():
                continue
            answer = next(iter(record['answers'].values()))
            if key(answer) in generic or not key(answer) or key(name) == key(answer):
                continue
            if re.search(r'\b(?:disambiguation|Wikimedia|list of)\b', name, re.I):
                continue
            if category == 'album' and re.search(r'\b(?:greatest hits|the best of|anthology)\b', name, re.I):
                continue
            if category == 'animal' and not re.fullmatch(r'[A-Z][a-z]+ [a-z][a-z-]+', answer):
                continue
            if category == 'player' and key(name) in {'albert camus', 'niels bohr'}:
                continue
            # Do not publish uncertain or historical territorial claims as country picks.
            if category == 'landmark' and (
                key(answer) not in country_codes or country_codes[key(answer)] in
                {'RUS', 'UKR', 'CHN', 'TWN', 'ISR', 'PSE', 'SAH', 'SDN', 'SSD', 'KOS'}
            ):
                continue
            year = year_of(answer) if kind == 'when' else None
            if kind == 'when' and year is None:
                continue
            slug = category + '-' + record['id'].lower()
            source = ('Wikidata: ' + name,
                      f"https://www.wikidata.org/wiki/{record['id']}#{QUERIES[category][1]}")
            difficulty = 'standard' if record['links'] >= 30 else 'hard'
            display = str(year) if year else answer
            prompt = question.format(name=name, answer=display).replace('the The ', 'The ')
            explanation = detail.format(name=name, answer=display).replace('the The ', 'The ')
            if category == 'animal':
                success = catalog.text(slug, name, subject, kind, prompt, name, explanation, source, difficulty)
            elif kind == 'when':
                success = catalog.year(slug, name, subject, prompt, year, explanation, source, difficulty)
            elif kind == 'where':
                code = country_codes[key(answer)]
                success = catalog.country(slug, name, subject, prompt, code, explanation, source, difficulty)
            else:
                success = catalog.text(slug, name, subject, kind, prompt, answer, explanation, source, difficulty)
            added += success
            if added >= limit:
                break
        print(category, added)


def add_geography(catalog, limit=900):
    source = ('Natural Earth: 1:10m populated places',
              'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/')
    features = read_json(CACHE / 'ne-places-10m.json')['features']
    names = Counter(key(feature['properties']['name'] or '') for feature in features)
    counts = Counter()
    added = 0
    for feature in sorted(features, key=lambda f: -f['properties']['pop_max']):
        p = feature['properties']
        name, code = p['name'], p['adm0_a3']
        if not name or code not in catalog.countries or names[key(name)] != 1:
            continue
        if code in {'RUS', 'UKR', 'ISR', 'PSE', 'SAH', 'SDN', 'SSD', 'KOS', 'TWN'}:
            continue
        if counts[code] >= 40 or p['pop_max'] < 22000:
            continue
        country = catalog.countries[code]
        place = f'{name}, {country}'
        explanation = f'Natural Earth places {name} in {country}.'
        slug = 'place-' + str(p['ne_id'])
        difficulty = 'standard' if p['pop_max'] >= 700000 else 'hard'
        if p['ne_id'] % 3 != 0:
            success = catalog.country(slug, place, 'Geography', f'Which country contains the city or town of {name}?',
                                      code, explanation, source, difficulty)
        else:
            lng, lat = feature['geometry']['coordinates']
            success = catalog.add(slug, place, 'Geography', 'where', f'Pin {place} on the map.', {},
                                  {'label': place, 'lat': round(lat, 5), 'lng': round(lng, 5), 'scale': 400},
                                  explanation, *source, difficulty)
        if success:
            counts[code] += 1
            added += 1
            if added >= limit:
                break
    print('geography', added)
    add_city_orders(catalog, features, source)


def add_city_orders(catalog, features, source):
    cities = defaultdict(list)
    for feature in sorted(features, key=lambda f: -f['properties']['pop_max']):
        props = feature['properties']
        code, name = props['adm0_a3'], props['name']
        if code not in catalog.countries or not name or props['pop_max'] < 90000:
            continue
        if code in {'RUS', 'UKR', 'ISR', 'PSE', 'SAH', 'SDN', 'SSD', 'KOS', 'TWN'}:
            continue
        lat = feature['geometry']['coordinates'][1]
        if all(abs(lat - other_lat) >= 0.35 and key(name) != key(other_name)
               for other_lat, other_name in cities[code]):
            cities[code].append((lat, name))
    added = 0
    for code, places in sorted(cities.items()):
        if len(places) < 4:
            continue
        country = catalog.countries[code]
        ordered = [name for _, name in sorted(places[:4], reverse=True)]
        cards = [{'id': f'city-{i}', 'label': name} for i, name in enumerate(ordered, 1)]
        sequence = ' → '.join(ordered)
        added += catalog.add(
            'north-south-' + code.lower(), f'{country} from north to south', 'Geography', 'how',
            f'Arrange these cities in {country} from north to south.',
            {'options': cards}, {'label': sequence, 'correct': [card['id'] for card in cards]},
            f'At their mapped latitudes, the north-to-south order is {sequence}.', *source, 'standard',
        )
    print('geography ordering', added)


def add_tv(catalog, limit=540):
    subject = 'Movie & TV series'
    shows = [show for path in sorted(CACHE.glob('tv*.json')) for show in read_json(path)]
    names = Counter(key(show['name']) for show in shows)
    added = 0
    for show in sorted(shows, key=lambda row: (-row['weight'], row['id'])):
        name = show['name']
        year = year_of(show.get('premiered') or '')
        if year is None or not show.get('url', '').startswith('https://www.tvmaze.com/'):
            continue
        if names[key(name)] != 1 or len(name) > 140 or not show['genres']:
            continue
        source = ('TVmaze: ' + name + ' (CC BY-SA)', show['url'])
        if catalog.year('tv-' + str(show['id']), name, subject, f'In what year did the TV series “{name}” premiere?',
                        year, f'TVmaze lists the premiere of “{name}” in {year}.', source,
                        'standard' if (show['rating']['average'] or 0) >= 7 else 'hard'):
            added += 1
            if added >= limit:
                break
    print('television', added)


def write_migration(catalog):
    if len(catalog.rows) < 8700:
        raise SystemExit(f'Expected at least 8,700 new questions, generated {len(catalog.rows):,}')
    rows = sorted(catalog.rows, key=lambda row: row['slug'])
    assert len({row['slug'] for row in rows}) == len(rows)
    path = ROOT / 'supabase/migrations/202611240006_10000_question_bank.sql'
    with path.open('w', encoding='utf-8', newline='\n') as file:
        file.write('''-- Generated from source records by scripts/catalog-expansion.py.
with catalog as materialized (
 select * from jsonb_to_recordset($whirl_bank$
[
''')
        file.write(',\n'.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in rows))
        file.write('''
]
$whirl_bank$::jsonb) as c(
  slug text,title text,subject text,kind text,prompt text,presentation jsonb,
  solution jsonb,explanation text,source_title text,source_url text,difficulty text
 )
), fresh as materialized (
 select c.* from catalog c
 where not exists(select 1 from public.questions q where lower(trim(q.prompt))=lower(trim(c.prompt)))
), inserted_topics as (
 insert into public.topics(slug,title,subject)
 select slug,title,subject from fresh on conflict(slug) do nothing returning id,slug
), topic_ids as (
 select id,slug from inserted_topics
 union all
 select t.id,t.slug from public.topics t join fresh c on c.slug=t.slug
)
insert into public.questions(topic_id,kind,prompt,presentation,solution,explanation,source_title,source_url,difficulty,status,verified_at)
select t.id,c.kind,c.prompt,c.presentation,c.solution,c.explanation,c.source_title,c.source_url,c.difficulty,
 case when cardinality(public.whirl_validate(c.kind,c.presentation,c.solution,c.explanation,c.source_url,c.source_title))=0
      then 'published' else 'invalid catalog row' end,
 '2026-11-24T00:00:00Z'::timestamptz
from fresh c join topic_ids t on t.slug=c.slug
on conflict do nothing;
''')
    print('Total new questions:', len(rows))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true', help='Download missing source snapshots')
    parser.add_argument('--write', action='store_true', help='Compile the cached sources into the migration')
    args = parser.parse_args()
    if args.fetch:
        fetch_sources()
    if args.write:
        catalog = Catalog()
        add_wikidata(catalog)
        add_geography(catalog)
        add_tv(catalog)
        write_migration(catalog)
