declare module 'google-trends-api' {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    granularTimeResolution?: boolean;
  }

  export function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
  export function relatedQueries(options: InterestOverTimeOptions): Promise<string>;
  export function relatedTopics(options: InterestOverTimeOptions): Promise<string>;
  export function dailyTrends(options: { trendDate?: Date; geo?: string }): Promise<string>;
  export function realTimeTrends(options: { geo?: string; category?: string }): Promise<string>;
}
