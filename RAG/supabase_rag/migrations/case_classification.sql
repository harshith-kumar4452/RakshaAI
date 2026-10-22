CREATE TABLE case_classifications (
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