1)
alter table if exists complaints
add column if not exists phone_number text;

alter table if exists complaints
add column if not exists is_anonymous boolean not null default true;

alter table if exists complaints
add column if not exists victim_name text;

alter table if exists complaints
add column if not exists victim_role text;


-- If not already present in your DB
alter table if exists complaints
add column if not exists accused_name text;

-- Optional: if this was blocking inserts earlier
alter table if exists complaints
alter column incident_types drop not null;

create index if not exists idx_complaints_phone_number
on complaints(phone_number);

create index if not exists idx_complaints_phone_created_at
on complaints(phone_number, created_at desc);

create index if not exists idx_complaints_is_anonymous
on complaints(is_anonymous);

2)create table if not exists aadhaar_identity (
id uuid primary key default gen_random_uuid(),

-- Link to complaint / app user
complaint_id uuid references complaints(id) on delete set null,
user_id uuid,
phone_number text,

-- Person details
full_name text,
gender text check (gender in ('male','female','transgender','other')),
date_of_birth date,
year_of_birth int check (year_of_birth between 1900 and extract(year from now())::int),

-- Address
address_line text,
district text,
state text,
pincode text check (pincode is null or pincode ~ '^[0-9]{6}$'),

-- Aadhaar safe storage (masked/hash only)
aadhaar_last4 char(4) check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
aadhaar_masked text, -- example: XXXX XXXX 1234
aadhaar_number_hash text, -- store hash, never raw number

-- Verification
is_verified boolean default false,
verification_method text check (
verification_method in (
'manual',
'ocr',
'uidai_offline_xml',
'masked_aadhaar',
'not_verified'
)
) default 'not_verified',

-- File references
aadhaar_file_url text,
aadhaar_file_hash text,

-- Metadata
extracted_by_ai boolean default false,
confidence_score numeric(3,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
source_system text,
source_reference text,

created_at timestamp default now(),
updated_at timestamp default now()
);

create index if not exists idx_aadhaar_identity_complaint_id
on aadhaar_identity(complaint_id);

create index if not exists idx_aadhaar_identity_phone_number
on aadhaar_identity(phone_number);

create index if not exists idx_aadhaar_identity_aadhaar_last4
on aadhaar_identity(aadhaar_last4);

create index if not exists idx_aadhaar_identity_created_at
on aadhaar_identity(created_at desc);


3)

create or replace function set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
new.updated_at = now();
return new;
end;
$$;

drop trigger if exists trg_complaints_updated_at on complaints;
create trigger trg_complaints_updated_at
before update on complaints
for each row execute function set_row_updated_at();
drop trigger if exists trg_aadhaar_identity_updated_at on aadhaar_identity;
create trigger trg_aadhaar_identity_updated_at
before update on aadhaar_identity
for each row execute function set_row_updated_at();



