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