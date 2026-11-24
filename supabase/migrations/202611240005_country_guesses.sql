-- Natural Earth 1:50m Admin 0 ADM0_A3 codes, shared with src/countries.json.
create function public.whirl_country_code(code text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(code in (
  'ABW','AFG','AGO','AIA','ALB','ALD','AND','ARE','ARG','ARM','ASM','ATA','ATC','ATF','ATG','AUS','AUT','AZE','BDI','BEL',
  'BEN','BFA','BGD','BGR','BHR','BHS','BIH','BLM','BLR','BLZ','BMU','BOL','BRA','BRB','BRN','BTN','BWA','CAF','CAN','CHE',
  'CHL','CHN','CIV','CMR','COD','COG','COK','COL','COM','CPV','CRI','CUB','CUW','CYM','CYN','CYP','CZE','DEU','DJI','DMA',
  'DNK','DOM','DZA','ECU','EGY','ERI','ESP','EST','ETH','FIN','FJI','FLK','FRA','FRO','FSM','GAB','GBR','GEO','GGY','GHA',
  'GIN','GMB','GNB','GNQ','GRC','GRD','GRL','GTM','GUM','GUY','HKG','HMD','HND','HRV','HTI','HUN','IDN','IMN','IND','IOA',
  'IOT','IRL','IRN','IRQ','ISL','ISR','ITA','JAM','JEY','JOR','JPN','KAS','KAZ','KEN','KGZ','KHM','KIR','KNA','KOR','KOS',
  'KWT','LAO','LBN','LBR','LBY','LCA','LIE','LKA','LSO','LTU','LUX','LVA','MAC','MAF','MAR','MCO','MDA','MDG','MDV','MEX',
  'MHL','MKD','MLI','MLT','MMR','MNE','MNG','MNP','MOZ','MRT','MSR','MUS','MWI','MYS','NAM','NCL','NER','NFK','NGA','NIC',
  'NIU','NLD','NOR','NPL','NRU','NZL','OMN','PAK','PAN','PCN','PER','PHL','PLW','PNG','POL','PRI','PRK','PRT','PRY','PSX',
  'PYF','QAT','ROU','RUS','RWA','SAH','SAU','SDN','SDS','SEN','SGP','SGS','SHN','SLB','SLE','SLV','SMR','SOL','SOM','SPM',
  'SRB','STP','SUR','SVK','SVN','SWE','SWZ','SXM','SYC','SYR','TCA','TCD','TGO','THA','TJK','TKM','TLS','TON','TTO','TUN',
  'TUR','TUV','TWN','TZA','UGA','UKR','URY','USA','UZB','VAT','VCT','VEN','VGB','VIR','VNM','VUT','WLF','WSM','YEM','ZAF',
  'ZMB','ZWE'
 ), false)
$$;

alter function public.whirl_score(text,jsonb,jsonb,int) rename to whirl_score_standard;
create function public.whirl_score(kind text,sol jsonb,a jsonb,reveal_count int) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if kind='where' and sol ? 'country' then
  if jsonb_typeof(a->'country') is distinct from 'string' or not public.whirl_country_code(a->>'country') then
   raise exception 'Select a valid country';
  end if;
  return jsonb_build_object('score',case when a->>'country'=sol->>'country' then 1000 else 0 end,'solution',sol);
 end if;
 return public.whirl_score_standard(kind,sol,a,reveal_count);
end; $$;

alter function public.whirl_validate(text,jsonb,jsonb,text,text,text) rename to whirl_validate_standard;
create function public.whirl_validate(kind text,p jsonb,s jsonb,explanation text,url text,title text)
returns text[] language plpgsql immutable set search_path='' as $$
declare errors text[];
begin
 if p->>'mechanic' is distinct from 'country' then
  errors=public.whirl_validate_standard(kind,p,s,explanation,url,title);
  if kind='where' and s ? 'country' then
   errors=array_append(errors,'Use the country map answer type for a country target.');
  end if;
  return errors;
 end if;
 -- The internal country kind runs the standard checks for all question types.
 errors=public.whirl_validate_standard('country',p,s,explanation,url,title);
 if kind is distinct from 'where' then
  errors=array_append(errors,'Country selection is available for WHERE.');
 end if;
 if jsonb_typeof(s->'country') is distinct from 'string' or not public.whirl_country_code(s->>'country') then
  errors=array_append(errors,'Choose a valid target country.');
 end if;
 if s ?| array['lat','lng','scale','polygon'] or p ? 'country' then
  errors=array_append(errors,'Store the country target only in the private solution.');
 end if;
 return errors;
end; $$;

revoke all on function public.whirl_country_code(text),public.whirl_score(text,jsonb,jsonb,int),
 public.whirl_validate(text,jsonb,jsonb,text,text,text) from public,anon,authenticated;

with topic as (
 insert into public.topics(slug,title,subject)
 values ('wild-giant-panda-range','Wild giant pandas','Animals')
 returning id
)
insert into public.questions(topic_id,kind,prompt,presentation,solution,explanation,source_title,source_url,status,verified_at)
select id,'where','Which country is home to wild giant pandas?',
 '{"mechanic":"country"}','{"country":"CHN","label":"China"}',
 'Wild giant pandas live in mountain forests in central China, mainly in Sichuan, Shaanxi, and Gansu.',
 'Smithsonian National Zoo: Giant panda','https://nationalzoo.si.edu/animals/giant-panda','published',
 '2026-11-24T00:00:00Z'::timestamptz
from topic;
