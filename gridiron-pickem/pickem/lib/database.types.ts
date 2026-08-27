export type Team = {
  id: number;
  school: string;
  mascot: string | null;
  conference: string | null;
  classification: string | null;
  logo_url: string | null;
};

export type Game = {
  id: number;
  season: number;
  week: number;
  season_type: string;
  start_date: string;
  home_team_id: number | null;
  away_team_id: number | null;
  home_points: number | null;
  away_points: number | null;
  completed: boolean;
  winner_team_id: number | null;
  featured: boolean;
  home_rank: number | null;
  away_rank: number | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export type Pick = {
  id: string;
  user_id: string;
  game_id: number;
  picked_team_id: number;
  created_at: string;
  updated_at: string;
};

export type Standing = {
  user_id: string;
  display_name: string | null;
  correct: number;
  total_completed: number;
};

export type PlayoffPick = {
  id: string;
  user_id: string;
  team_id: number;
  season: number;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      teams: { Row: Team; Insert: Team; Update: Partial<Team>; Relationships: [] };
      games: { Row: Game; Insert: Game; Update: Partial<Game>; Relationships: [] };
      profiles: {
        Row: Profile;
        Insert: Profile;
        Update: Partial<Profile>;
        Relationships: [];
      };
      picks: {
        Row: Pick;
        Insert: Omit<Pick, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Pick>;
        Relationships: [];
      };
      playoff_picks: {
        Row: PlayoffPick;
        Insert: Omit<PlayoffPick, 'id' | 'created_at'>;
        Update: Partial<PlayoffPick>;
        Relationships: [];
      };
    };
    Views: {
      standings: { Row: Standing; Relationships: [] };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
