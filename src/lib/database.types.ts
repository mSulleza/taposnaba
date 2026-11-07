/**
 * Database types for the `public` schema. Hand-maintained to match
 * supabase/migrations. Regenerate with `npm run db:types` once the project is
 * linked (`supabase link`) — the generated file has the same shape.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "admin" | "helper";
export type RecurrenceKind = "daily" | "weekly" | "monthly";
export type TimeOfDay = "morning" | "anytime" | "evening";
export type TaskCategory =
  | "cleaning"
  | "aircon"
  | "water"
  | "food"
  | "litter"
  | "health"
  | "grooming"
  | "play"
  | "equipment"
  | "other";
export type InstanceStatus = "pending" | "submitted" | "approved" | "rejected" | "skipped";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type IssueCategory = "health" | "equipment" | "supplies" | "other";
export type IssueStatus = "open" | "acknowledged" | "resolved";
export type PayoutStatus = "requested" | "approved" | "paid" | "rejected";

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  locale: "tl" | "en";
  created_at: string;
  updated_at: string;
};

export type TaskTemplate = {
  id: string;
  slug: string | null;
  title_tl: string;
  title_en: string;
  description_tl: string | null;
  description_en: string | null;
  category: TaskCategory;
  recurrence: RecurrenceKind;
  weekdays: number[];
  month_days: number[];
  interval_months: number;
  anchor_month: string;
  time_of_day: TimeOfDay;
  due_time: string | null;
  grace_before: number;
  grace_after: number;
  evidence_required: boolean;
  min_photos: number;
  sort_order: number;
  /** What one approved completion of this task pays, in whole pesos. */
  peso_value: number;
  active: boolean;
  starts_on: string;
  ends_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskInstance = {
  id: string;
  template_id: string;
  scheduled_date: string;
  due_date: string;
  window_start: string;
  window_end: string;
  status: InstanceStatus;
  latest_completion_id: string | null;
  skip_reason: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskCompletion = {
  id: string;
  instance_id: string;
  submitted_by: string;
  submitted_at: string;
  note: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  /** Set only by admin_complete_task(): done by an admin, no evidence, no QA. */
  admin_override: boolean;
  /** Pesos this completion earned, frozen at submission. 0 for a bypass. */
  peso_value: number;
  /** Approved, but the admin chose not to pay for it. Every earnings sum skips it. */
  unpaid: boolean;
  created_at: string;
};

export type Payout = {
  id: string;
  helper_id: string;
  amount: number;
  status: PayoutStatus;
  note: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  paid_at: string | null;
  admin_recorded: boolean;
  created_at: string;
  updated_at: string;
};

export type Issue = {
  id: string;
  reported_by: string;
  category: IssueCategory;
  title: string;
  description: string | null;
  status: IssueStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Photo = {
  id: string;
  completion_id: string | null;
  issue_id: string | null;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
};

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Partial<Profile> & Pick<Profile, "id">,
        Partial<Profile>
      >;
      task_templates: Table<
        TaskTemplate,
        Partial<TaskTemplate> & Pick<TaskTemplate, "title_tl" | "title_en" | "recurrence">,
        Partial<TaskTemplate>
      >;
      task_instances: Table<
        TaskInstance,
        Partial<TaskInstance> &
          Pick<TaskInstance, "template_id" | "scheduled_date" | "due_date" | "window_start" | "window_end">,
        Partial<TaskInstance>
      >;
      task_completions: Table<
        TaskCompletion,
        Partial<TaskCompletion> & Pick<TaskCompletion, "instance_id" | "submitted_by">,
        Partial<TaskCompletion>
      >;
      issues: Table<
        Issue,
        Partial<Issue> & Pick<Issue, "reported_by" | "title">,
        Partial<Issue>
      >;
      payouts: Table<
        Payout,
        Partial<Payout> & Pick<Payout, "helper_id" | "amount">,
        Partial<Payout>
      >;
      photos: Table<
        Photo,
        Partial<Photo> & Pick<Photo, "storage_path" | "uploaded_by">,
        Partial<Photo>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      manila_today: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      ensure_task_instances: { Args: { p_from: string; p_to: string }; Returns: number };
      review_completion: {
        Args: {
          p_completion_id: string;
          p_decision: "approved" | "rejected";
          p_note?: string | null;
          p_pay?: boolean;
        };
        Returns: TaskCompletion;
      };
      set_completion_paid: {
        Args: { p_completion_id: string; p_pay: boolean; p_credit_to?: string | null };
        Returns: TaskCompletion;
      };
      skip_task_instance: {
        Args: { p_instance_id: string; p_reason?: string | null; p_undo?: boolean };
        Returns: TaskInstance;
      };
      reschedule_task_instance: {
        Args: { p_instance_id: string; p_due_date: string; p_window_end?: string | null };
        Returns: TaskInstance;
      };
      submit_completion: {
        Args: { p_instance_id: string; p_note?: string | null; p_paths?: string[] };
        Returns: TaskCompletion;
      };
      admin_complete_task: {
        Args: { p_instance_id: string; p_reason: string; p_done_by?: string | null; p_pay?: boolean };
        Returns: TaskCompletion;
      };
      sole_helper: { Args: Record<string, never>; Returns: string | null };
      admin_wallets: { Args: Record<string, never>; Returns: HelperWallet[] };
      earnings_outlook: { Args: { p_uid?: string | null }; Returns: EarningsOutlook[] };
      helper_earned_total: { Args: { p_uid?: string | null }; Returns: number };
      helper_payouts_committed: { Args: { p_uid?: string | null }; Returns: number };
      helper_balance: { Args: { p_uid?: string | null }; Returns: number };
      request_payout: {
        Args: { p_amount: number; p_note?: string | null };
        Returns: Payout;
      };
      review_payout: {
        Args: { p_payout_id: string; p_decision: "approved" | "paid" | "rejected"; p_note?: string | null };
        Returns: Payout;
      };
      admin_record_payout: {
        Args: { p_helper_id: string; p_amount: number; p_note?: string | null };
        Returns: Payout;
      };
      create_issue: {
        Args: {
          p_title: string;
          p_category?: IssueCategory;
          p_description?: string | null;
          p_paths?: string[];
        };
        Returns: Issue;
      };
      create_adhoc_task: {
        Args: {
          p_title_tl: string;
          p_title_en: string;
          p_due_date: string;
          p_category?: TaskCategory;
          p_desc_tl?: string | null;
          p_desc_en?: string | null;
          p_evidence_required?: boolean;
          p_grace_after?: number;
          p_peso_value?: number;
        };
        Returns: TaskInstance;
      };
    };
    Enums: {
      user_role: UserRole;
      recurrence_kind: RecurrenceKind;
      time_of_day: TimeOfDay;
      task_category: TaskCategory;
      instance_status: InstanceStatus;
      review_status: ReviewStatus;
      issue_category: IssueCategory;
      issue_status: IssueStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

/** Common joined shapes used across the UI. */
export type InstanceWithTemplate = TaskInstance & {
  template: TaskTemplate;
  /**
   * The completion this instance currently points at, embedded so lists can
   * label an admin bypass without a second query. Optional: not every select
   * asks for it.
   */
  latest?: Pick<TaskCompletion, "admin_override"> | null;
};
export type CompletionWithPhotos = TaskCompletion & {
  photos: Photo[];
  submitter?: Pick<Profile, "id" | "full_name"> | null;
  reviewer?: Pick<Profile, "id" | "full_name"> | null;
};
/**
 * What today and this month are worth if every task is done and approved.
 * Potential is the value of the tasks; earned is this user's approved share.
 */
export type EarningsOutlook = {
  today_potential: number;
  today_earned: number;
  month_potential: number;
  month_earned: number;
};

/** One row of the admin wallet roll-up (`admin_wallets()`). */
export type HelperWallet = {
  helper_id: string;
  full_name: string;
  role: UserRole;
  earned: number;
  committed: number;
  balance: number;
  this_month: number;
  open_requests: number;
};

export type PayoutWithHelper = Payout & {
  helper?: Pick<Profile, "id" | "full_name"> | null;
  reviewer?: Pick<Profile, "id" | "full_name"> | null;
};
export type IssueWithPhotos = Issue & {
  photos: Photo[];
  reporter?: Pick<Profile, "id" | "full_name"> | null;
};
