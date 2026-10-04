export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];
export type Database = {
  public: {
    Tables: {
      attendance_records: {
        Row: {
          booking_id: string;
          client_record_id: string;
          created_at: string;
          cycle: number;
          id: string;
          revision: number;
          service_date: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          booking_id: string;
          client_record_id: string;
          created_at?: string;
          cycle?: number;
          id?: string;
          revision?: number;
          service_date: string;
          status: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          booking_id?: string;
          client_record_id?: string;
          created_at?: string;
          cycle?: number;
          id?: string;
          revision?: number;
          service_date?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_records_workspace_id_client_record_id_booking_i_fkey';
            columns: ['workspace_id', 'client_record_id', 'booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['workspace_id', 'client_record_id', 'id'];
          },
        ];
      };
      attendance_revisions: {
        Row: {
          attendance_id: string;
          client_record_id: string;
          created_at: string;
          created_by: string;
          cycle: number;
          id: string;
          reason: string | null;
          revision: number;
          service_date: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          attendance_id: string;
          client_record_id: string;
          created_at?: string;
          created_by: string;
          cycle: number;
          id?: string;
          reason?: string | null;
          revision: number;
          service_date: string;
          status: string;
          workspace_id: string;
        };
        Update: {
          attendance_id?: string;
          client_record_id?: string;
          created_at?: string;
          created_by?: string;
          cycle?: number;
          id?: string;
          reason?: string | null;
          revision?: number;
          service_date?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_revisions_workspace_id_client_record_id_attenda_fkey';
            columns: ['workspace_id', 'client_record_id', 'attendance_id'];
            isOneToOne: false;
            referencedRelation: 'attendance_records';
            referencedColumns: ['workspace_id', 'client_record_id', 'id'];
          },
        ];
      };
      booking_program_exercises: {
        Row: {
          bodyweight_snapshot: boolean;
          booking_program_id: string;
          created_at: string;
          created_by: string | null;
          equipment_snapshot: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          id: string;
          instructions_snapshot: string[];
          measure_snapshot: string;
          muscle_group_snapshot: string;
          note: string | null;
          planned_reps: string | null;
          planned_seconds: string | null;
          planned_sets: number;
          planned_weight_g: number | null;
          position: number;
          rest_seconds: number;
          source_key_snapshot: string | null;
          workspace_id: string;
        };
        Insert: {
          bodyweight_snapshot: boolean;
          booking_program_id: string;
          created_at?: string;
          created_by?: string | null;
          equipment_snapshot: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          id?: string;
          instructions_snapshot: string[];
          measure_snapshot: string;
          muscle_group_snapshot: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets: number;
          planned_weight_g?: number | null;
          position: number;
          rest_seconds?: number;
          source_key_snapshot?: string | null;
          workspace_id: string;
        };
        Update: {
          bodyweight_snapshot?: boolean;
          booking_program_id?: string;
          created_at?: string;
          created_by?: string | null;
          equipment_snapshot?: string;
          exercise_id?: string;
          exercise_name_snapshot?: string;
          id?: string;
          instructions_snapshot?: string[];
          measure_snapshot?: string;
          muscle_group_snapshot?: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets?: number;
          planned_weight_g?: number | null;
          position?: number;
          rest_seconds?: number;
          source_key_snapshot?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_program_exercises_workspace_id_booking_program_id_fkey';
            columns: ['workspace_id', 'booking_program_id'];
            isOneToOne: false;
            referencedRelation: 'booking_programs';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'booking_program_exercises_workspace_id_exercise_id_fkey';
            columns: ['workspace_id', 'exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'booking_program_exercises_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_programs: {
        Row: {
          base_template_id: string;
          base_template_revision: number;
          booking_id: string;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          name: string;
          workspace_id: string;
        };
        Insert: {
          base_template_id: string;
          base_template_revision: number;
          booking_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name: string;
          workspace_id: string;
        };
        Update: {
          base_template_id?: string;
          base_template_revision?: number;
          booking_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_programs_workspace_id_base_template_id_fkey';
            columns: ['workspace_id', 'base_template_id'];
            isOneToOne: false;
            referencedRelation: 'workout_templates';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'booking_programs_workspace_id_booking_id_fkey';
            columns: ['workspace_id', 'booking_id'];
            isOneToOne: true;
            referencedRelation: 'bookings';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'booking_programs_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      bookings: {
        Row: {
          client_record_id: string;
          created_at: string;
          created_by: string | null;
          ends_at: string;
          group_session_id: string | null;
          id: string;
          request_id: string | null;
          request_payload: Json | null;
          revision: number;
          starts_at: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          client_record_id: string;
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          group_session_id?: string | null;
          id?: string;
          request_id?: string | null;
          request_payload?: Json | null;
          revision?: number;
          starts_at: string;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          client_record_id?: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          group_session_id?: string | null;
          id?: string;
          request_id?: string | null;
          request_payload?: Json | null;
          revision?: number;
          starts_at?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_workspace_id_client_record_id_fkey';
            columns: ['workspace_id', 'client_record_id'];
            isOneToOne: false;
            referencedRelation: 'client_records';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'bookings_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_workspace_id_group_session_id_fkey';
            columns: ['workspace_id', 'group_session_id'];
            isOneToOne: false;
            referencedRelation: 'group_sessions';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      client_program_exercises: {
        Row: {
          bodyweight_snapshot: boolean;
          client_program_id: string;
          created_at: string;
          created_by: string | null;
          equipment_snapshot: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          id: string;
          instructions_snapshot: string[];
          measure_snapshot: string;
          muscle_group_snapshot: string;
          note: string | null;
          planned_reps: string | null;
          planned_seconds: string | null;
          planned_sets: number;
          planned_weight_g: number | null;
          position: number;
          rest_seconds: number;
          revision: number;
          source_key_snapshot: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          bodyweight_snapshot: boolean;
          client_program_id: string;
          created_at?: string;
          created_by?: string | null;
          equipment_snapshot: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          id?: string;
          instructions_snapshot: string[];
          measure_snapshot: string;
          muscle_group_snapshot: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets: number;
          planned_weight_g?: number | null;
          position: number;
          rest_seconds?: number;
          revision?: number;
          source_key_snapshot?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          bodyweight_snapshot?: boolean;
          client_program_id?: string;
          created_at?: string;
          created_by?: string | null;
          equipment_snapshot?: string;
          exercise_id?: string;
          exercise_name_snapshot?: string;
          id?: string;
          instructions_snapshot?: string[];
          measure_snapshot?: string;
          muscle_group_snapshot?: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets?: number;
          planned_weight_g?: number | null;
          position?: number;
          rest_seconds?: number;
          revision?: number;
          source_key_snapshot?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_program_exercises_workspace_id_client_program_id_fkey';
            columns: ['workspace_id', 'client_program_id'];
            isOneToOne: false;
            referencedRelation: 'client_programs';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'client_program_exercises_workspace_id_exercise_id_fkey';
            columns: ['workspace_id', 'exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'client_program_exercises_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      client_programs: {
        Row: {
          base_template_id: string;
          base_template_revision: number;
          client_record_id: string;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          name: string;
          revision: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          base_template_id: string;
          base_template_revision: number;
          client_record_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name: string;
          revision?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          base_template_id?: string;
          base_template_revision?: number;
          client_record_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name?: string;
          revision?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_programs_workspace_id_base_template_id_fkey';
            columns: ['workspace_id', 'base_template_id'];
            isOneToOne: false;
            referencedRelation: 'workout_templates';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'client_programs_workspace_id_client_record_id_fkey';
            columns: ['workspace_id', 'client_record_id'];
            isOneToOne: false;
            referencedRelation: 'client_records';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'client_programs_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      client_purchases: {
        Row: {
          client_record_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          expires_on: string | null;
          id: string;
          price_minor: number;
          title: string;
          units: number;
          workspace_id: string;
        };
        Insert: {
          client_record_id: string;
          created_at?: string;
          created_by: string;
          currency?: string;
          expires_on?: string | null;
          id?: string;
          price_minor: number;
          title: string;
          units: number;
          workspace_id: string;
        };
        Update: {
          client_record_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          expires_on?: string | null;
          id?: string;
          price_minor?: number;
          title?: string;
          units?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_purchases_workspace_id_client_record_id_fkey';
            columns: ['workspace_id', 'client_record_id'];
            isOneToOne: false;
            referencedRelation: 'client_records';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      client_records: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          display_name: string;
          id: string;
          phone: string | null;
          revision: number;
          updated_at: string;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          id?: string;
          phone?: string | null;
          revision?: number;
          updated_at?: string;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          id?: string;
          phone?: string | null;
          revision?: number;
          updated_at?: string;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_records_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_entries: {
        Row: {
          attendance_id: string | null;
          booking_id: string | null;
          client_record_id: string;
          created_at: string;
          created_by: string;
          cycle: number | null;
          id: string;
          kind: string;
          purchase_id: string;
          reason: string | null;
          reverses_entry_id: string | null;
          units: number;
          workspace_id: string;
        };
        Insert: {
          attendance_id?: string | null;
          booking_id?: string | null;
          client_record_id: string;
          created_at?: string;
          created_by: string;
          cycle?: number | null;
          id?: string;
          kind: string;
          purchase_id: string;
          reason?: string | null;
          reverses_entry_id?: string | null;
          units: number;
          workspace_id: string;
        };
        Update: {
          attendance_id?: string | null;
          booking_id?: string | null;
          client_record_id?: string;
          created_at?: string;
          created_by?: string;
          cycle?: number | null;
          id?: string;
          kind?: string;
          purchase_id?: string;
          reason?: string | null;
          reverses_entry_id?: string | null;
          units?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_entries_workspace_id_client_record_id_booking_id_at_fkey';
            columns: [
              'workspace_id',
              'client_record_id',
              'booking_id',
              'attendance_id',
            ];
            isOneToOne: false;
            referencedRelation: 'attendance_records';
            referencedColumns: [
              'workspace_id',
              'client_record_id',
              'booking_id',
              'id',
            ];
          },
          {
            foreignKeyName: 'credit_entries_workspace_id_client_record_id_booking_id_fkey';
            columns: ['workspace_id', 'client_record_id', 'booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['workspace_id', 'client_record_id', 'id'];
          },
          {
            foreignKeyName: 'credit_entries_workspace_id_client_record_id_purchase_id_fkey';
            columns: ['workspace_id', 'client_record_id', 'purchase_id'];
            isOneToOne: false;
            referencedRelation: 'client_purchases';
            referencedColumns: ['workspace_id', 'client_record_id', 'id'];
          },
          {
            foreignKeyName: 'credit_entries_workspace_id_client_record_id_purchase_id_r_fkey';
            columns: [
              'workspace_id',
              'client_record_id',
              'purchase_id',
              'reverses_entry_id',
            ];
            isOneToOne: false;
            referencedRelation: 'credit_entries';
            referencedColumns: [
              'workspace_id',
              'client_record_id',
              'purchase_id',
              'id',
            ];
          },
        ];
      };
      exercises: {
        Row: {
          aliases: string[];
          archived_at: string | null;
          bodyweight: boolean;
          created_at: string;
          created_by: string | null;
          equipment: string;
          id: string;
          instructions: string[];
          measure: string;
          muscle_group: string;
          name: string;
          name_normalized: string | null;
          revision: number;
          source_key: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          aliases?: string[];
          archived_at?: string | null;
          bodyweight?: boolean;
          created_at?: string;
          created_by?: string | null;
          equipment: string;
          id?: string;
          instructions?: string[];
          measure: string;
          muscle_group: string;
          name: string;
          name_normalized?: never;
          revision?: number;
          source_key?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          aliases?: string[];
          archived_at?: string | null;
          bodyweight?: boolean;
          created_at?: string;
          created_by?: string | null;
          equipment?: string;
          id?: string;
          instructions?: string[];
          measure?: string;
          muscle_group?: string;
          name?: string;
          name_normalized?: never;
          revision?: number;
          source_key?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercises_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      group_sessions: {
        Row: {
          created_at: string;
          created_by: string | null;
          ends_at: string;
          id: string;
          revision: number;
          starts_at: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          id?: string;
          revision?: number;
          starts_at: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          id?: string;
          revision?: number;
          starts_at?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_sessions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          client_record_id: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          revision: number;
          revoked_at: string | null;
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          client_record_id: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          revision?: number;
          revoked_at?: string | null;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          client_record_id?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          revision?: number;
          revoked_at?: string | null;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_client_record_id_fkey';
            columns: ['client_record_id'];
            isOneToOne: false;
            referencedRelation: 'client_records';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          client_record_id: string;
          created_at: string;
          event_key: string;
          id: string;
          kind: string;
          payload: Json;
          read_at: string | null;
          recipient_role: string;
          recipient_user_id: string;
          target_id: string;
          target_type: string;
          workspace_id: string;
        };
        Insert: {
          client_record_id: string;
          created_at?: string;
          event_key: string;
          id?: string;
          kind: string;
          payload: Json;
          read_at?: string | null;
          recipient_role: string;
          recipient_user_id: string;
          target_id: string;
          target_type: string;
          workspace_id: string;
        };
        Update: {
          client_record_id?: string;
          created_at?: string;
          event_key?: string;
          id?: string;
          kind?: string;
          payload?: Json;
          read_at?: string | null;
          recipient_role?: string;
          recipient_user_id?: string;
          target_id?: string;
          target_type?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_workspace_id_client_record_id_fkey';
            columns: ['workspace_id', 'client_record_id'];
            isOneToOne: false;
            referencedRelation: 'client_records';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'notifications_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_entries: {
        Row: {
          amount_minor: number;
          client_record_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          id: string;
          kind: string;
          method: string;
          paid_on: string;
          purchase_id: string;
          reason: string | null;
          reverses_entry_id: string | null;
          source: string;
          workspace_id: string;
        };
        Insert: {
          amount_minor: number;
          client_record_id: string;
          created_at?: string;
          created_by: string;
          currency?: string;
          id?: string;
          kind: string;
          method: string;
          paid_on: string;
          purchase_id: string;
          reason?: string | null;
          reverses_entry_id?: string | null;
          source?: string;
          workspace_id: string;
        };
        Update: {
          amount_minor?: number;
          client_record_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          id?: string;
          kind?: string;
          method?: string;
          paid_on?: string;
          purchase_id?: string;
          reason?: string | null;
          reverses_entry_id?: string | null;
          source?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_entries_workspace_id_client_record_id_purchase_id__fkey';
            columns: [
              'workspace_id',
              'client_record_id',
              'purchase_id',
              'reverses_entry_id',
            ];
            isOneToOne: false;
            referencedRelation: 'payment_entries';
            referencedColumns: [
              'workspace_id',
              'client_record_id',
              'purchase_id',
              'id',
            ];
          },
          {
            foreignKeyName: 'payment_entries_workspace_id_client_record_id_purchase_id_fkey';
            columns: ['workspace_id', 'client_record_id', 'purchase_id'];
            isOneToOne: false;
            referencedRelation: 'client_purchases';
            referencedColumns: ['workspace_id', 'client_record_id', 'id'];
          },
        ];
      };
      private_notes: {
        Row: {
          author_user_id: string;
          client_record_id: string | null;
          created_at: string;
          created_by: string | null;
          device_id: string;
          id: string;
          revision: number;
          text: string;
          updated_at: string;
          workout_instance_id: string | null;
          workspace_id: string;
        };
        Insert: {
          author_user_id: string;
          client_record_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_id: string;
          id: string;
          revision?: number;
          text: string;
          updated_at?: string;
          workout_instance_id?: string | null;
          workspace_id: string;
        };
        Update: {
          author_user_id?: string;
          client_record_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_id?: string;
          id?: string;
          revision?: number;
          text?: string;
          updated_at?: string;
          workout_instance_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'private_notes_workspace_id_client_record_id_fkey';
            columns: ['workspace_id', 'client_record_id'];
            isOneToOne: false;
            referencedRelation: 'client_records';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'private_notes_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'private_notes_workspace_id_workout_instance_id_fkey';
            columns: ['workspace_id', 'workout_instance_id'];
            isOneToOne: false;
            referencedRelation: 'workout_instances';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_name: string;
          locale: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          locale?: string;
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          locale?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      schedule_proposals: {
        Row: {
          author_user_id: string;
          base_revision: number;
          booking_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          proposed_ends_at: string;
          proposed_starts_at: string;
          revision: number;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          author_user_id?: string;
          base_revision: number;
          booking_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          proposed_ends_at: string;
          proposed_starts_at: string;
          revision?: number;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          author_user_id?: string;
          base_revision?: number;
          booking_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          proposed_ends_at?: string;
          proposed_starts_at?: string;
          revision?: number;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'schedule_proposals_workspace_id_booking_id_fkey';
            columns: ['workspace_id', 'booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      session_notes: {
        Row: {
          author_user_id: string;
          created_at: string;
          created_by: string | null;
          device_id: string;
          id: string;
          revision: number;
          text: string;
          updated_at: string;
          workout_instance_id: string;
          workspace_id: string;
        };
        Insert: {
          author_user_id: string;
          created_at?: string;
          created_by?: string | null;
          device_id: string;
          id: string;
          revision?: number;
          text: string;
          updated_at?: string;
          workout_instance_id: string;
          workspace_id: string;
        };
        Update: {
          author_user_id?: string;
          created_at?: string;
          created_by?: string | null;
          device_id?: string;
          id?: string;
          revision?: number;
          text?: string;
          updated_at?: string;
          workout_instance_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_notes_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_notes_workspace_id_workout_instance_id_fkey';
            columns: ['workspace_id', 'workout_instance_id'];
            isOneToOne: false;
            referencedRelation: 'workout_instances';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      set_results: {
        Row: {
          author_user_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          device_id: string;
          id: string;
          position: number;
          reps: number | null;
          requested_position: number | null;
          revision: number;
          seconds: number | null;
          updated_at: string;
          weight_g: number | null;
          workout_exercise_id: string;
          workout_instance_id: string;
          workspace_id: string;
        };
        Insert: {
          author_user_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          device_id: string;
          id: string;
          position: number;
          reps?: number | null;
          requested_position?: number | null;
          revision?: number;
          seconds?: number | null;
          updated_at?: string;
          weight_g?: number | null;
          workout_exercise_id: string;
          workout_instance_id: string;
          workspace_id: string;
        };
        Update: {
          author_user_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          device_id?: string;
          id?: string;
          position?: number;
          reps?: number | null;
          requested_position?: number | null;
          revision?: number;
          seconds?: number | null;
          updated_at?: string;
          weight_g?: number | null;
          workout_exercise_id?: string;
          workout_instance_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'set_results_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'set_results_workspace_id_workout_instance_id_workout_exerc_fkey';
            columns: [
              'workspace_id',
              'workout_instance_id',
              'workout_exercise_id',
            ];
            isOneToOne: false;
            referencedRelation: 'workout_exercises';
            referencedColumns: ['workspace_id', 'workout_instance_id', 'id'];
          },
        ];
      };
      sync_operations: {
        Row: {
          applied_at: string;
          base_revision: number;
          created_at: string;
          created_by: string | null;
          device_id: string;
          entity_id: string;
          envelope: Json | null;
          kind: string;
          operation_id: string;
          result: NonNullable<Json>;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          applied_at?: string;
          base_revision: number;
          created_at?: string;
          created_by?: string | null;
          device_id: string;
          entity_id: string;
          envelope?: Json | null;
          kind: string;
          operation_id: string;
          result: NonNullable<Json>;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          applied_at?: string;
          base_revision?: number;
          created_at?: string;
          created_by?: string | null;
          device_id?: string;
          entity_id?: string;
          envelope?: Json | null;
          kind?: string;
          operation_id?: string;
          result?: NonNullable<Json>;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sync_operations_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      template_exercises: {
        Row: {
          created_at: string;
          created_by: string | null;
          exercise_id: string;
          id: string;
          note: string | null;
          planned_reps: string | null;
          planned_seconds: string | null;
          planned_sets: number;
          planned_weight_g: number | null;
          position: number;
          rest_seconds: number;
          revision: number;
          template_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          exercise_id: string;
          id?: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets: number;
          planned_weight_g?: number | null;
          position: number;
          rest_seconds?: number;
          revision?: number;
          template_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          exercise_id?: string;
          id?: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets?: number;
          planned_weight_g?: number | null;
          position?: number;
          rest_seconds?: number;
          revision?: number;
          template_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'template_exercises_workspace_id_exercise_id_fkey';
            columns: ['workspace_id', 'exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'template_exercises_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'template_exercises_workspace_id_template_id_fkey';
            columns: ['workspace_id', 'template_id'];
            isOneToOne: false;
            referencedRelation: 'workout_templates';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      trainer_workspaces: {
        Row: {
          created_at: string;
          created_by: string | null;
          day_end: string;
          day_start: string;
          id: string;
          name: string;
          owner_user_id: string;
          revision: number;
          timezone: string;
          training_focus: string[];
          updated_at: string;
          usual_session_minutes: number;
          working_days: number[];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          day_end?: string;
          day_start?: string;
          id?: string;
          name: string;
          owner_user_id: string;
          revision?: number;
          timezone?: string;
          training_focus?: string[];
          updated_at?: string;
          usual_session_minutes?: number;
          working_days?: number[];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          day_end?: string;
          day_start?: string;
          id?: string;
          name?: string;
          owner_user_id?: string;
          revision?: number;
          timezone?: string;
          training_focus?: string[];
          updated_at?: string;
          usual_session_minutes?: number;
          working_days?: number[];
        };
        Relationships: [];
      };
      workout_correction_drafts: {
        Row: {
          applied_at: string | null;
          applied_request_id: string | null;
          created_at: string;
          id: string;
          operation: NonNullable<Json>;
          workout_instance_id: string;
          workspace_id: string;
        };
        Insert: {
          applied_at?: string | null;
          applied_request_id?: string | null;
          created_at?: string;
          id?: string;
          operation: NonNullable<Json>;
          workout_instance_id: string;
          workspace_id: string;
        };
        Update: {
          applied_at?: string | null;
          applied_request_id?: string | null;
          created_at?: string;
          id?: string;
          operation?: NonNullable<Json>;
          workout_instance_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_correction_drafts_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_correction_drafts_workspace_id_workout_instance_id_fkey';
            columns: ['workspace_id', 'workout_instance_id'];
            isOneToOne: false;
            referencedRelation: 'workout_instances';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      workout_exercises: {
        Row: {
          bodyweight_snapshot: boolean;
          created_at: string;
          created_by: string | null;
          equipment_snapshot: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          id: string;
          instructions_snapshot: string[];
          last_correction_request_id: string | null;
          measure_snapshot: string;
          muscle_group_snapshot: string;
          note: string | null;
          planned_reps: string | null;
          planned_seconds: string | null;
          planned_sets: number;
          planned_weight_g: number | null;
          position: number;
          replaced_from_id: string | null;
          rest_seconds: number;
          revision: number;
          skipped: boolean;
          source_device_id: string | null;
          source_key_snapshot: string | null;
          updated_at: string;
          workout_instance_id: string;
          workspace_id: string;
        };
        Insert: {
          bodyweight_snapshot: boolean;
          created_at?: string;
          created_by?: string | null;
          equipment_snapshot: string;
          exercise_id: string;
          exercise_name_snapshot: string;
          id: string;
          instructions_snapshot: string[];
          last_correction_request_id?: string | null;
          measure_snapshot: string;
          muscle_group_snapshot: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets: number;
          planned_weight_g?: number | null;
          position: number;
          replaced_from_id?: string | null;
          rest_seconds?: number;
          revision?: number;
          skipped?: boolean;
          source_device_id?: string | null;
          source_key_snapshot?: string | null;
          updated_at?: string;
          workout_instance_id: string;
          workspace_id: string;
        };
        Update: {
          bodyweight_snapshot?: boolean;
          created_at?: string;
          created_by?: string | null;
          equipment_snapshot?: string;
          exercise_id?: string;
          exercise_name_snapshot?: string;
          id?: string;
          instructions_snapshot?: string[];
          last_correction_request_id?: string | null;
          measure_snapshot?: string;
          muscle_group_snapshot?: string;
          note?: string | null;
          planned_reps?: string | null;
          planned_seconds?: string | null;
          planned_sets?: number;
          planned_weight_g?: number | null;
          position?: number;
          replaced_from_id?: string | null;
          rest_seconds?: number;
          revision?: number;
          skipped?: boolean;
          source_device_id?: string | null;
          source_key_snapshot?: string | null;
          updated_at?: string;
          workout_instance_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_workspace_id_exercise_id_fkey';
            columns: ['workspace_id', 'exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'workout_exercises_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_exercises_workspace_id_workout_instance_id_fkey';
            columns: ['workspace_id', 'workout_instance_id'];
            isOneToOne: false;
            referencedRelation: 'workout_instances';
            referencedColumns: ['workspace_id', 'id'];
          },
          {
            foreignKeyName: 'workout_exercises_workspace_id_workout_instance_id_replace_fkey';
            columns: [
              'workspace_id',
              'workout_instance_id',
              'replaced_from_id',
            ];
            isOneToOne: false;
            referencedRelation: 'workout_exercises';
            referencedColumns: ['workspace_id', 'workout_instance_id', 'id'];
          },
        ];
      };
      workout_instances: {
        Row: {
          booking_id: string;
          client_record_id: string;
          created_at: string;
          created_by: string | null;
          finished_at: string | null;
          id: string;
          last_correction_request_id: string | null;
          revision: number;
          source_program_id: string | null;
          source_program_revision: number | null;
          started_at: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          booking_id: string;
          client_record_id: string;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          id: string;
          last_correction_request_id?: string | null;
          revision?: number;
          source_program_id?: string | null;
          source_program_revision?: number | null;
          started_at?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          booking_id?: string;
          client_record_id?: string;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          id?: string;
          last_correction_request_id?: string | null;
          revision?: number;
          source_program_id?: string | null;
          source_program_revision?: number | null;
          started_at?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_instances_workspace_id_booking_id_client_record_id_fkey';
            columns: ['workspace_id', 'booking_id', 'client_record_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['workspace_id', 'id', 'client_record_id'];
          },
          {
            foreignKeyName: 'workout_instances_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_instances_workspace_id_source_program_id_client_re_fkey';
            columns: ['workspace_id', 'source_program_id', 'client_record_id'];
            isOneToOne: false;
            referencedRelation: 'client_programs';
            referencedColumns: ['workspace_id', 'id', 'client_record_id'];
          },
        ];
      };
      workout_sync_conflicts: {
        Row: {
          current_version: NonNullable<Json>;
          entity_id: string;
          expected_revision: number;
          id: string;
          incoming_operation: NonNullable<Json>;
          kind: string;
          resolved_at: string | null;
          selected_version: string | null;
          workout_instance_id: string;
          workspace_id: string;
        };
        Insert: {
          current_version: NonNullable<Json>;
          entity_id: string;
          expected_revision: number;
          id?: string;
          incoming_operation: NonNullable<Json>;
          kind: string;
          resolved_at?: string | null;
          selected_version?: string | null;
          workout_instance_id: string;
          workspace_id: string;
        };
        Update: {
          current_version?: NonNullable<Json>;
          entity_id?: string;
          expected_revision?: number;
          id?: string;
          incoming_operation?: NonNullable<Json>;
          kind?: string;
          resolved_at?: string | null;
          selected_version?: string | null;
          workout_instance_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sync_conflicts_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sync_conflicts_workspace_id_workout_instance_id_fkey';
            columns: ['workspace_id', 'workout_instance_id'];
            isOneToOne: false;
            referencedRelation: 'workout_instances';
            referencedColumns: ['workspace_id', 'id'];
          },
        ];
      };
      workout_templates: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          name: string;
          name_normalized: string | null;
          revision: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name: string;
          name_normalized?: never;
          revision?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name?: string;
          name_normalized?: never;
          revision?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_templates_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'trainer_workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_booking_reschedule: {
        Args: {
          p_expected_booking_revision: number;
          p_expected_proposal_revision: number;
          p_proposal_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      accept_invitation: {
        Args: {
          p_token: string;
        };
        Returns: Json;
      };
      apply_operations: {
        Args: {
          p_operations: Json;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      apply_workout_correction: {
        Args: {
          p_actor_id: string;
          p_draft_id: string;
          p_expected_entity_revision: number;
          p_expected_exercise_revision?: number;
          p_expected_workout_revision: number;
          p_request_id: string;
          p_workout_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      archive_workout_template: {
        Args: {
          p_expected_revision: number;
          p_request_id: string;
          p_template_id: string;
        };
        Returns: Json;
      };
      assign_client_program: {
        Args: {
          p_client_record_id: string;
          p_expected_template_revision: number;
          p_request_id: string;
          p_template_id: string;
        };
        Returns: Json;
      };
      bind_attendance_purchase: {
        Args: {
          p_attendance_id: string;
          p_expected_attendance_revision: number;
          p_expected_booking_revision: number;
          p_purchase_id?: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      cancel_booking: {
        Args: {
          p_booking_id: string;
          p_expected_revision: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      canonicalize_library_name: {
        Args: {
          input_name: string;
        };
        Returns: string;
      };
      charge_late_cancellation: {
        Args: {
          p_booking_id: string;
          p_expected_booking_revision: number;
          p_purchase_id?: string;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      complete_trainer_onboarding: {
        Args: {
          display_name: string;
          ends_at?: string;
          first_client_name?: string;
          first_client_phone?: string;
          selected_days?: number[];
          selected_focus?: string[];
          session_minutes?: number;
          starts_at?: string;
          workspace_name: string;
        };
        Returns: Json;
      };
      confirm_booking: {
        Args: {
          p_booking_id: string;
          p_expected_revision: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      counter_booking_reschedule: {
        Args: {
          p_expected_booking_revision: number;
          p_expected_proposal_revision: number;
          p_proposal_id: string;
          p_proposed_starts_at: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      create_booking_set: {
        Args: {
          p_client_record_ids: string[];
          p_collision_ack: boolean;
          p_ends_at: string;
          p_request_id: string;
          p_starts_at: string;
        };
        Returns: Json;
      };
      create_booking_set_with_plan: {
        Args: {
          p_client_record_ids: string[];
          p_collision_ack: boolean;
          p_ends_at: string;
          p_expected_template_revision: number;
          p_request_id: string;
          p_starts_at: string;
          p_template_id: string;
        };
        Returns: Json;
      };
      create_client_purchase: {
        Args: {
          p_client_record_id: string;
          p_expires_on?: string;
          p_price_minor: number;
          p_request_id: string;
          p_title: string;
          p_units: number;
        };
        Returns: Json;
      };
      create_client_record: {
        Args: {
          client_name: string;
          client_phone: string;
          request_id: string;
        };
        Returns: Json;
      };
      decline_booking_reschedule: {
        Args: {
          p_expected_booking_revision: number;
          p_expected_proposal_revision: number;
          p_proposal_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      export_trainer_workspace: {
        Args: {
          p_workspace_id: string;
        };
        Returns: Json;
      };
      get_my_client_overview: {
        Args: {
          p_client_record_id: string;
          p_ends_on: string;
          p_starts_on: string;
        };
        Returns: Json;
      };
      get_my_client_schedule_context: {
        Args: {
          p_client_record_id: string;
        };
        Returns: Json;
      };
      get_my_client_schedule_proposals: {
        Args: {
          p_client_record_id: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          author_role: string;
          base_revision: number;
          booking_id: string;
          created_at: string;
          id: string;
          proposed_ends_at: string;
          proposed_starts_at: string;
          revision: number;
          status: string;
          updated_at: string;
          workspace_id: string;
        }[];
      };
      get_my_workspace_schedule_proposals: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_workspace_id: string;
        };
        Returns: {
          author_role: string;
          base_revision: number;
          booking_id: string;
          created_at: string;
          id: string;
          proposed_ends_at: string;
          proposed_starts_at: string;
          revision: number;
          status: string;
          updated_at: string;
          workspace_id: string;
        }[];
      };
      get_workout_correction: {
        Args: {
          p_actor_id: string;
          p_draft_id: string;
          p_workout_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      is_workspace_owner: {
        Args: {
          target_workspace_id: string;
        };
        Returns: boolean;
      };
      issue_client_invitation: {
        Args: {
          p_client_record_id: string;
          p_request_id: string;
          p_token: string;
        };
        Returns: Json;
      };
      list_my_client_connections: {
        Args: Record<PropertyKey, never>;
        Returns: {
          client_name: string;
          client_record_id: string;
          trainer_name: string;
          workspace_id: string;
        }[];
      };
      list_workout_corrections: {
        Args: {
          p_actor_id: string;
          p_workout_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      mark_attended: {
        Args: {
          p_booking_id: string;
          p_charge?: boolean;
          p_expected_booking_revision: number;
          p_purchase_id?: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      mark_no_show: {
        Args: {
          p_booking_id: string;
          p_expected_booking_revision: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      mark_notification_read: {
        Args: {
          p_notification_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      my_client_record_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      normalize_library_name: {
        Args: {
          input_name: string;
        };
        Returns: string;
      };
      notification_feed: {
        Args: {
          p_before_at?: string;
          p_before_id?: string;
          p_client_record_id?: string;
          p_limit?: number;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      notification_target: {
        Args: {
          p_notification_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      prepare_workout_journal: {
        Args: {
          p_booking_id: string;
          p_request_id: string;
          p_workout_id: string;
        };
        Returns: Json;
      };
      propose_booking_reschedule: {
        Args: {
          p_booking_id: string;
          p_expected_booking_revision: number;
          p_proposed_starts_at: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      record_client_payment: {
        Args: {
          p_amount_minor: number;
          p_method: string;
          p_paid_on: string;
          p_purchase_id: string;
          p_reason?: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      resolve_booking_reschedule_request: {
        Args: {
          p_booking_id: string;
          p_command: string;
          p_expected_booking_revision: number;
          p_expected_proposal_revision: number;
          p_proposal_id: string;
          p_proposed_starts_at: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      resolve_booking_status_request: {
        Args: {
          p_booking_id: string;
          p_command: string;
          p_expected_revision: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      reverse_client_payment: {
        Args: {
          p_payment_entry_id: string;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      revoke_client_invitation: {
        Args: {
          p_invitation_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_workout_template: {
        Args: {
          p_description: string;
          p_exercises: Json;
          p_expected_revision: number;
          p_name: string;
          p_request_id: string;
          p_template_id: string;
        };
        Returns: Json;
      };
      search_exercises: {
        Args: {
          search_query: string;
        };
        Returns: {
          aliases: string[];
          archived_at: string | null;
          bodyweight: boolean;
          created_at: string;
          created_by: string | null;
          equipment: string;
          id: string;
          instructions: string[];
          measure: string;
          muscle_group: string;
          name: string;
          name_normalized: string | null;
          revision: number;
          source_key: string | null;
          updated_at: string;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'exercises';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      undo_attendance: {
        Args: {
          p_attendance_id: string;
          p_expected_attendance_revision: number;
          p_expected_booking_revision: number;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      withdraw_booking_reschedule: {
        Args: {
          p_expected_booking_revision: number;
          p_expected_proposal_revision: number;
          p_proposal_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];
export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;
export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;
export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;
export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;
export const Constants = {
  public: {
    Enums: {},
  },
} as const;
