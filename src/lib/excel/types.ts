export interface ExcelEventInfo {
  code: string;
  title: string;
  companyName: string;
  material?: string | null;
  family: string;
  shipmentDate?: Date | null;
  etaDays?: number | null;
  incoterm?: string | null;
  destination?: string | null;
  port?: string | null;
  freeDays?: number | null;
  containerTons?: number | null;
  deadline: Date;
  timezone: string;
  conditions?: string | null;
  round: number;
}

export interface ExcelItem {
  id: string;
  vtaCode?: string | null;
  gCode: string;
  description: string;
  quantity: number;
  specs: Record<string, unknown>;
}

export interface ExcelBidLine {
  itemId: string;
  noOffer?: boolean;
  offeredQty?: number | null;
  prices: Record<string, unknown>;
  financing: Record<string, unknown>;
  values: Record<string, unknown>;
}

export interface ParsedLine {
  gCode: string;
  offeredQty: number | null;
  prices: Record<string, number | null>;
  financing: Record<string, number | null>;
  values: Record<string, string | number | null>;
  noOffer: boolean;
}

export interface ParsedOffer {
  meta: { eventCode?: string; invitationId?: string; round?: number };
  lines: ParsedLine[];
  warnings: string[];
}
