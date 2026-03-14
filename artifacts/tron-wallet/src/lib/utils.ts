import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
    .format(amount)
    .replace("$", ""); // We will add the USDT prefix manually
}

export function generateAccountNumber(): string {
  const randomValues = new Uint8Array(20);
  window.crypto.getRandomValues(randomValues);
  
  let digits = "";
  for (let i = 0; i < 20; i++) {
    digits += (randomValues[i] % 10).toString();
  }
  
  return `${digits.slice(0, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 15)}-${digits.slice(15, 20)}`;
}

export function formatAccountNumberInput(value: string): string {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 20);
  const groups = digitsOnly.match(/.{1,5}/g);
  return groups ? groups.join("-") : value;
}
