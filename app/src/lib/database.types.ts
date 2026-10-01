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
          id: string;
          name: string;
          owner_user_id: string;
          revision: number;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          owner_user_id: string;
          revision?: number;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          owner_user_id?: string;
          revision?: number;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
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
      canonicalize_library_name: {
        Args: {
          input_name: string;
        };
        Returns: string;
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
      is_workspace_owner: {
        Args: {
          target_workspace_id: string;
        };
        Returns: boolean;
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