5)CREATE TABLE case_classifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type_code TEXT NOT NULL,
  type_name TEXT NOT NULL,
  subtype_code TEXT NOT NULL,
  subtype_name TEXT NOT NULL,
  description TEXT,
  applicable_acts TEXT[],
  specific_sections TEXT[],
  severity_level INTEGER CHECK (severity_level BETWEEN 1 AND 5),
  is_cyber BOOLEAN DEFAULT FALSE,
  is_physical BOOLEAN DEFAULT FALSE,
  minor_involved_flag BOOLEAN DEFAULT FALSE,
  mandatory_police_report BOOLEAN DEFAULT FALSE,
  default_authority TEXT CHECK (default_authority IN ('ICC', 'HR', 'Legal', 'Police', 'SJPU')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO case_classifications
  (type_code, type_name, subtype_code, subtype_name, description, applicable_acts, specific_sections, severity_level, is_cyber, is_physical, minor_involved_flag, mandatory_police_report, default_authority)
VALUES

-- ─────────────────────────────────────────
-- 01. SEXUAL HARASSMENT
-- ─────────────────────────────────────────
('SH', 'Sexual Harassment', 'SH-01', 'Quid pro quo',
 'Demanding sexual favours in exchange for job benefits, promotions, grades, or other advantages',
 ARRAY['POSH Act 2013', 'BNS 2023'], ARRAY['POSH Act §2(n)', 'BNS §75'], 5, FALSE, FALSE, FALSE, FALSE, 'ICC'),

('SH', 'Sexual Harassment', 'SH-02', 'Hostile work environment',
 'Persistent unwelcome conduct of a sexual nature that creates an intimidating or offensive environment',
 ARRAY['POSH Act 2013', 'BNS 2023'], ARRAY['POSH Act §3', 'BNS §75'], 4, FALSE, FALSE, FALSE, FALSE, 'ICC'),

('SH', 'Sexual Harassment', 'SH-03', 'Unwanted physical contact',
 'Touching, groping, or any physical contact of a sexual nature without consent',
 ARRAY['POSH Act 2013', 'BNS 2023'], ARRAY['POSH Act §3(1)(i)', 'BNS §76'], 5, FALSE, TRUE, FALSE, FALSE, 'ICC'),

('SH', 'Sexual Harassment', 'SH-04', 'Voyeurism',
 'Recording or watching a person in a private act without consent, including bathroom or changing room',
 ARRAY['BNS 2023', 'IT Act 2000'], ARRAY['BNS §77', 'IT Act §66E'], 5, TRUE, FALSE, FALSE, TRUE, 'Police'),

('SH', 'Sexual Harassment', 'SH-05', 'Sexually explicit communication',
 'Sending sexually explicit messages, images, videos, or making verbal sexual remarks',
 ARRAY['POSH Act 2013', 'IT Act 2000', 'BNS 2023'], ARRAY['POSH Act §3(1)(iv)', 'IT Act §67', 'BNS §75'], 3, TRUE, FALSE, FALSE, FALSE, 'ICC'),

('SH', 'Sexual Harassment', 'SH-06', 'Non-consensual image sharing',
 'Sharing intimate or morphed images/videos of a person without consent — commonly called revenge porn',
 ARRAY['IT Act 2000', 'BNS 2023'], ARRAY['IT Act §66E', 'IT Act §67A', 'BNS §77'], 5, TRUE, FALSE, FALSE, TRUE, 'Police'),

-- ─────────────────────────────────────────
-- 02. STALKING
-- ─────────────────────────────────────────
('ST', 'Stalking', 'ST-01', 'Physical stalking',
 'Repeatedly following, monitoring, or showing up at a person''s home, workplace, or regular locations',
 ARRAY['BNS 2023'], ARRAY['BNS §78'], 4, FALSE, TRUE, FALSE, FALSE, 'Legal'),

('ST', 'Stalking', 'ST-02', 'Digital stalking',
 'Tracking a person''s online activity, location via apps, or monitoring their communications without consent',
 ARRAY['BNS 2023', 'IT Act 2000'], ARRAY['BNS §78', 'IT Act §66C'], 4, TRUE, FALSE, FALSE, FALSE, 'Legal'),

('ST', 'Stalking', 'ST-03', 'Obsessive contact',
 'Repeatedly calling, messaging, or emailing despite being asked to stop',
 ARRAY['BNS 2023'], ARRAY['BNS §78(1)(ii)'], 3, TRUE, FALSE, FALSE, FALSE, 'HR'),

('ST', 'Stalking', 'ST-04', 'Identity impersonation',
 'Creating fake accounts or impersonating the victim online to damage reputation or extract information',
 ARRAY['IT Act 2000', 'BNS 2023'], ARRAY['IT Act §66D', 'BNS §319'], 4, TRUE, FALSE, FALSE, TRUE, 'Police'),

-- ─────────────────────────────────────────
-- 03. CYBER HARASSMENT
-- ─────────────────────────────────────────
('CY', 'Cyber Harassment', 'CY-01', 'Cyberbullying',
 'Repeated online harassment via social media, chat groups, or messaging platforms targeting an individual',
 ARRAY['IT Act 2000', 'BNS 2023'], ARRAY['IT Act §66A (struck down, refer BNS)', 'BNS §351'], 3, TRUE, FALSE, FALSE, FALSE, 'HR'),

('CY', 'Cyber Harassment', 'CY-02', 'Doxing',
 'Publishing private or personal information about someone online without their consent',
 ARRAY['IT Act 2000', 'BNS 2023'], ARRAY['IT Act §43', 'BNS §356'], 4, TRUE, FALSE, FALSE, TRUE, 'Police'),

('CY', 'Cyber Harassment', 'CY-03', 'Online threats and intimidation',
 'Sending threatening messages, death threats, or blackmail via digital channels',
 ARRAY['BNS 2023', 'IT Act 2000'], ARRAY['BNS §308', 'BNS §351', 'IT Act §66'], 5, TRUE, FALSE, FALSE, TRUE, 'Police'),

('CY', 'Cyber Harassment', 'CY-04', 'Hacking and data theft',
 'Unauthorised access to victim''s accounts, emails, or devices to extract personal data',
 ARRAY['IT Act 2000'], ARRAY['IT Act §43', 'IT Act §66', 'IT Act §66C'], 4, TRUE, FALSE, FALSE, TRUE, 'Police'),

('CY', 'Cyber Harassment', 'CY-05', 'Defamation online',
 'Posting false statements, fabricated screenshots, or misleading content to damage a person''s reputation',
 ARRAY['BNS 2023', 'IT Act 2000'], ARRAY['BNS §356', 'IT Act §66A (refer BNS)'], 3, TRUE, FALSE, FALSE, FALSE, 'Legal'),

('CY', 'Cyber Harassment', 'CY-06', 'Deepfake or AI-generated content',
 'Using AI tools to generate fake explicit or defamatory content featuring the victim''s likeness',
 ARRAY['IT Act 2000', 'BNS 2023'], ARRAY['IT Act §66E', 'IT Act §67', 'BNS §77'], 5, TRUE, FALSE, FALSE, TRUE, 'Police'),

-- ─────────────────────────────────────────
-- 04. BULLYING AND RAGGING
-- ─────────────────────────────────────────
('BU', 'Bullying and Ragging', 'BU-01', 'Institutional ragging',
 'Physical or psychological abuse of junior students by seniors in colleges, hostels, or professional institutes',
 ARRAY['UGC Anti-Ragging Regulations 2009', 'BNS 2023'], ARRAY['UGC Reg. §3', 'BNS §115'], 4, FALSE, TRUE, FALSE, FALSE, 'HR'),

('BU', 'Bullying and Ragging', 'BU-02', 'Workplace bullying by peer',
 'Repeated verbal, psychological, or social abuse by a colleague at the same level',
 ARRAY['BNS 2023'], ARRAY['BNS §351', 'BNS §115'], 3, FALSE, FALSE, FALSE, FALSE, 'HR'),

('BU', 'Bullying and Ragging', 'BU-03', 'Workplace bullying by superior',
 'Abuse of hierarchical power — belittling, humiliating, or intimidating a subordinate',
 ARRAY['BNS 2023', 'POSH Act 2013'], ARRAY['BNS §351', 'POSH Act §3'], 4, FALSE, FALSE, FALSE, FALSE, 'ICC'),

('BU', 'Bullying and Ragging', 'BU-04', 'Verbal abuse and slurs',
 'Use of casteist, sexist, communal, or otherwise derogatory language against a person',
 ARRAY['BNS 2023', 'SC/ST Prevention of Atrocities Act 1989'], ARRAY['BNS §351', 'SC/ST Act §3'], 3, FALSE, FALSE, FALSE, FALSE, 'HR'),

('BU', 'Bullying and Ragging', 'BU-05', 'Social exclusion and ostracism',
 'Organised group exclusion, silent treatment, or isolation designed to harm a person''s standing',
 ARRAY['BNS 2023'], ARRAY['BNS §351(3)'], 2, FALSE, FALSE, FALSE, FALSE, 'HR'),

-- ─────────────────────────────────────────
-- 05. DISCRIMINATION
-- ─────────────────────────────────────────
('DI', 'Discrimination', 'DI-01', 'Gender-based discrimination',
 'Denial of opportunities, unequal treatment, or bias based on sex or gender identity at workplace or institution',
 ARRAY['Constitution of India', 'POSH Act 2013'], ARRAY['Art. 15', 'Art. 16', 'POSH Act §3'], 3, FALSE, FALSE, FALSE, FALSE, 'ICC'),

('DI', 'Discrimination', 'DI-02', 'Caste-based discrimination',
 'Untouchability, derogatory remarks, or denial of rights based on caste identity',
 ARRAY['SC/ST Prevention of Atrocities Act 1989', 'Constitution of India'], ARRAY['SC/ST Act §3', 'Art. 17'], 4, FALSE, FALSE, FALSE, FALSE, 'Legal'),

('DI', 'Discrimination', 'DI-03', 'Religion-based discrimination',
 'Harassment, denial of rights, or hostile treatment based on religious identity',
 ARRAY['Constitution of India', 'BNS 2023'], ARRAY['Art. 15', 'BNS §299'], 3, FALSE, FALSE, FALSE, FALSE, 'Legal'),

('DI', 'Discrimination', 'DI-04', 'Disability-based discrimination',
 'Unequal treatment or denial of reasonable accommodation to a person with disability',
 ARRAY['Rights of Persons with Disabilities Act 2016'], ARRAY['RPwD Act §3', 'RPwD Act §20'], 3, FALSE, FALSE, FALSE, FALSE, 'HR'),

('DI', 'Discrimination', 'DI-05', 'Pregnancy and maternity discrimination',
 'Penalising, demoting, or terminating employment related to pregnancy or maternity leave',
 ARRAY['Maternity Benefit Act 1961', 'POSH Act 2013'], ARRAY['MB Act §4', 'MB Act §12'], 4, FALSE, FALSE, FALSE, FALSE, 'Legal'),

-- ─────────────────────────────────────────
-- 06. PHYSICAL VIOLENCE
-- ─────────────────────────────────────────
('PV', 'Physical Violence', 'PV-01', 'Physical assault',
 'Any intentional application of force — hitting, pushing, kicking — against a person',
 ARRAY['BNS 2023'], ARRAY['BNS §109', 'BNS §115', 'BNS §118'], 5, FALSE, TRUE, FALSE, TRUE, 'Police'),

('PV', 'Physical Violence', 'PV-02', 'Domestic violence',
 'Physical, emotional, sexual, or economic abuse within a domestic relationship',
 ARRAY['Protection of Women from Domestic Violence Act 2005'], ARRAY['DV Act §3', 'DV Act §12'], 5, FALSE, TRUE, FALSE, TRUE, 'Police'),

('PV', 'Physical Violence', 'PV-03', 'Eve teasing',
 'Making suggestive remarks, gestures, sounds, or following a woman in public spaces',
 ARRAY['BNS 2023'], ARRAY['BNS §79'], 3, FALSE, TRUE, FALSE, FALSE, 'Legal'),

('PV', 'Physical Violence', 'PV-04', 'Acid attack',
 'Throwing or administering acid or corrosive substance causing injury or disfigurement',
 ARRAY['BNS 2023'], ARRAY['BNS §124', 'BNS §125'], 5, FALSE, TRUE, FALSE, TRUE, 'Police'),

('PV', 'Physical Violence', 'PV-05', 'Wrongful confinement',
 'Restraining or confining a person against their will — locking in a room, blocking exits',
 ARRAY['BNS 2023'], ARRAY['BNS §126', 'BNS §127'], 4, FALSE, TRUE, FALSE, TRUE, 'Police'),

-- ─────────────────────────────────────────
-- 07. MINOR INVOLVED (POCSO)
-- ─────────────────────────────────────────
('MI', 'Minor Involved', 'MI-01', 'Sexual assault on minor',
 'Any penetrative or non-penetrative sexual act against a child below 18 years',
 ARRAY['POCSO Act 2012', 'BNS 2023'], ARRAY['POCSO §3', 'POCSO §7', 'BNS §63'], 5, FALSE, TRUE, TRUE, TRUE, 'SJPU'),

('MI', 'Minor Involved', 'MI-02', 'Online grooming of minor',
 'Using digital platforms to gain a minor''s trust for sexual exploitation — includes inappropriate messaging',
 ARRAY['POCSO Act 2012', 'IT Act 2000'], ARRAY['POCSO §11', 'POCSO §13', 'IT Act §67B'], 5, TRUE, FALSE, TRUE, TRUE, 'SJPU'),

('MI', 'Minor Involved', 'MI-03', 'Child pornography',
 'Producing, distributing, or possessing sexually explicit material involving a minor',
 ARRAY['POCSO Act 2012', 'IT Act 2000'], ARRAY['POCSO §14', 'POCSO §15', 'IT Act §67B'], 5, TRUE, FALSE, TRUE, TRUE, 'SJPU'),

('MI', 'Minor Involved', 'MI-04', 'Non-sexual child abuse',
 'Physical, emotional, or psychological abuse of a minor that is not sexual in nature',
 ARRAY['Juvenile Justice Act 2015', 'BNS 2023'], ARRAY['JJ Act §75', 'BNS §115'], 5, FALSE, TRUE, TRUE, TRUE, 'SJPU'),

-- ─────────────────────────────────────────
-- 08. RETALIATION AND INSTITUTIONAL ABUSE
-- ─────────────────────────────────────────
('RI', 'Retaliation and Institutional Abuse', 'RI-01', 'Retaliation after reporting',
 'Demotion, termination, isolation, or hostile treatment of a person who filed a complaint',
 ARRAY['POSH Act 2013', 'Whistle Blowers Protection Act 2014'], ARRAY['POSH Act §9', 'WBP Act §3'], 4, FALSE, FALSE, FALSE, FALSE, 'ICC'),

('RI', 'Retaliation and Institutional Abuse', 'RI-02', 'Malicious false complaint',
 'Filing a fabricated complaint with intent to harm the accused''s reputation or career',
 ARRAY['POSH Act 2013', 'BNS 2023'], ARRAY['POSH Act §14', 'BNS §229'], 3, FALSE, FALSE, FALSE, FALSE, 'ICC'),

('RI', 'Retaliation and Institutional Abuse', 'RI-03', 'Coercion by authority',
 'Using institutional power to pressure a victim to withdraw complaint or stay silent',
 ARRAY['BNS 2023', 'POSH Act 2013'], ARRAY['BNS §308', 'POSH Act §9'], 4, FALSE, FALSE, FALSE, FALSE, 'Legal'),

('RI', 'Retaliation and Institutional Abuse', 'RI-04', 'Negligence in duty of care',
 'Institution or employer failing to act on a known complaint — enabling continued harassment',
 ARRAY['POSH Act 2013'], ARRAY['POSH Act §4', 'POSH Act §16', 'POSH Act §19'], 3, FALSE, FALSE, FALSE, FALSE, 'Legal');


 6) 
 CREATE TABLE mock_persons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  age INTEGER CHECK (age BETWEEN 20 AND 40),
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Non-binary')),
  caste_category TEXT CHECK (caste_category IN ('General', 'OBC', 'SC', 'ST', 'EWS')),

  -- Aadhaar (nullable — not everyone has/shares it)
  aadhar_id TEXT UNIQUE,

  -- Education
  school_name TEXT,
  education_level TEXT CHECK (education_level IN (
    'High School', 'Diploma', 'Undergraduate', 'Postgraduate', 'Doctorate', 'Dropout'
  )),
  is_college_student BOOLEAN DEFAULT FALSE,

  -- Occupation
  occupation TEXT,
  department TEXT CHECK (department IN (
    'Engineering', 'Sales & BD', 'HR & Admin', 'Finance',
    'Product & Design', 'Legal & Compliance', 'Operations',
    'Marketing', 'Customer Support', 'Research & Development',
    'Teaching & Academia', 'Healthcare', 'Student', 'Self-Employed', 'Unemployed'
  )),
  occupation_location TEXT,         -- city name
  occupation_pincode TEXT,

  -- Home Address
  home_address TEXT,
  home_city TEXT,
  home_state TEXT,
  home_pincode TEXT,

  -- Criminal Record
  has_criminal_record BOOLEAN DEFAULT FALSE,
  criminal_record_type TEXT,        -- NULL if no record
  criminal_record_year INTEGER,     -- NULL if no record
  number_of_cases INTEGER DEFAULT 0,
  criminal_description TEXT,        -- NULL if no record

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW()
);
Tier 1 — Always collect (mandatory, upfront)

