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