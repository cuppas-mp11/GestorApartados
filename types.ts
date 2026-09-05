export enum ReservationStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED'
}

export interface InventoryItem {
  id: string;
  name: string;
  code: string;
  basePrice: number;
}

export interface ReservationItem {
  id: string;
  garmentId: string;
  name: string;
  code: string;
  quantity: number;
  pricePerUnit: number;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  note?: string;
}

export interface Reservation {
  id: string;
  correlative: number;
  customerName: string;
  customerCode: string;
  phoneNumber: string;
  items: ReservationItem[];
  date: string;
  status: ReservationStatus;
  depositAmount: number;
  payments: Payment[];
}