What happened? always ask
Free text, 2–3 sentences minimum. The core of the complaint.
Prompt: "Describe what happened in your own words. You don't need to use legal terms."
Incident type always ask
Dropdown / multi-select. Needed for routing to ICC / HR / Legal.
Options: verbal abuse, physical, sexual, online/cyber, discrimination, stalking, other
When did it happen? always ask
Approximate is fine — month/year or "last week". Needed for SLA clock and recency scoring.
Prompt: "Approximate date is fine — even 'about 2 weeks ago' helps."
Where did it happen? always ask
General location — campus / office / online. Powers safety heatmap. No GPS required.
Options: on campus, at workplace, online/digital, off-site, not sure
Is this ongoing? always ask
Single yes/no. Drives urgency flag — ongoing = higher priority routing.
Yes / No / Not sure
Your relationship to the accused always ask
Determines which authority handles it (ICC = colleague/superior, HR = peer, Legal = external).
Options: supervisor/manager, colleague, student, faculty, stranger, vendor/contractor, not sure
Tier 2 — Ask only if the description is vague (follow-up prompts)

How many times? ask if unclear
If description says "this keeps happening" — ask once, no, multiple, many times.
NLP trigger: complaint contains "always", "keeps", "every time", "constantly"
Were there witnesses? ask if unclear
Boosts credibility score. Helps investigator know to seek corroboration.
Prompt: "Were others present? You don't need to name them."
Any evidence available? ask if unclear
Screenshots, messages, emails. Optional upload — but asking surfaces it if they forgot.
Prompt: "Do you have screenshots, messages, or anything else? Totally optional."
Specific location details ask if unclear
If they said "on campus" — ask which building/floor for heatmap accuracy.
Only ask if location is vague. Free text or building selector.
Have you reported this before? ask if unclear
If yes, enables cross-referencing with previous cases. Important for repeat offender detection.
Yes (to whom?) / No / Tried to but couldn't
Tier 3 — Never ask (protect the victim)

