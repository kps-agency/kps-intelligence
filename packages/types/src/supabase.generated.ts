export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_analyses: {
        Row: {
          confidence: number | null
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["ai_analysis_kind"]
          model: string
          prompt_version: string
          request_id: string
          result: Json | null
          status: Database["public"]["Enums"]["ai_analysis_status"]
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ai_analysis_kind"]
          model: string
          prompt_version: string
          request_id: string
          result?: Json | null
          status: Database["public"]["Enums"]["ai_analysis_status"]
        }
        Update: {
          confidence?: number | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_analysis_kind"]
          model?: string
          prompt_version?: string
          request_id?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["ai_analysis_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      availability: {
        Row: {
          available_from: string | null
          capacity_hours_per_week: number | null
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          available_from?: string | null
          capacity_hours_per_week?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          available_from?: string | null
          capacity_hours_per_week?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          email: string | null
          id: string
          industry: string | null
          notes: string | null
          phone: string | null
          source: Database["public"]["Enums"]["request_source"] | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          company_name: string
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["request_source"] | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["request_source"] | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          first_name: string
          id: string
          is_primary: boolean
          last_name: string
          phone: string | null
          phone_digits: string | null
          position: string | null
          updated_at: string
          whatsapp: string | null
          whatsapp_digits: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          is_primary?: boolean
          last_name: string
          phone?: string | null
          phone_digits?: string | null
          position?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_digits?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean
          last_name?: string
          phone?: string | null
          phone_digits?: string | null
          position?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_digits?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["conversation_channel"]
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_message_id: string | null
          external_thread_id: string | null
          from_address: string | null
          from_name: string | null
          id: string
          sent_at: string | null
          subject: string | null
          to_address: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["conversation_channel"]
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_message_id?: string | null
          external_thread_id?: string | null
          from_address?: string | null
          from_name?: string | null
          id?: string
          sent_at?: string | null
          subject?: string | null
          to_address?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["conversation_channel"]
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_message_id?: string | null
          external_thread_id?: string | null
          from_address?: string | null
          from_name?: string | null
          id?: string
          sent_at?: string | null
          subject?: string | null
          to_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: Database["public"]["Enums"]["conversation_channel"]
          client_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          mission_id: string | null
          opportunity_id: string | null
          request_id: string | null
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["conversation_channel"]
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          opportunity_id?: string | null
          request_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["conversation_channel"]
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          opportunity_id?: string | null
          request_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          mime_type?: string
          name?: string
          size?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ingestion_state: {
        Row: {
          id: boolean
          last_error: string | null
          last_polled_at: string | null
          last_uid: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          last_uid?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          last_uid?: number
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["event_actor_type"]
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json
          request_id: string | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["event_actor_type"]
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          payload?: Json
          request_id?: string | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["event_actor_type"]
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json
          request_id?: string | null
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          conditional_logic: Json | null
          created_at: string
          form_step_id: string
          id: string
          key: string
          label: string
          options: Json | null
          order_index: number
          required: boolean
          type: Database["public"]["Enums"]["form_field_type"]
          updated_at: string
          validation: Json | null
        }
        Insert: {
          conditional_logic?: Json | null
          created_at?: string
          form_step_id: string
          id?: string
          key: string
          label: string
          options?: Json | null
          order_index: number
          required?: boolean
          type: Database["public"]["Enums"]["form_field_type"]
          updated_at?: string
          validation?: Json | null
        }
        Update: {
          conditional_logic?: Json | null
          created_at?: string
          form_step_id?: string
          id?: string
          key?: string
          label?: string
          options?: Json | null
          order_index?: number
          required?: boolean
          type?: Database["public"]["Enums"]["form_field_type"]
          updated_at?: string
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_step_id_fkey"
            columns: ["form_step_id"]
            isOneToOne: false
            referencedRelation: "form_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          created_at: string
          form_field_id: string
          id: string
          qualification_session_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          form_field_id: string
          id?: string
          qualification_session_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          form_field_id?: string
          id?: string
          qualification_session_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_form_field_id_fkey"
            columns: ["form_field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_qualification_session_id_fkey"
            columns: ["qualification_session_id"]
            isOneToOne: false
            referencedRelation: "qualification_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_steps: {
        Row: {
          created_at: string
          form_id: string
          id: string
          order_index: number
          title: string
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          order_index: number
          title: string
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          order_index?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_steps_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          service_id: string | null
          slug: string
          status: Database["public"]["Enums"]["form_status"]
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          service_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["form_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          service_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["form_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "forms_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_results: {
        Row: {
          created_at: string
          explanation: Json
          id: string
          rank: number
          request_id: string
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          explanation: Json
          id?: string
          rank?: number
          request_id: string
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          explanation?: Json
          id?: string
          rank?: number
          request_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matching_results_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_members: {
        Row: {
          created_at: string
          id: string
          mission_id: string
          role_on_mission: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mission_id: string
          role_on_mission?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mission_id?: string
          role_on_mission?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_members_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          budget: number | null
          client_id: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          opportunity_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          project_manager_id: string | null
          service_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["mission_status"]
          updated_at: string
        }
        Insert: {
          budget?: number | null
          client_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          project_manager_id?: string | null
          service_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          updated_at?: string
        }
        Update: {
          budget?: number | null
          client_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          project_manager_id?: string | null
          service_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          enabled: boolean
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          enabled?: boolean
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          enabled?: boolean
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          key: string
          language: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          key: string
          language: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          key?: string
          language?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          error: string | null
          event_id: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          is_read: boolean
          link: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          is_read?: boolean
          link?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          is_read?: boolean
          link?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          client_id: string
          created_at: string
          currency: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          owner_user_id: string | null
          request_id: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["opportunity_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          currency?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          owner_user_id?: string | null
          request_id?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          currency?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          owner_user_id?: string | null
          request_id?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      qualification_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          expires_at: string
          form_id: string
          id: string
          language: string | null
          last_activity_at: string | null
          opened_at: string | null
          request_id: string
          sent_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["qualification_session_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          expires_at: string
          form_id: string
          id?: string
          language?: string | null
          last_activity_at?: string | null
          opened_at?: string | null
          request_id: string
          sent_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["qualification_session_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          form_id?: string
          id?: string
          language?: string | null
          last_activity_at?: string | null
          opened_at?: string | null
          request_id?: string
          sent_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["qualification_session_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualification_sessions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualification_sessions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          description: string
          discount_percent: number
          id: string
          order_index: number
          quantity: number
          quote_id: string
          total: number
          unit_price: number
        }
        Insert: {
          description: string
          discount_percent?: number
          id?: string
          order_index: number
          quantity?: number
          quote_id: string
          total: number
          unit_price: number
        }
        Update: {
          description?: string
          discount_percent?: number
          id?: string
          order_index?: number
          quantity?: number
          quote_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          quote_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id: string
          snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          discount: number
          id: string
          opportunity_id: string
          reference: string
          rejected_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_rate: number
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          discount?: number
          id?: string
          opportunity_id: string
          reference: string
          rejected_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          discount?: number
          id?: string
          opportunity_id?: string
          reference?: string
          rejected_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      request_reference_counters: {
        Row: {
          last_value: number
          year: number
        }
        Insert: {
          last_value?: number
          year: number
        }
        Update: {
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      request_team_members: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          request_id: string
          score: number | null
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          request_id: string
          score?: number | null
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          request_id?: string
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_team_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_team_members_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          ai_confidence: number | null
          assigned_user_id: string | null
          channel: string | null
          client_id: string | null
          contact_id: string | null
          country: string | null
          created_at: string
          detected_service_id: string | null
          detected_subservice: string | null
          email_message_id: string | null
          email_thread_id: string | null
          id: string
          language: string | null
          original_message: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          qualification_status: string | null
          reference: string
          source: Database["public"]["Enums"]["request_source"]
          status: Database["public"]["Enums"]["request_status"]
          subject: string
          updated_at: string
          urgency: Database["public"]["Enums"]["priority_level"] | null
          website_submission_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          ai_confidence?: number | null
          assigned_user_id?: string | null
          channel?: string | null
          client_id?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          detected_service_id?: string | null
          detected_subservice?: string | null
          email_message_id?: string | null
          email_thread_id?: string | null
          id?: string
          language?: string | null
          original_message?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          qualification_status?: string | null
          reference?: string
          source: Database["public"]["Enums"]["request_source"]
          status?: Database["public"]["Enums"]["request_status"]
          subject: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["priority_level"] | null
          website_submission_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          ai_confidence?: number | null
          assigned_user_id?: string | null
          channel?: string | null
          client_id?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          detected_service_id?: string | null
          detected_subservice?: string | null
          email_message_id?: string | null
          email_thread_id?: string | null
          id?: string
          language?: string | null
          original_message?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          qualification_status?: string | null
          reference?: string
          source?: Database["public"]["Enums"]["request_source"]
          status?: Database["public"]["Enums"]["request_status"]
          subject?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["priority_level"] | null
          website_submission_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_detected_service_id_fkey"
            columns: ["detected_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          qualification_form_id: string | null
          slug: Database["public"]["Enums"]["service_slug"]
          status: Database["public"]["Enums"]["service_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          qualification_form_id?: string | null
          slug: Database["public"]["Enums"]["service_slug"]
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          qualification_form_id?: string | null
          slug?: Database["public"]["Enums"]["service_slug"]
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_qualification_form_id_fkey"
            columns: ["qualification_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          mission_id: string
          priority: Database["public"]["Enums"]["priority_level"] | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          mission_id: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          mission_id?: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_skills: {
        Row: {
          created_at: string
          id: string
          proficiency_level: number
          skill_id: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          proficiency_level: number
          skill_id: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          proficiency_level?: number
          skill_id?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          email: string
          expertise: string | null
          first_name: string
          id: string
          language: string
          languages: string[]
          last_name: string
          phone: string | null
          role_id: string
          status: Database["public"]["Enums"]["user_status"]
          timezone: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email: string
          expertise?: string | null
          first_name: string
          id: string
          language?: string
          languages?: string[]
          last_name: string
          phone?: string | null
          role_id: string
          status?: Database["public"]["Enums"]["user_status"]
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email?: string
          expertise?: string | null
          first_name?: string
          id?: string
          language?: string
          languages?: string[]
          last_name?: string
          phone?: string | null
          role_id?: string
          status?: Database["public"]["Enums"]["user_status"]
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          error: string | null
          id: string
          next_step_at: string | null
          request_id: string | null
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          steps_log: Json
          subject_id: string | null
          subject_type: string | null
          triggering_event_id: string | null
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          error?: string | null
          id?: string
          next_step_at?: string | null
          request_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          steps_log?: Json
          subject_id?: string | null
          subject_type?: string | null
          triggering_event_id?: string | null
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          error?: string | null
          id?: string
          next_step_at?: string | null
          request_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          steps_log?: Json
          subject_id?: string | null
          subject_type?: string | null
          triggering_event_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_triggering_event_id_fkey"
            columns: ["triggering_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          cancel_on: Database["public"]["Enums"]["event_type"][]
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string | null
          name: string
          trigger_event: Database["public"]["Enums"]["event_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actions?: Json
          cancel_on?: Database["public"]["Enums"]["event_type"][]
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string | null
          name: string
          trigger_event: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actions?: Json
          cancel_on?: Database["public"]["Enums"]["event_type"][]
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string | null
          name?: string
          trigger_event?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_request_reference: { Args: never; Returns: string }
      get_role_permissions: { Args: { p_role_id: string }; Returns: string[] }
      reorder_form_fields: {
        Args: { p_field_ids: string[]; p_form_step_id: string }
        Returns: undefined
      }
      reorder_form_steps: {
        Args: { p_form_id: string; p_step_ids: string[] }
        Returns: undefined
      }
      replace_user_skills: {
        Args: { p_skills: Json; p_user_id: string }
        Returns: undefined
      }
      set_primary_contact: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_analysis_kind: "REQUEST_ANALYSIS" | "QUALIFICATION_ANALYSIS"
      ai_analysis_status: "COMPLETED" | "FAILED"
      availability_status: "AVAILABLE" | "BUSY" | "UNAVAILABLE"
      client_status: "PROSPECT" | "ACTIVE" | "INACTIVE" | "CHURNED"
      conversation_channel: "EMAIL" | "WHATSAPP" | "SYSTEM"
      event_actor_type: "SYSTEM" | "AI" | "USER" | "AUTOMATION"
      event_type:
        | "REQUEST_RECEIVED"
        | "REQUEST_ANALYSIS_STARTED"
        | "REQUEST_ANALYSIS_COMPLETED"
        | "SERVICE_DETECTED"
        | "QUALIFICATION_REQUIRED"
        | "QUALIFICATION_LINK_CREATED"
        | "QUALIFICATION_LINK_SENT"
        | "QUALIFICATION_LINK_OPENED"
        | "FORM_STARTED"
        | "FORM_PROGRESS_UPDATED"
        | "FORM_COMPLETED"
        | "QUALIFICATION_ANALYSIS_STARTED"
        | "QUALIFICATION_ANALYSIS_COMPLETED"
        | "REQUEST_QUALIFIED"
        | "REQUEST_UNQUALIFIED"
        | "MATCHING_STARTED"
        | "MATCHING_COMPLETED"
        | "TEAM_MEMBER_RECOMMENDED"
        | "TEAM_MEMBER_ASSIGNED"
        | "QUOTE_REQUIRED"
        | "QUOTE_CREATED"
        | "QUOTE_SENT"
        | "QUOTE_ACCEPTED"
        | "QUOTE_REJECTED"
        | "MISSION_CREATED"
        | "MISSION_ASSIGNED"
        | "MISSION_STATUS_CHANGED"
        | "MISSION_BLOCKED"
        | "REQUEST_CLOSED"
        | "AI_ANALYSIS_FAILED"
        | "REQUEST_STATUS_CHANGED"
        | "QUALIFICATION_LINK_REVOKED"
        | "QUALIFICATION_LINK_EXTENDED"
        | "QUALIFICATION_LINK_EXPIRED"
        | "CONVERSATION_MESSAGE_RECEIVED"
        | "REQUEST_ASSIGNED"
        | "TEAM_NOTIFIED"
        | "QUALIFICATION_REMINDER_SENT"
        | "TEAM_MEMBER_UNASSIGNED"
      form_field_type:
        | "TEXT"
        | "TEXTAREA"
        | "EMAIL"
        | "PHONE"
        | "NUMBER"
        | "SELECT"
        | "MULTI_SELECT"
        | "RADIO"
        | "CHECKBOX"
        | "DATE"
        | "URL"
        | "FILE"
        | "CURRENCY"
        | "RANGE"
      form_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      message_direction: "INBOUND" | "OUTBOUND"
      mission_status:
        | "PLANNED"
        | "IN_PROGRESS"
        | "BLOCKED"
        | "ON_HOLD"
        | "COMPLETED"
        | "CANCELLED"
      notification_channel: "IN_APP" | "EMAIL" | "WHATSAPP"
      opportunity_status:
        | "NEW"
        | "QUALIFIED"
        | "PROPOSAL_REQUIRED"
        | "PROPOSAL_SENT"
        | "NEGOTIATION"
        | "WON"
        | "LOST"
      priority_level: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
      qualification_session_status:
        | "CREATED"
        | "SENT"
        | "OPENED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "EXPIRED"
        | "CANCELLED"
      quote_status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"
      request_source: "WEBSITE" | "EMAIL" | "WHATSAPP" | "API" | "MANUAL"
      request_status:
        | "NEW"
        | "RECEIVED"
        | "AI_ANALYZING"
        | "ANALYZED"
        | "FORM_PENDING"
        | "FORM_SENT"
        | "WAITING_CLIENT"
        | "RESPONSE_RECEIVED"
        | "QUALIFYING"
        | "QUALIFIED"
        | "UNQUALIFIED"
        | "MATCHING"
        | "ASSIGNED"
        | "QUOTE_PENDING"
        | "QUOTE_SENT"
        | "NEGOTIATION"
        | "WON"
        | "LOST"
        | "CONVERTED_TO_MISSION"
        | "CLOSED"
      service_slug:
        | "WEBSITE"
        | "ECOMMERCE"
        | "SEO"
        | "MAINTENANCE"
        | "BUSINESS_APPLICATION"
        | "MOBILE_APP"
        | "AI"
        | "AUTOMATION"
        | "SOFTWARE"
        | "CONSULTING"
      service_status: "ACTIVE" | "INACTIVE" | "COMING_SOON"
      task_status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED"
      user_status: "ACTIVE" | "INACTIVE" | "INVITED" | "SUSPENDED"
      workflow_run_status:
        | "PENDING"
        | "RUNNING"
        | "COMPLETED"
        | "FAILED"
        | "WAITING"
        | "CANCELLED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_analysis_kind: ["REQUEST_ANALYSIS", "QUALIFICATION_ANALYSIS"],
      ai_analysis_status: ["COMPLETED", "FAILED"],
      availability_status: ["AVAILABLE", "BUSY", "UNAVAILABLE"],
      client_status: ["PROSPECT", "ACTIVE", "INACTIVE", "CHURNED"],
      conversation_channel: ["EMAIL", "WHATSAPP", "SYSTEM"],
      event_actor_type: ["SYSTEM", "AI", "USER", "AUTOMATION"],
      event_type: [
        "REQUEST_RECEIVED",
        "REQUEST_ANALYSIS_STARTED",
        "REQUEST_ANALYSIS_COMPLETED",
        "SERVICE_DETECTED",
        "QUALIFICATION_REQUIRED",
        "QUALIFICATION_LINK_CREATED",
        "QUALIFICATION_LINK_SENT",
        "QUALIFICATION_LINK_OPENED",
        "FORM_STARTED",
        "FORM_PROGRESS_UPDATED",
        "FORM_COMPLETED",
        "QUALIFICATION_ANALYSIS_STARTED",
        "QUALIFICATION_ANALYSIS_COMPLETED",
        "REQUEST_QUALIFIED",
        "REQUEST_UNQUALIFIED",
        "MATCHING_STARTED",
        "MATCHING_COMPLETED",
        "TEAM_MEMBER_RECOMMENDED",
        "TEAM_MEMBER_ASSIGNED",
        "QUOTE_REQUIRED",
        "QUOTE_CREATED",
        "QUOTE_SENT",
        "QUOTE_ACCEPTED",
        "QUOTE_REJECTED",
        "MISSION_CREATED",
        "MISSION_ASSIGNED",
        "MISSION_STATUS_CHANGED",
        "MISSION_BLOCKED",
        "REQUEST_CLOSED",
        "AI_ANALYSIS_FAILED",
        "REQUEST_STATUS_CHANGED",
        "QUALIFICATION_LINK_REVOKED",
        "QUALIFICATION_LINK_EXTENDED",
        "QUALIFICATION_LINK_EXPIRED",
        "CONVERSATION_MESSAGE_RECEIVED",
        "REQUEST_ASSIGNED",
        "TEAM_NOTIFIED",
        "QUALIFICATION_REMINDER_SENT",
        "TEAM_MEMBER_UNASSIGNED",
      ],
      form_field_type: [
        "TEXT",
        "TEXTAREA",
        "EMAIL",
        "PHONE",
        "NUMBER",
        "SELECT",
        "MULTI_SELECT",
        "RADIO",
        "CHECKBOX",
        "DATE",
        "URL",
        "FILE",
        "CURRENCY",
        "RANGE",
      ],
      form_status: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      message_direction: ["INBOUND", "OUTBOUND"],
      mission_status: [
        "PLANNED",
        "IN_PROGRESS",
        "BLOCKED",
        "ON_HOLD",
        "COMPLETED",
        "CANCELLED",
      ],
      notification_channel: ["IN_APP", "EMAIL", "WHATSAPP"],
      opportunity_status: [
        "NEW",
        "QUALIFIED",
        "PROPOSAL_REQUIRED",
        "PROPOSAL_SENT",
        "NEGOTIATION",
        "WON",
        "LOST",
      ],
      priority_level: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      qualification_session_status: [
        "CREATED",
        "SENT",
        "OPENED",
        "IN_PROGRESS",
        "COMPLETED",
        "EXPIRED",
        "CANCELLED",
      ],
      quote_status: ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"],
      request_source: ["WEBSITE", "EMAIL", "WHATSAPP", "API", "MANUAL"],
      request_status: [
        "NEW",
        "RECEIVED",
        "AI_ANALYZING",
        "ANALYZED",
        "FORM_PENDING",
        "FORM_SENT",
        "WAITING_CLIENT",
        "RESPONSE_RECEIVED",
        "QUALIFYING",
        "QUALIFIED",
        "UNQUALIFIED",
        "MATCHING",
        "ASSIGNED",
        "QUOTE_PENDING",
        "QUOTE_SENT",
        "NEGOTIATION",
        "WON",
        "LOST",
        "CONVERTED_TO_MISSION",
        "CLOSED",
      ],
      service_slug: [
        "WEBSITE",
        "ECOMMERCE",
        "SEO",
        "MAINTENANCE",
        "BUSINESS_APPLICATION",
        "MOBILE_APP",
        "AI",
        "AUTOMATION",
        "SOFTWARE",
        "CONSULTING",
      ],
      service_status: ["ACTIVE", "INACTIVE", "COMING_SOON"],
      task_status: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"],
      user_status: ["ACTIVE", "INACTIVE", "INVITED", "SUSPENDED"],
      workflow_run_status: [
        "PENDING",
        "RUNNING",
        "COMPLETED",
        "FAILED",
        "WAITING",
        "CANCELLED",
      ],
    },
  },
} as const

