export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_cancellations: {
        Row: {
          cancelled_at: string
          cancelled_by: string
          consumed_at: string | null
          conversation_id: string
          id: string
        }
        Insert: {
          cancelled_at?: string
          cancelled_by: string
          consumed_at?: string | null
          conversation_id: string
          id?: string
        }
        Update: {
          cancelled_at?: string
          cancelled_by?: string
          consumed_at?: string | null
          conversation_id?: string
          id?: string
        }
        Relationships: []
      }
      agent_run_state: {
        Row: {
          conversation_id: string
          expected_next_action: string | null
          last_plan_signature: string | null
          last_screenshot_url: string | null
          last_tool: string | null
          owner_id: string
          repeat_count: number
          updated_at: string
        }
        Insert: {
          conversation_id: string
          expected_next_action?: string | null
          last_plan_signature?: string | null
          last_screenshot_url?: string | null
          last_tool?: string | null
          owner_id: string
          repeat_count?: number
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          expected_next_action?: string | null
          last_plan_signature?: string | null
          last_screenshot_url?: string | null
          last_tool?: string | null
          owner_id?: string
          repeat_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          encrypted_key: string | null
          id: string
          is_active: boolean
          label: string | null
          last_used_at: string | null
          owner_id: string
          provider: Database["public"]["Enums"]["ai_provider"]
        }
        Insert: {
          created_at?: string
          encrypted_key?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          owner_id: string
          provider: Database["public"]["Enums"]["ai_provider"]
        }
        Update: {
          created_at?: string
          encrypted_key?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          owner_id?: string
          provider?: Database["public"]["Enums"]["ai_provider"]
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          org_id: string | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      block_templates: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          imports: Json | null
          is_public: boolean | null
          name: string
          preview_emoji: string | null
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          imports?: Json | null
          is_public?: boolean | null
          name: string
          preview_emoji?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          imports?: Json | null
          is_public?: boolean | null
          name?: string
          preview_emoji?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      block_usage_events: {
        Row: {
          block_slug: string
          created_at: string
          event: string
          id: string
          metadata: Json
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          block_slug: string
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          block_slug?: string
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_alerts: {
        Row: {
          alert_threshold_pct: number
          created_at: string
          id: string
          last_alert_at: string | null
          monthly_limit_usd: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          alert_threshold_pct?: number
          created_at?: string
          id?: string
          last_alert_at?: string | null
          monthly_limit_usd?: number
          owner_id: string
          updated_at?: string
        }
        Update: {
          alert_threshold_pct?: number
          created_at?: string
          id?: string
          last_alert_at?: string | null
          monthly_limit_usd?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          limit_usd: number
          message: string | null
          project_id: string | null
          read_at: string | null
          scope: string
          threshold_pct: number
          usage_usd: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          limit_usd: number
          message?: string | null
          project_id?: string | null
          read_at?: string | null
          scope: string
          threshold_pct: number
          usage_usd: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          limit_usd?: number
          message?: string | null
          project_id?: string | null
          read_at?: string | null
          scope?: string
          threshold_pct?: number
          usage_usd?: number
          user_id?: string
        }
        Relationships: []
      }
      capabilities: {
        Row: {
          category_icon: string
          category_id: string
          category_label: string
          category_vision: string | null
          completed_at: string | null
          created_at: string
          effort: Database["public"]["Enums"]["capability_effort"]
          files: string[]
          id: string
          info: string
          position: number
          priority: Database["public"]["Enums"]["capability_priority"]
          started_at: string | null
          status: Database["public"]["Enums"]["capability_status"]
          title: string
          updated_at: string
        }
        Insert: {
          category_icon: string
          category_id: string
          category_label: string
          category_vision?: string | null
          completed_at?: string | null
          created_at?: string
          effort?: Database["public"]["Enums"]["capability_effort"]
          files?: string[]
          id?: string
          info: string
          position?: number
          priority?: Database["public"]["Enums"]["capability_priority"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["capability_status"]
          title: string
          updated_at?: string
        }
        Update: {
          category_icon?: string
          category_id?: string
          category_label?: string
          category_vision?: string | null
          completed_at?: string | null
          created_at?: string
          effort?: Database["public"]["Enums"]["capability_effort"]
          files?: string[]
          id?: string
          info?: string
          position?: number
          priority?: Database["public"]["Enums"]["capability_priority"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["capability_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      category_prompts: {
        Row: {
          category_id: string
          prompt: string
          updated_at: string
        }
        Insert: {
          category_id: string
          prompt: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      code_blocks: {
        Row: {
          category: Database["public"]["Enums"]["block_category"]
          code: string
          created_at: string
          dependencies: string[]
          description: string
          id: string
          is_active: boolean
          popularity: number
          preview_url: string | null
          search_tsv: unknown
          sector: Database["public"]["Enums"]["block_sector"]
          slug: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["block_category"]
          code: string
          created_at?: string
          dependencies?: string[]
          description: string
          id?: string
          is_active?: boolean
          popularity?: number
          preview_url?: string | null
          search_tsv?: unknown
          sector?: Database["public"]["Enums"]["block_sector"]
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["block_category"]
          code?: string
          created_at?: string
          dependencies?: string[]
          description?: string
          id?: string
          is_active?: boolean
          popularity?: number
          preview_url?: string | null
          search_tsv?: unknown
          sector?: Database["public"]["Enums"]["block_sector"]
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          messages_since_summary: number
          org_id: string
          owner_id: string
          project_id: string | null
          summary: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          messages_since_summary?: number
          org_id: string
          owner_id: string
          project_id?: string | null
          summary?: string | null
          title?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          messages_since_summary?: number
          org_id?: string
          owner_id?: string
          project_id?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["credit_tx_kind"]
          metadata: Json
          reason: string | null
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["credit_tx_kind"]
          metadata?: Json
          reason?: string | null
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["credit_tx_kind"]
          metadata?: Json
          reason?: string | null
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      e2b_sandboxes: {
        Row: {
          created_at: string
          id: string
          last_active_at: string
          owner_id: string
          preview_url: string | null
          project_id: string
          sandbox_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_active_at?: string
          owner_id: string
          preview_url?: string | null
          project_id: string
          sandbox_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_active_at?: string
          owner_id?: string
          preview_url?: string | null
          project_id?: string
          sandbox_id?: string
          status?: string
        }
        Relationships: []
      }
      elena_ai_routing: {
        Row: {
          chat_model: string
          chat_provider: string
          code_model: string
          code_provider: string
          fallback_model: string
          fallback_provider: string
          image_model: string
          image_provider: string
          owner_id: string
          reasoning_model: string
          reasoning_provider: string
          scrape_model: string
          scrape_provider: string
          trivial_model: string
          trivial_provider: string
          updated_at: string
          vision_model: string
          vision_provider: string
        }
        Insert: {
          chat_model?: string
          chat_provider?: string
          code_model?: string
          code_provider?: string
          fallback_model?: string
          fallback_provider?: string
          image_model?: string
          image_provider?: string
          owner_id: string
          reasoning_model?: string
          reasoning_provider?: string
          scrape_model?: string
          scrape_provider?: string
          trivial_model?: string
          trivial_provider?: string
          updated_at?: string
          vision_model?: string
          vision_provider?: string
        }
        Update: {
          chat_model?: string
          chat_provider?: string
          code_model?: string
          code_provider?: string
          fallback_model?: string
          fallback_provider?: string
          image_model?: string
          image_provider?: string
          owner_id?: string
          reasoning_model?: string
          reasoning_provider?: string
          scrape_model?: string
          scrape_provider?: string
          trivial_model?: string
          trivial_provider?: string
          updated_at?: string
          vision_model?: string
          vision_provider?: string
        }
        Relationships: []
      }
      elena_lessons: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          is_fundamental: boolean
          last_used_at: string | null
          owner_id: string
          priority: number
          seed_key: string | null
          steps: Json
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_fundamental?: boolean
          last_used_at?: string | null
          owner_id: string
          priority?: number
          seed_key?: string | null
          steps?: Json
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_fundamental?: boolean
          last_used_at?: string | null
          owner_id?: string
          priority?: number
          seed_key?: string | null
          steps?: Json
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      elena_metrics: {
        Row: {
          cache_type: string | null
          conversation_id: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          latency_ms: number
          model: string | null
          prompt_name: string | null
          prompt_version: number | null
          success: boolean
          task_type: string | null
          tokens_input: number
          tokens_output: number
          user_id: string | null
        }
        Insert: {
          cache_type?: string | null
          conversation_id?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          latency_ms?: number
          model?: string | null
          prompt_name?: string | null
          prompt_version?: number | null
          success?: boolean
          task_type?: string | null
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
        }
        Update: {
          cache_type?: string | null
          conversation_id?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          latency_ms?: number
          model?: string | null
          prompt_name?: string | null
          prompt_version?: number | null
          success?: boolean
          task_type?: string | null
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
        }
        Relationships: []
      }
      elena_savings_log: {
        Row: {
          cache_read_tk: number
          cache_write_tk: number
          created_at: string
          dedup_parts: number
          dedup_saved_tk: number
          id: string
          input_tk: number
          model: string | null
          output_tk: number
          owner_id: string
          project_id: string
          route: string
          saved_usd: number
          trunc_parts: number
          trunc_saved_tk: number
        }
        Insert: {
          cache_read_tk?: number
          cache_write_tk?: number
          created_at?: string
          dedup_parts?: number
          dedup_saved_tk?: number
          id?: string
          input_tk?: number
          model?: string | null
          output_tk?: number
          owner_id: string
          project_id: string
          route?: string
          saved_usd?: number
          trunc_parts?: number
          trunc_saved_tk?: number
        }
        Update: {
          cache_read_tk?: number
          cache_write_tk?: number
          created_at?: string
          dedup_parts?: number
          dedup_saved_tk?: number
          id?: string
          input_tk?: number
          model?: string | null
          output_tk?: number
          owner_id?: string
          project_id?: string
          route?: string
          saved_usd?: number
          trunc_parts?: number
          trunc_saved_tk?: number
        }
        Relationships: []
      }
      elena_settings: {
        Row: {
          agent_model: string
          agent_provider: Database["public"]["Enums"]["ai_provider"]
          auto_summarize_after: number
          default_mode: Database["public"]["Enums"]["elena_mode"]
          fallback_chain: string[]
          fallback_enabled: boolean
          max_context_messages: number
          model_eco: string
          model_premium: string
          model_standard: string
          owner_id: string
          preferences: Json
          system_prompt_mobile: string
          system_prompt_webapp: string
          system_prompt_website: string
          updated_at: string
        }
        Insert: {
          agent_model?: string
          agent_provider?: Database["public"]["Enums"]["ai_provider"]
          auto_summarize_after?: number
          default_mode?: Database["public"]["Enums"]["elena_mode"]
          fallback_chain?: string[]
          fallback_enabled?: boolean
          max_context_messages?: number
          model_eco?: string
          model_premium?: string
          model_standard?: string
          owner_id: string
          preferences?: Json
          system_prompt_mobile?: string
          system_prompt_webapp?: string
          system_prompt_website?: string
          updated_at?: string
        }
        Update: {
          agent_model?: string
          agent_provider?: Database["public"]["Enums"]["ai_provider"]
          auto_summarize_after?: number
          default_mode?: Database["public"]["Enums"]["elena_mode"]
          fallback_chain?: string[]
          fallback_enabled?: boolean
          max_context_messages?: number
          model_eco?: string
          model_premium?: string
          model_standard?: string
          owner_id?: string
          preferences?: Json
          system_prompt_mobile?: string
          system_prompt_webapp?: string
          system_prompt_website?: string
          updated_at?: string
        }
        Relationships: []
      }
      error_events: {
        Row: {
          context: Json
          created_at: string
          id: string
          level: string
          message: string
          org_id: string | null
          resolved: boolean
          route: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message: string
          org_id?: string | null
          resolved?: boolean
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message?: string
          org_id?: string | null
          resolved?: boolean
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      external_keys: {
        Row: {
          created_at: string
          encrypted_value: string
          id: string
          is_active: boolean
          label: string | null
          last_used_at: string | null
          owner_id: string
          service: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_value: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          owner_id: string
          service: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_value?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          owner_id?: string
          service?: string
          updated_at?: string
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          author_id: string | null
          capability_id: string | null
          created_at: string
          description: string | null
          id: string
          status: Database["public"]["Enums"]["feature_request_status"]
          title: string
          updated_at: string
          votes_count: number
        }
        Insert: {
          author_id?: string | null
          capability_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["feature_request_status"]
          title: string
          updated_at?: string
          votes_count?: number
        }
        Update: {
          author_id?: string | null
          capability_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["feature_request_status"]
          title?: string
          updated_at?: string
          votes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_votes: {
        Row: {
          created_at: string
          feature_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_votes_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connections: {
        Row: {
          access_token_encrypted: string | null
          avatar_url: string | null
          created_at: string
          github_user_id: number
          github_username: string
          id: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          avatar_url?: string | null
          created_at?: string
          github_user_id: number
          github_username: string
          id?: string
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          avatar_url?: string | null
          created_at?: string
          github_user_id?: number
          github_username?: string
          id?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          org_id: string
          owner_id: string
          project_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["idea_status"]
          title: string
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          owner_id: string
          project_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["idea_status"]
          title: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          owner_id?: string
          project_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["idea_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      image_memory: {
        Row: {
          caption: string | null
          created_at: string
          embedding: string | null
          id: string
          image_url: string
          metadata: Json
          owner_id: string
          project_id: string | null
          source: string | null
          tags: string[] | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          image_url: string
          metadata?: Json
          owner_id: string
          project_id?: string | null
          source?: string | null
          tags?: string[] | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          image_url?: string
          metadata?: Json
          owner_id?: string
          project_id?: string | null
          source?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "image_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_catalog: {
        Row: {
          api_base_url: string | null
          auth_type: Database["public"]["Enums"]["integration_auth_type"]
          brand_color: string | null
          category: Database["public"]["Enums"]["integration_category"]
          common_actions: Json
          created_at: string
          description: string
          docs_url: string | null
          homepage_url: string | null
          icon: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          is_vip: boolean
          name: string
          oauth_authorize_url: string | null
          oauth_default_scopes: string[] | null
          oauth_token_url: string | null
          openapi_url: string | null
          popularity: number
          required_secrets: string[]
          slug: string
          updated_at: string
          usage_example: string | null
        }
        Insert: {
          api_base_url?: string | null
          auth_type: Database["public"]["Enums"]["integration_auth_type"]
          brand_color?: string | null
          category?: Database["public"]["Enums"]["integration_category"]
          common_actions?: Json
          created_at?: string
          description: string
          docs_url?: string | null
          homepage_url?: string | null
          icon?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_vip?: boolean
          name: string
          oauth_authorize_url?: string | null
          oauth_default_scopes?: string[] | null
          oauth_token_url?: string | null
          openapi_url?: string | null
          popularity?: number
          required_secrets?: string[]
          slug: string
          updated_at?: string
          usage_example?: string | null
        }
        Update: {
          api_base_url?: string | null
          auth_type?: Database["public"]["Enums"]["integration_auth_type"]
          brand_color?: string | null
          category?: Database["public"]["Enums"]["integration_category"]
          common_actions?: Json
          created_at?: string
          description?: string
          docs_url?: string | null
          homepage_url?: string | null
          icon?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_vip?: boolean
          name?: string
          oauth_authorize_url?: string | null
          oauth_default_scopes?: string[] | null
          oauth_token_url?: string | null
          openapi_url?: string | null
          popularity?: number
          required_secrets?: string[]
          slug?: string
          updated_at?: string
          usage_example?: string | null
        }
        Relationships: []
      }
      integration_oauth_states: {
        Row: {
          catalog_id: string
          code_verifier: string | null
          created_at: string
          expires_at: string
          owner_id: string
          project_id: string
          redirect_to: string | null
          state: string
        }
        Insert: {
          catalog_id: string
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          owner_id: string
          project_id: string
          redirect_to?: string | null
          state: string
        }
        Update: {
          catalog_id?: string
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          owner_id?: string
          project_id?: string
          redirect_to?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_oauth_states_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "integration_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_oauth_states_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          created_at: string
          encrypted_value: string
          expires_at: string | null
          id: string
          integration_id: string
          kind: Database["public"]["Enums"]["integration_secret_kind"]
          owner_id: string
          rotated_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_value: string
          expires_at?: string | null
          id?: string
          integration_id: string
          kind: Database["public"]["Enums"]["integration_secret_kind"]
          owner_id: string
          rotated_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_value?: string
          expires_at?: string | null
          id?: string
          integration_id?: string
          kind?: Database["public"]["Enums"]["integration_secret_kind"]
          owner_id?: string
          rotated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "project_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      lighthouse_runs: {
        Row: {
          accessibility: number | null
          best_practices: number | null
          created_at: string
          id: string
          notes: string | null
          overall: number | null
          owner_id: string
          performance: number | null
          seo: number | null
          strategy: string
          url: string
        }
        Insert: {
          accessibility?: number | null
          best_practices?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          overall?: number | null
          owner_id: string
          performance?: number | null
          seo?: number | null
          strategy?: string
          url: string
        }
        Update: {
          accessibility?: number | null
          best_practices?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          overall?: number | null
          owner_id?: string
          performance?: number | null
          seo?: number | null
          strategy?: string
          url?: string
        }
        Relationships: []
      }
      llm_cache: {
        Row: {
          cache_key: string
          created_at: string
          embedding: string | null
          hits: number
          id: string
          last_used_at: string
          model: string
          prompt_text: string | null
          response_text: string
          semantic_hits: number
          task_type: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          embedding?: string | null
          hits?: number
          id?: string
          last_used_at?: string
          model: string
          prompt_text?: string | null
          response_text: string
          semantic_hits?: number
          task_type: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          embedding?: string | null
          hits?: number
          id?: string
          last_used_at?: string
          model?: string
          prompt_text?: string | null
          response_text?: string
          semantic_hits?: number
          task_type?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          cost_usd: number | null
          created_at: string
          id: string
          metadata: Json
          model_used: string | null
          org_id: string
          owner_id: string
          role: Database["public"]["Enums"]["message_role"]
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          model_used?: string | null
          org_id: string
          owner_id: string
          role: Database["public"]["Enums"]["message_role"]
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          model_used?: string | null
          org_id?: string
          owner_id?: string
          role?: Database["public"]["Enums"]["message_role"]
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_personal: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_personal?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_personal?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pilot_categories: {
        Row: {
          created_at: string
          description: string | null
          estimated_cost_usd: number | null
          icon: string | null
          id: string
          org_id: string
          owner_id: string
          position: number
          priority: Database["public"]["Enums"]["pilot_priority"]
          project_id: string
          section: Database["public"]["Enums"]["pilot_section"]
          status: Database["public"]["Enums"]["pilot_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_cost_usd?: number | null
          icon?: string | null
          id?: string
          org_id: string
          owner_id: string
          position?: number
          priority?: Database["public"]["Enums"]["pilot_priority"]
          project_id: string
          section?: Database["public"]["Enums"]["pilot_section"]
          status?: Database["public"]["Enums"]["pilot_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_cost_usd?: number | null
          icon?: string | null
          id?: string
          org_id?: string
          owner_id?: string
          position?: number
          priority?: Database["public"]["Enums"]["pilot_priority"]
          project_id?: string
          section?: Database["public"]["Enums"]["pilot_section"]
          status?: Database["public"]["Enums"]["pilot_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pilot_items: {
        Row: {
          created_at: string
          done: boolean
          id: string
          org_id: string
          position: number
          project_id: string
          step_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          org_id: string
          position?: number
          project_id: string
          step_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          org_id?: string
          position?: number
          project_id?: string
          step_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_items_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "pilot_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_state: {
        Row: {
          autopilot_enabled: boolean
          current_category_id: string | null
          current_step_id: string | null
          last_action: string | null
          org_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          autopilot_enabled?: boolean
          current_category_id?: string | null
          current_step_id?: string | null
          last_action?: string | null
          org_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          autopilot_enabled?: boolean
          current_category_id?: string | null
          current_step_id?: string | null
          last_action?: string | null
          org_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_state_current_category_id_fkey"
            columns: ["current_category_id"]
            isOneToOne: false
            referencedRelation: "pilot_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_state_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "pilot_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_steps: {
        Row: {
          category_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          estimated_cost_usd: number | null
          id: string
          org_id: string
          owner_mode: Database["public"]["Enums"]["pilot_owner_mode"]
          position: number
          priority: Database["public"]["Enums"]["pilot_priority"]
          project_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["pilot_status"]
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_cost_usd?: number | null
          id?: string
          org_id: string
          owner_mode?: Database["public"]["Enums"]["pilot_owner_mode"]
          position?: number
          priority?: Database["public"]["Enums"]["pilot_priority"]
          project_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["pilot_status"]
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_cost_usd?: number | null
          id?: string
          org_id?: string
          owner_mode?: Database["public"]["Enums"]["pilot_owner_mode"]
          position?: number
          priority?: Database["public"]["Enums"]["pilot_priority"]
          project_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["pilot_status"]
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_steps_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pilot_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_featured: boolean
          max_ai_tokens_per_month: number
          max_image_generations_per_month: number
          max_marketplace_blocks: number
          max_projects: number
          max_storage_mb: number
          max_team_seats: number
          monthly_price_eur: number
          name: string
          position: number
          tagline: string
          updated_at: string
          yearly_price_eur: number
        }
        Insert: {
          created_at?: string
          features?: Json
          id: string
          is_featured?: boolean
          max_ai_tokens_per_month?: number
          max_image_generations_per_month?: number
          max_marketplace_blocks?: number
          max_projects?: number
          max_storage_mb?: number
          max_team_seats?: number
          monthly_price_eur?: number
          name: string
          position?: number
          tagline: string
          updated_at?: string
          yearly_price_eur?: number
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_featured?: boolean
          max_ai_tokens_per_month?: number
          max_image_generations_per_month?: number
          max_marketplace_blocks?: number
          max_projects?: number
          max_storage_mb?: number
          max_team_seats?: number
          monthly_price_eur?: number
          name?: string
          position?: number
          tagline?: string
          updated_at?: string
          yearly_price_eur?: number
        }
        Relationships: []
      }
      project_cost_estimates: {
        Row: {
          ai_cost_usd: number
          ai_tokens_input: number
          ai_tokens_output: number
          image_cost_usd: number
          image_count: number
          last_event_at: string | null
          owner_id: string
          project_id: string
          storage_mb: number
          total_cost_eur: number
          updated_at: string
          video_cost_usd: number
          video_count: number
        }
        Insert: {
          ai_cost_usd?: number
          ai_tokens_input?: number
          ai_tokens_output?: number
          image_cost_usd?: number
          image_count?: number
          last_event_at?: string | null
          owner_id: string
          project_id: string
          storage_mb?: number
          total_cost_eur?: number
          updated_at?: string
          video_cost_usd?: number
          video_count?: number
        }
        Update: {
          ai_cost_usd?: number
          ai_tokens_input?: number
          ai_tokens_output?: number
          image_cost_usd?: number
          image_count?: number
          last_event_at?: string | null
          owner_id?: string
          project_id?: string
          storage_mb?: number
          total_cost_eur?: number
          updated_at?: string
          video_cost_usd?: number
          video_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_docs: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          embedding_updated_at: string | null
          id: string
          org_id: string
          owner_id: string
          project_id: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          embedding_updated_at?: string | null
          id?: string
          org_id: string
          owner_id: string
          project_id: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_updated_at?: string | null
          id?: string
          org_id?: string
          owner_id?: string
          project_id?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_docs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_docs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_integrations: {
        Row: {
          account_label: string | null
          calls_count: number
          catalog_id: string
          config: Json
          created_at: string
          expires_at: string | null
          granted_scopes: string[] | null
          id: string
          last_error: string | null
          last_used_at: string | null
          org_id: string
          owner_id: string
          project_id: string
          status: Database["public"]["Enums"]["project_integration_status"]
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          calls_count?: number
          catalog_id: string
          config?: Json
          created_at?: string
          expires_at?: string | null
          granted_scopes?: string[] | null
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          org_id: string
          owner_id: string
          project_id: string
          status?: Database["public"]["Enums"]["project_integration_status"]
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          calls_count?: number
          catalog_id?: string
          config?: Json
          created_at?: string
          expires_at?: string | null
          granted_scopes?: string[] | null
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          org_id?: string
          owner_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["project_integration_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_integrations_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "integration_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_integrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_mcp_servers: {
        Row: {
          auth_header_name: string | null
          auth_kind: string
          created_at: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          last_tools: Json
          name: string
          owner_id: string
          project_id: string
          status: string
          tools_count: number
          updated_at: string
          url: string
        }
        Insert: {
          auth_header_name?: string | null
          auth_kind?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_tools?: Json
          name: string
          owner_id: string
          project_id: string
          status?: string
          tools_count?: number
          updated_at?: string
          url: string
        }
        Update: {
          auth_header_name?: string | null
          auth_kind?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_tools?: Json
          name?: string
          owner_id?: string
          project_id?: string
          status?: string
          tools_count?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_mcp_servers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_mcp_tokens: {
        Row: {
          created_at: string
          encrypted_token: string | null
          owner_id: string
          server_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_token?: string | null
          owner_id: string
          server_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_token?: string | null
          owner_id?: string
          server_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_mcp_tokens_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "project_mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          id: string
          is_pinned: boolean
          kind: Database["public"]["Enums"]["memory_kind"]
          org_id: string
          owner_id: string
          project_id: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          kind?: Database["public"]["Enums"]["memory_kind"]
          org_id: string
          owner_id: string
          project_id: string
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          kind?: Database["public"]["Enums"]["memory_kind"]
          org_id?: string
          owner_id?: string
          project_id?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_quotas: {
        Row: {
          blocked_until: string | null
          created_at: string
          hard_block: boolean
          id: string
          monthly_hard_limit_usd: number
          project_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          hard_block?: boolean
          id?: string
          monthly_hard_limit_usd?: number
          project_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          hard_block?: boolean
          id?: string
          monthly_hard_limit_usd?: number
          project_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_quotas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sandbox_state: {
        Row: {
          active_path: string | null
          file_count: number
          files: Json
          mode: string
          open_tabs: Json
          owner_id: string
          project_id: string
          size_bytes: number
          updated_at: string
        }
        Insert: {
          active_path?: string | null
          file_count?: number
          files?: Json
          mode?: string
          open_tabs?: Json
          owner_id: string
          project_id: string
          size_bytes?: number
          updated_at?: string
        }
        Update: {
          active_path?: string | null
          file_count?: number
          files?: Json
          mode?: string
          open_tabs?: Json
          owner_id?: string
          project_id?: string
          size_bytes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sandbox_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_snapshots: {
        Row: {
          created_at: string
          id: string
          label: string
          messages_count: number
          owner_id: string
          project_id: string
          size_bytes: number
          storage_path: string
          summary: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          messages_count?: number
          owner_id: string
          project_id: string
          size_bytes?: number
          storage_path: string
          summary?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          messages_count?: number
          owner_id?: string
          project_id?: string
          size_bytes?: number
          storage_path?: string
          summary?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          block_slugs: string[]
          created_at: string
          description: string
          design_notes: string | null
          features: string[]
          id: string
          ideal_for: string | null
          is_active: boolean
          pages: Json
          popularity: number
          sector: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          block_slugs?: string[]
          created_at?: string
          description: string
          design_notes?: string | null
          features?: string[]
          id?: string
          ideal_for?: string | null
          is_active?: boolean
          pages?: Json
          popularity?: number
          sector: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          block_slugs?: string[]
          created_at?: string
          description?: string
          design_notes?: string | null
          features?: string[]
          id?: string
          ideal_for?: string | null
          is_active?: boolean
          pages?: Json
          popularity?: number
          sector?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          draft_mode: boolean
          id: string
          long_term_summary: string | null
          messages_count_at_summary: number
          metadata: Json
          name: string
          org_id: string
          owner_id: string
          status: Database["public"]["Enums"]["project_status"]
          summary_updated_at: string | null
          type: Database["public"]["Enums"]["project_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["project_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          draft_mode?: boolean
          id?: string
          long_term_summary?: string | null
          messages_count_at_summary?: number
          metadata?: Json
          name: string
          org_id: string
          owner_id: string
          status?: Database["public"]["Enums"]["project_status"]
          summary_updated_at?: string | null
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          draft_mode?: boolean
          id?: string
          long_term_summary?: string | null
          messages_count_at_summary?: number
          metadata?: Json
          name?: string
          org_id?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          summary_updated_at?: string | null
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_cache: {
        Row: {
          cost_saved_usd: number
          created_at: string
          expires_at: string
          hits: number
          id: string
          last_hit_at: string | null
          model: string
          prompt_hash: string
          response: string
          tokens_saved: number
        }
        Insert: {
          cost_saved_usd?: number
          created_at?: string
          expires_at?: string
          hits?: number
          id?: string
          last_hit_at?: string | null
          model: string
          prompt_hash: string
          response: string
          tokens_saved?: number
        }
        Update: {
          cost_saved_usd?: number
          created_at?: string
          expires_at?: string
          hits?: number
          id?: string
          last_hit_at?: string | null
          model?: string
          prompt_hash?: string
          response?: string
          tokens_saved?: number
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          content: string
          created_at: string
          few_shots: Json
          id: string
          is_active: boolean
          name: string
          notes: string | null
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          few_shots?: Json
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          few_shots?: Json
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          version?: number
        }
        Relationships: []
      }
      sandbox_console_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          level: string
          message: string
          owner_id: string
          project_id: string
          source: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          level: string
          message: string
          owner_id: string
          project_id: string
          source?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          owner_id?: string
          project_id?: string
          source?: string | null
        }
        Relationships: []
      }
      sandbox_snapshots: {
        Row: {
          created_at: string
          file_count: number
          files: Json
          id: string
          label: string
          owner_id: string
          project_key: string
          size_bytes: number
        }
        Insert: {
          created_at?: string
          file_count?: number
          files: Json
          id?: string
          label?: string
          owner_id: string
          project_key: string
          size_bytes?: number
        }
        Update: {
          created_at?: string
          file_count?: number
          files?: Json
          id?: string
          label?: string
          owner_id?: string
          project_key?: string
          size_bytes?: number
        }
        Relationships: []
      }
      tool_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          owner_id: string
          tool_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id: string
          tool_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id?: string
          tool_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tool_pricing: {
        Row: {
          category: string
          created_at: string
          credits_cost: number
          description: string | null
          enabled_by_default: boolean
          provider: string | null
          requires_byok: boolean
          tool_name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          credits_cost?: number
          description?: string | null
          enabled_by_default?: boolean
          provider?: string | null
          requires_byok?: boolean
          tool_name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          credits_cost?: number
          description?: string | null
          enabled_by_default?: boolean
          provider?: string | null
          requires_byok?: boolean
          tool_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          lifetime_earned: number
          lifetime_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_quotas: {
        Row: {
          blocked_until: string | null
          created_at: string
          hard_block: boolean
          id: string
          monthly_hard_limit_usd: number
          reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          hard_block?: boolean
          id?: string
          monthly_hard_limit_usd?: number
          reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          hard_block?: boolean
          id?: string
          monthly_hard_limit_usd?: number
          reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          locale: string | null
          metadata: Json
          referrer: string | null
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          locale?: string | null
          metadata?: Json
          referrer?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          locale?: string | null
          metadata?: Json
          referrer?: string | null
          source?: string
        }
        Relationships: []
      }
      webhook_custom_tools: {
        Row: {
          auth_header_name: string | null
          auth_kind: string
          body_template: Json | null
          created_at: string
          description: string | null
          encrypted_auth_token: string | null
          id: string
          method: string
          name: string
          owner_id: string
          parameters_schema: Json | null
          updated_at: string
          url: string
        }
        Insert: {
          auth_header_name?: string | null
          auth_kind?: string
          body_template?: Json | null
          created_at?: string
          description?: string | null
          encrypted_auth_token?: string | null
          id?: string
          method?: string
          name: string
          owner_id: string
          parameters_schema?: Json | null
          updated_at?: string
          url: string
        }
        Update: {
          auth_header_name?: string | null
          auth_kind?: string
          body_template?: Json | null
          created_at?: string
          description?: string | null
          encrypted_auth_token?: string | null
          id?: string
          method?: string
          name?: string
          owner_id?: string
          parameters_schema?: Json | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      workspace_chat_messages: {
        Row: {
          client_id: string
          created_at: string
          id: string
          owner_id: string
          payload: Json
          position: number
          project_key: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          owner_id: string
          payload: Json
          position: number
          project_key: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          payload?: Json
          position?: number
          project_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_memory: {
        Row: {
          brief: string | null
          created_at: string
          delivered_files: Json
          design_notes: string | null
          id: string
          open_todos: Json
          scratch: Json
          sector: string | null
          tech_decisions: Json
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          brief?: string | null
          created_at?: string
          delivered_files?: Json
          design_notes?: string | null
          id?: string
          open_todos?: Json
          scratch?: Json
          sector?: string | null
          tech_decisions?: Json
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          brief?: string | null
          created_at?: string
          delivered_files?: Json
          design_notes?: string | null
          id?: string
          open_todos?: Json
          scratch?: Json
          sector?: string | null
          tech_decisions?: Json
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      integration_secrets_meta: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string | null
          integration_id: string | null
          kind: Database["public"]["Enums"]["integration_secret_kind"] | null
          owner_id: string | null
          rotated_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          integration_id?: string | null
          kind?: Database["public"]["Enums"]["integration_secret_kind"] | null
          owner_id?: string | null
          rotated_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          integration_id?: string | null
          kind?: Database["public"]["Enums"]["integration_secret_kind"] | null
          owner_id?: string | null
          rotated_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "project_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _api_key_passphrase: { Args: never; Returns: string }
      admin_refresh_integration_secret_expiry: {
        Args: {
          _expires_at: string
          _integration_id: string
          _kind: Database["public"]["Enums"]["integration_secret_kind"]
        }
        Returns: undefined
      }
      admin_set_integration_secret: {
        Args: {
          _expires_at?: string
          _integration_id: string
          _kind: Database["public"]["Enums"]["integration_secret_kind"]
          _value: string
        }
        Returns: string
      }
      agent_run_state_record: {
        Args: {
          _conversation_id: string
          _expected_next: string
          _last_tool: string
          _owner_id: string
          _plan_signature: string
          _screenshot_url?: string
        }
        Returns: Json
      }
      apply_credit_transaction: {
        Args: {
          _amount: number
          _kind: Database["public"]["Enums"]["credit_tx_kind"]
          _metadata?: Json
          _reason?: string
          _reference_id?: string
          _user_id: string
        }
        Returns: number
      }
      capability_capture_idea: {
        Args: {
          _info: string
          _priority?: Database["public"]["Enums"]["capability_priority"]
          _title: string
        }
        Returns: string
      }
      capability_upsert: {
        Args: {
          _category_icon: string
          _category_id: string
          _category_label: string
          _info: string
          _priority?: Database["public"]["Enums"]["capability_priority"]
          _status?: Database["public"]["Enums"]["capability_status"]
          _title: string
        }
        Returns: string
      }
      check_project_quota: {
        Args: { _project_id: string; _user_id: string }
        Returns: Json
      }
      check_user_quota: { Args: { _user_id: string }; Returns: Json }
      elena_savings_summary: {
        Args: { _days?: number; _project_id?: string }
        Returns: Json
      }
      estimate_project_cost: { Args: { _project_id: string }; Returns: Json }
      get_api_key_decrypted: {
        Args: {
          _owner_id: string
          _provider: Database["public"]["Enums"]["ai_provider"]
        }
        Returns: string
      }
      get_cache_stats: { Args: never; Returns: Json }
      get_costs_summary: { Args: { _days?: number }; Returns: Json }
      get_external_key_decrypted: {
        Args: { _owner_id: string; _service: string }
        Returns: string
      }
      get_github_token: {
        Args: { _user_id: string }
        Returns: {
          github_user_id: number
          github_username: string
          scope: string
          token: string
        }[]
      }
      get_integration_secret_decrypted: {
        Args: {
          _integration_id: string
          _kind: Database["public"]["Enums"]["integration_secret_kind"]
        }
        Returns: string
      }
      get_mcp_token_decrypted: { Args: { _server_id: string }; Returns: string }
      get_or_increment_cache: {
        Args: { _hash: string; _model: string }
        Returns: {
          cost_saved_usd: number
          response: string
          tokens_saved: number
        }[]
      }
      get_product_metrics: { Args: { _days?: number }; Returns: Json }
      get_project_budget_status: {
        Args: { _project_id: string }
        Returns: Json
      }
      get_routing_distribution: { Args: { _days?: number }; Returns: Json }
      get_user_quota_status: { Args: never; Returns: Json }
      get_webhook_auth_token_decrypted: {
        Args: { _name: string; _owner_id: string }
        Returns: string
      }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["org_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agent_cancelled: {
        Args: { _conversation_id: string; _since: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      list_project_templates: {
        Args: { p_limit?: number; p_sector?: string }
        Returns: {
          block_slugs: string[]
          description: string
          features: string[]
          ideal_for: string
          pages: Json
          popularity: number
          sector: string
          slug: string
          title: string
        }[]
      }
      list_user_integrations_unified: { Args: never; Returns: Json }
      log_audit_event: {
        Args: {
          _action: string
          _details?: Json
          _org_id?: string
          _resource_id?: string
          _resource_type?: string
          _user_agent?: string
        }
        Returns: string
      }
      mark_api_key_used: {
        Args: {
          _owner_id: string
          _provider: Database["public"]["Enums"]["ai_provider"]
        }
        Returns: undefined
      }
      mark_budget_notifications_read: { Args: never; Returns: number }
      mark_external_key_used: {
        Args: { _owner_id: string; _service: string }
        Returns: undefined
      }
      match_image_memory: {
        Args: {
          _match_count?: number
          _min_similarity?: number
          _project_id?: string
          _query: string
        }
        Returns: {
          caption: string
          id: string
          image_url: string
          project_id: string
          similarity: number
          tags: string[]
        }[]
      }
      match_llm_cache: {
        Args: {
          match_count?: number
          match_model: string
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          response_text: string
          similarity: number
          tokens_input: number
          tokens_output: number
        }[]
      }
      match_project_docs: {
        Args: {
          _match_count?: number
          _min_similarity?: number
          _project_id: string
          _query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
      maybe_emit_budget_notification: {
        Args: {
          _limit: number
          _project_id: string
          _scope: string
          _usage: number
          _user_id: string
        }
        Returns: undefined
      }
      purge_expired_cache: { Args: never; Returns: number }
      purge_old_lighthouse_runs: { Args: never; Returns: undefined }
      record_block_usage: { Args: { _slug: string }; Returns: undefined }
      record_template_usage: { Args: { p_slug: string }; Returns: undefined }
      search_code_blocks: {
        Args: {
          _category?: Database["public"]["Enums"]["block_category"]
          _limit?: number
          _query?: string
          _sector?: Database["public"]["Enums"]["block_sector"]
        }
        Returns: {
          category: Database["public"]["Enums"]["block_category"]
          dependencies: string[]
          description: string
          popularity: number
          rank: number
          sector: Database["public"]["Enums"]["block_sector"]
          slug: string
          tags: string[]
          title: string
        }[]
      }
      set_api_key: {
        Args: {
          _key: string
          _label?: string
          _provider: Database["public"]["Enums"]["ai_provider"]
        }
        Returns: string
      }
      set_external_key: {
        Args: { _key: string; _label?: string; _service: string }
        Returns: string
      }
      set_github_token: {
        Args: {
          _github_user_id: number
          _github_username: string
          _scope: string
          _token: string
          _user_id: string
        }
        Returns: undefined
      }
      set_integration_secret: {
        Args: {
          _expires_at?: string
          _integration_id: string
          _kind: Database["public"]["Enums"]["integration_secret_kind"]
          _value: string
        }
        Returns: string
      }
      set_mcp_token: {
        Args: { _server_id: string; _token: string }
        Returns: undefined
      }
      set_webhook_auth_token: {
        Args: { _token: string; _webhook_id: string }
        Returns: undefined
      }
      tool_get_effective_state: {
        Args: { _tool_name: string }
        Returns: {
          credits_cost: number
          enabled: boolean
          provider: string
          requires_byok: boolean
        }[]
      }
    }
    Enums: {
      ai_provider:
        | "lovable"
        | "openai"
        | "anthropic"
        | "google"
        | "huggingface"
        | "replicate"
        | "codex"
        | "xai"
        | "mistral"
        | "deepseek"
        | "groq"
        | "openrouter"
        | "cerebras"
      app_role: "admin" | "user"
      block_category:
        | "landing"
        | "dashboard"
        | "auth"
        | "commerce"
        | "forms"
        | "navigation"
        | "footer"
        | "feedback"
        | "data_display"
        | "sectoriel"
      block_sector:
        | "generic"
        | "saas"
        | "restaurant"
        | "real_estate"
        | "portfolio"
        | "ecommerce"
        | "events"
        | "blog"
        | "fitness"
        | "education"
        | "agency"
      capability_effort: "S" | "M" | "L" | "XL"
      capability_priority: "P0" | "P1" | "P2"
      capability_status: "todo" | "in_progress" | "done"
      credit_tx_kind: "purchase" | "spend" | "bonus" | "refund" | "expiration"
      elena_mode: "auto" | "eco" | "standard" | "premium"
      feature_request_status:
        | "open"
        | "planned"
        | "in_progress"
        | "shipped"
        | "declined"
      idea_status: "pending" | "accepted" | "rejected"
      integration_auth_type:
        | "oauth2"
        | "api_key"
        | "bearer"
        | "basic"
        | "webhook"
        | "none"
      integration_category:
        | "communication"
        | "productivity"
        | "crm"
        | "payment"
        | "marketing"
        | "social"
        | "storage"
        | "analytics"
        | "developer"
        | "ai"
        | "calendar"
        | "email"
        | "forms"
        | "other"
      integration_secret_kind:
        | "access_token"
        | "refresh_token"
        | "api_key"
        | "client_id"
        | "client_secret"
        | "webhook_secret"
        | "other"
      memory_kind:
        | "core"
        | "design"
        | "constraint"
        | "preference"
        | "feature"
        | "reference"
      message_role: "user" | "assistant" | "system" | "tool"
      org_role: "owner" | "admin" | "member"
      pilot_owner_mode: "auto" | "elena" | "human"
      pilot_priority: "P0" | "P1" | "gel"
      pilot_section: "elena" | "nexyra"
      pilot_status: "todo" | "in_progress" | "done" | "blocked"
      project_integration_status:
        | "pending"
        | "active"
        | "expired"
        | "error"
        | "revoked"
      project_status: "draft" | "active" | "archived"
      project_type: "website" | "webapp" | "mobile_app"
      project_visibility: "private" | "public"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      ai_provider: [
        "lovable",
        "openai",
        "anthropic",
        "google",
        "huggingface",
        "replicate",
        "codex",
        "xai",
        "mistral",
        "deepseek",
        "groq",
        "openrouter",
        "cerebras",
      ],
      app_role: ["admin", "user"],
      block_category: [
        "landing",
        "dashboard",
        "auth",
        "commerce",
        "forms",
        "navigation",
        "footer",
        "feedback",
        "data_display",
        "sectoriel",
      ],
      block_sector: [
        "generic",
        "saas",
        "restaurant",
        "real_estate",
        "portfolio",
        "ecommerce",
        "events",
        "blog",
        "fitness",
        "education",
        "agency",
      ],
      capability_effort: ["S", "M", "L", "XL"],
      capability_priority: ["P0", "P1", "P2"],
      capability_status: ["todo", "in_progress", "done"],
      credit_tx_kind: ["purchase", "spend", "bonus", "refund", "expiration"],
      elena_mode: ["auto", "eco", "standard", "premium"],
      feature_request_status: [
        "open",
        "planned",
        "in_progress",
        "shipped",
        "declined",
      ],
      idea_status: ["pending", "accepted", "rejected"],
      integration_auth_type: [
        "oauth2",
        "api_key",
        "bearer",
        "basic",
        "webhook",
        "none",
      ],
      integration_category: [
        "communication",
        "productivity",
        "crm",
        "payment",
        "marketing",
        "social",
        "storage",
        "analytics",
        "developer",
        "ai",
        "calendar",
        "email",
        "forms",
        "other",
      ],
      integration_secret_kind: [
        "access_token",
        "refresh_token",
        "api_key",
        "client_id",
        "client_secret",
        "webhook_secret",
        "other",
      ],
      memory_kind: [
        "core",
        "design",
        "constraint",
        "preference",
        "feature",
        "reference",
      ],
      message_role: ["user", "assistant", "system", "tool"],
      org_role: ["owner", "admin", "member"],
      pilot_owner_mode: ["auto", "elena", "human"],
      pilot_priority: ["P0", "P1", "gel"],
      pilot_section: ["elena", "nexyra"],
      pilot_status: ["todo", "in_progress", "done", "blocked"],
      project_integration_status: [
        "pending",
        "active",
        "expired",
        "error",
        "revoked",
      ],
      project_status: ["draft", "active", "archived"],
      project_type: ["website", "webapp", "mobile_app"],
      project_visibility: ["private", "public"],
    },
  },
} as const