Victim's real name never ask
Anonymous by design. Token system replaces identity.
Accused person's full name never ask
Ask for role/department only. Full name risks retaliation if data is ever exposed.
Instead ask: "What is the accused's role?" (e.g. "senior manager in accounts")
Victim's contact info never ask
Communication happens via token-gated chat. No email or phone needed.
Medical / mental health details never ask
Outside scope of triage. Sensitive protected data. Refer them to counseling separately.
"Why didn't you report sooner?" never ask
Victim-blaming framing. Irrelevant to triage. Damages trust immediately.
create table complaints (
    id uuid primary key default gen_random_uuid(),
    
    -- Identity & auth (aligns with cases table)
    token text unique not null,
    token_secret_hash text,              -- only if this is the entry point
    org_id uuid not null references organizations(id),
    phone_hash text,                     -- argon2id, only during creation
    
    --------------------
    -- Tier 1 mandatory
    --------------------
    description text not null,
    incident_types text[] not null,      -- ['sexual_harassment', 'bullying', etc.]
    incident_date date,                  -- approximate date
    location_general text,               -- 'office', 'online', 'offsite_event'
    is_ongoing boolean,
    relationship_to_accused text,        -- 'supervisor', 'colleague', 'unknown'
    
    --------------------
    -- Tier 2 optional
    --------------------
    frequency text,                      -- 'once', 'multiple', 'ongoing'
    has_witnesses boolean default false,
    witness_description text,
    has_evidence boolean default false,
    evidence_urls text[],                -- for non-anonymous mode
    location_detail text,
    reported_before boolean,
    reported_to text,                    -- 'manager', 'hr', 'police', etc.
    accused_role text,                   -- for power imbalance calculation
    
    --------------------
    -- Lifecycle
    --------------------
    status text default 'draft' check (
        status in ('draft', 'submitted', 'converted_to_case', 'abandoned')
    ),
    case_id uuid references cases(id),   -- set when converted
    
    --------------------
    -- Routing (calculated)
    --------------------
    priority_score int default 0,
    routed_to text,                      -- 'ICC', 'HR', 'legal', 'police'
    sla_deadline timestamptz,
    
    --------------------
    -- Timestamps
    --------------------
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    submitted_at timestamptz,            -- when status → 'submitted'
    
    -- Indexes
    create index idx_complaints_token on complaints(token);
    create index idx_complaints_org_id on complaints(org_id);
    create index idx_complaints_status on complaints(status);
    create index idx_complaints_case_id on complaints(case_id);
);
create table complaints (
    id uuid primary key default gen_random_uuid(),
    
    -- Identity & auth (aligns with cases table)
    token text unique not null,
    token_secret_hash text,
    org_id uuid not null references organizations(id),
    phone_hash text,
    
    --------------------
    -- Tier 1 mandatory
    --------------------
    description text not null,
    incident_types text[] not null,
    incident_date date,
    location_general text,
    is_ongoing boolean,
    relationship_to_accused text,
    
    --------------------
    -- Tier 2 optional
    --------------------
    frequency text,
    has_witnesses boolean default false,
    witness_description text,
    has_evidence boolean default false,
    evidence_urls text[],
    location_detail text,
    reported_before boolean,
    reported_to text,
    accused_role text,
    
    --------------------
    -- Lifecycle
    --------------------
    status text default 'draft' check (
        status in ('draft', 'submitted', 'converted_to_case', 'abandoned')
    ),
    case_id uuid references cases(id),
    
    --------------------
    -- Routing (calculated)
    --------------------
    priority_score int default 0,
    routed_to text,
    sla_deadline timestamptz,
    
    --------------------
    -- Timestamps
    --------------------
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    submitted_at timestamptz
);

