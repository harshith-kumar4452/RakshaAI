-- Victim onboarding fields in complaints
ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true;

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS victim_name text;

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS victim_role text;

-- Aadhaar identity registry (identified onboarding)
CREATE TABLE IF NOT EXISTS aadhaar_identity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to complaint / user
    complaint_id uuid REFERENCES complaints(id) ON DELETE SET NULL,
    user_id uuid,
    phone_number text,

    -- Name fields
    full_name text,
    gender text CHECK (gender IN ('male','female','transgender','other')),
    date_of_birth date,
    year_of_birth int,

    -- Address from Aadhaar
    address_line text,
    district text,
    state text,
    pincode text,

    -- Aadhaar details (masked only)
    aadhaar_last4 char(4),
    aadhaar_masked text,
    aadhaar_number_hash text,

    -- Verification
    is_verified boolean DEFAULT false,
    verification_method text CHECK (
        verification_method IN (
            'manual',
            'ocr',
            'uidai_offline_xml',
            'masked_aadhaar',
            'not_verified'
        )
    ) DEFAULT 'not_verified',

    -- File storage reference
    aadhaar_file_url text,
    aadhaar_file_hash text,

    -- Metadata
    extracted_by_ai boolean DEFAULT false,
    confidence_score numeric(3,2),
    source_system text,
    source_reference text,

    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aadhaar_identity_complaint_id ON aadhaar_identity(complaint_id);
CREATE INDEX IF NOT EXISTS idx_aadhaar_identity_phone_number ON aadhaar_identity(phone_number);
CREATE INDEX IF NOT EXISTS idx_aadhaar_identity_aadhaar_last4 ON aadhaar_identity(aadhaar_last4);
