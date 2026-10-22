export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      cases: {
        Row: {
          id: string;
          org_id: string;
          token_public: string;
          victim_type: "anonymous" | "normal";
          complaint_text_redacted: string | null;
          status: string;
          created_at: string;
        };
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          role: "hr_admin" | "compliance_officer" | "platform_admin";
          created_at: string;
        };
      };
    };
  };
};