-- Indexes (separate statements!)
create index idx_complaints_token on complaints(token);
create index idx_complaints_org_id on complaints(org_id);
create index idx_complaints_status on complaints(status);
create index idx_complaints_case_id on complaints(case_id);
API_URL = https://xhzxdszzvcdtvvjttwnv.supabase.co
anon_public = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhoenhkc3p6dmNkdHZ2anR0d252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzY2OTYsImV4cCI6MjA4OTg1MjY5Nn0.IDR6leqjQBAs-r2fiayS9ljvTAH9EXYUjl89UHRUOrw

service_role = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhoenhkc3p6dmNkdHZ2anR0d252Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3NjY5NiwiZXhwIjoyMDg5ODUyNjk2fQ.YYOXA19PvxiHdiK1Uzf040nACrLANtA1BavlW-VP8eU

password = Frh5Zgyu0ml3jjUK
db_name = Justra

project_id = xhzxdszzvcdtvvjttwnv
ALTER TABLE complaints ALTER COLUMN incident_types DROP NOT NULL;
ALTER TABLE complaints ALTER COLUMN incident_types SET DEFAULT '{}';
-- 1. Allow incident_types to be NULL initially
ALTER TABLE complaints ALTER COLUMN incident_types DROP NOT NULL;
ALTER TABLE complaints ALTER COLUMN incident_types SET DEFAULT '{}';

