export interface UsageStatsDto {
  contacts: {
    used: number;
    limit: number;
    percentage: number;
  };
  campaigns: {
    used: number;
    limit: number;
    percentage: number;
    periodStart: string;
    periodEnd: string;
  };
  sms: {
    used: number;
    limit: number;
    percentage: number;
    periodStart: string;
    periodEnd: string;
  };
  emails: {
    used: number;
    limit: number;
    percentage: number;
    periodStart: string;
    periodEnd: string;
  };
  credits: {
    available: number;
    reserved: number;
    total: number;
  };
}
