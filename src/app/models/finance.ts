export type MoneyCurrency = "VND" | "USD";

export type Jar = {
  id: string;
  name: string;
  emoji: string;
  percentage: number;
  balance: number;
  monthlyAllocation: number;
  purposeNote: string;
  linkedGoals: string[];
};

export type Transaction = {
  id: string;
  jarId: string;
  type: "expense" | "income";
  amount: number;
  itemName: string;
  spentAt: string;
  note: string;
};