-- 2. Add accused_name column
ALTER TABLE complaints ADD COLUMN accused_name TEXT;
COMMENT ON COLUMN complaints.accused_name IS 'Name of accused person if victim chooses to provide it';
ALTER TABLE complaints ADD COLUMN emotion_score numeric(3,2);
ALTER TABLE complaints ADD COLUMN credibility_score numeric(3,2);
ALTER TABLE complaints ADD COLUMN severity int;
ALTER TABLE complaints ADD COLUMN urgency text;
ALTER TABLE complaints ADD COLUMN summary text;
ALTER TABLE complaints ADD COLUMN exaggeration_flags text[];
ALTER TABLE complaints ADD COLUMN phone_number text;
CREATE INDEX idx_complaints_phone ON complaints(phone_number);


ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS timeline jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_complaints_timeline_gin
ON complaints USING gin (timeline);




create table act_routing_config (
    act_code text primary key,   -- POSH / POCSO / IT / BNS

    config jsonb,

    created_at timestamp default now()
);


insert into act_routing_config (act_code, config)
values

(
'POSH',
'{
  "levels": [
    { "priority": "low", "authority": "ICC", "level": 1, "days": 7, "escalate_to": "Employer" },
    { "priority": "medium", "authority": "ICC Inquiry", "level": 2, "days": 15, "escalate_to": "Local Committee" },
    { "priority": "high", "authority": "Employer + ICC", "level": 3, "days": 30, "escalate_to": "Police" },
    { "priority": "critical", "authority": "Police", "level": 4, "days": 1, "escalate_to": null }
  ]
}'
),

(
'POCSO',
'{
  "levels": [
    { "priority": "low", "authority": "Police", "level": 1, "days": 1, "escalate_to": "SJPU" },
    { "priority": "medium", "authority": "SJPU", "level": 2, "days": 3, "escalate_to": "CWC" },
    { "priority": "high", "authority": "CWC", "level": 3, "days": 7, "escalate_to": "Special Court" },
    { "priority": "critical", "authority": "Special Court", "level": 4, "days": 1, "escalate_to": null }
  ]
}'
),

(
'IT',
'{
  "levels": [
    { "priority": "low", "authority": "HR + IT Admin", "level": 1, "days": 5, "escalate_to": "Cyber Cell" },
    { "priority": "medium", "authority": "Cyber Cell", "level": 2, "days": 10, "escalate_to": "Cyber Police" },
    { "priority": "high", "authority": "Cyber Police", "level": 3, "days": 15, "escalate_to": "CERT-IN" },
    { "priority": "critical", "authority": "CERT-IN", "level": 4, "days": 2, "escalate_to": null }
  ]
}'
),

(
'BNS',
'{
  "levels": [
    { "priority": "low", "authority": "HR", "level": 1, "days": 7, "escalate_to": "Police" },
    { "priority": "medium", "authority": "Police Complaint", "level": 2, "days": 10, "escalate_to": "FIR" },
    { "priority": "high", "authority": "FIR", "level": 3, "days": 30, "escalate_to": "Magistrate" },
    { "priority": "critical", "authority": "Court", "level": 4, "days": 1, "escalate_to": null }
  ]
}'
);


BEGIN;

-- 1) Keep only one public case id column: token
ALTER TABLE cases ALTER COLUMN token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'cases'::regclass
      AND conname = 'cases_token_key'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_token_key UNIQUE (token);
  END IF;
END $$;

-- 2) Remove old helper functions that depend on secret-token auth model
DROP FUNCTION IF EXISTS verify_token_pair(TEXT, TEXT);
DROP FUNCTION IF EXISTS hash_secret_token(TEXT);
DROP FUNCTION IF EXISTS generate_secret_token();

-- 3) Remove legacy indexes/constraints on token_public
DROP INDEX IF EXISTS idx_cases_token_public;
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_token_public_key;

-- 4) Update complaint->case sync trigger function so it does not use removed columns
CREATE OR REPLACE FUNCTION sync_complaint_to_case()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cases (
    id,
    org_id,
    token,
    victim_type,
    description,
    incident_types,
    incident_date,
    location_general,
    is_ongoing,
    relationship_to_accused,
    frequency,
    has_witnesses,
    witness_description,
    has_evidence,
    evidence_urls,
    location_detail,
    reported_before,
    reported_to,
    accused_role,
    status,
    priority_score,
    routed_to,
    sla_deadline,
    created_at,
    updated_at,
    submitted_at,
    accused_name,
    emotion_score,
    credibility_score,
    severity,
    urgency,
    summary,
    exaggeration_flags,
    phone_number,
    is_anonymous,
    victim_name,
    victim_role,
    timeline,
    escalated_to
  )
  VALUES (
    NEW.id,
    NEW.org_id,
    NEW.token,
    CASE WHEN COALESCE(NEW.is_anonymous, true) THEN 'anonymous' ELSE 'normal' END,
    NEW.description,
    COALESCE(NEW.incident_types, '{}'::text[]),
    NEW.incident_date,
    NEW.location_general,
    NEW.is_ongoing,
    NEW.relationship_to_accused,
    NEW.frequency,
    COALESCE(NEW.has_witnesses, false),
    NEW.witness_description,
    COALESCE(NEW.has_evidence, false),
    NEW.evidence_urls,
    NEW.location_detail,
    NEW.reported_before,
    NEW.reported_to,
    NEW.accused_role,
    'submitted',
    NEW.priority_score,
    NEW.routed_to,
    NEW.sla_deadline,
    NEW.created_at,
    NEW.updated_at,
    COALESCE(NEW.submitted_at, NEW.updated_at, NEW.created_at),
    NEW.accused_name,
    CASE WHEN NEW.emotion_score IS NULL THEN NULL ELSE NEW.emotion_score::numeric(3,2) END,
    CASE WHEN NEW.credibility_score IS NULL THEN NULL ELSE NEW.credibility_score::numeric(3,2) END,
    NEW.severity,
    NEW.urgency,
    NEW.summary,
    NEW.exaggeration_flags,
    NEW.phone_number,
    COALESCE(NEW.is_anonymous, true),
    NEW.victim_name,
    NEW.victim_role,
    COALESCE(NEW.timeline, '[]'::jsonb),
    NULL
  )
  ON CONFLICT (id) DO UPDATE
  SET
    org_id = EXCLUDED.org_id,
    token = EXCLUDED.token,
    victim_type = EXCLUDED.victim_type,
    description = EXCLUDED.description,
    incident_types = EXCLUDED.incident_types,
    incident_date = EXCLUDED.incident_date,
    location_general = EXCLUDED.location_general,
    is_ongoing = EXCLUDED.is_ongoing,
    relationship_to_accused = EXCLUDED.relationship_to_accused,
    frequency = EXCLUDED.frequency,
    has_witnesses = EXCLUDED.has_witnesses,
    witness_description = EXCLUDED.witness_description,
    has_evidence = EXCLUDED.has_evidence,
    evidence_urls = EXCLUDED.evidence_urls,
    location_detail = EXCLUDED.location_detail,
    reported_before = EXCLUDED.reported_before,
    reported_to = EXCLUDED.reported_to,
    accused_role = EXCLUDED.accused_role,
    priority_score = EXCLUDED.priority_score,
    routed_to = EXCLUDED.routed_to,
    sla_deadline = EXCLUDED.sla_deadline,
    updated_at = EXCLUDED.updated_at,
    submitted_at = EXCLUDED.submitted_at,
    accused_name = EXCLUDED.accused_name,
    emotion_score = EXCLUDED.emotion_score,
    credibility_score = EXCLUDED.credibility_score,
    severity = EXCLUDED.severity,
    urgency = EXCLUDED.urgency,
    summary = EXCLUDED.summary,
    exaggeration_flags = EXCLUDED.exaggeration_flags,
    phone_number = EXCLUDED.phone_number,
    is_anonymous = EXCLUDED.is_anonymous,
    victim_name = EXCLUDED.victim_name,
    victim_role = EXCLUDED.victim_role,
    timeline = EXCLUDED.timeline;

  NEW.case_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) Finally drop columns
ALTER TABLE cases
  DROP COLUMN IF EXISTS token_public,
  DROP COLUMN IF EXISTS token_secret_hash,
  DROP COLUMN IF EXISTS phone_hash;

COMMIT;

