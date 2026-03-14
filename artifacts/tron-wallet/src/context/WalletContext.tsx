import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import CryptoJS from "crypto-js";
import { getTronWeb } from "@/lib/tron";

interface WalletContextType {
  isLoggedIn: boolean;
  address: string | null;
  accountNumber: string | null;
  privateKey: string | null; // Kept in memory ONLY when logged in
  login: (accountNum: string) => boolean;
  logout: () => void;
  createWallet: (accountNum: string) => { address: string; privateKey: string };
  importWallet: (privateKey: string, accountNum: string) => boolean;
  hasWallet: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    const storedEncrypted = localStorage.getItem("tron_wallet_encrypted_pk");
    const storedAddress = localStorage.getItem("tron_wallet_address");
    if (storedEncrypted && storedAddress) {
      setHasWallet(true);
    }
  }, []);

  const login = (accountNum: string): boolean => {
    const storedEncrypted = localStorage.getItem("tron_wallet_encrypted_pk");
    const storedAddress = localStorage.getItem("tron_wallet_address");
    
    if (!storedEncrypted || !storedAddress) return false;

    try {
      const bytes = CryptoJS.AES.decrypt(storedEncrypted, accountNum);
      const decryptedPk = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedPk || decryptedPk.length !== 64) {
        return false; // Decryption failed or yielded invalid pk
      }

      setPrivateKey(decryptedPk);
      setAccountNumber(accountNum);
      setAddress(storedAddress);
      setIsLoggedIn(true);
      return true;
    } catch (err) {
      console.error("Login decryption error:", err);
      return false;
    }
  };

  const logout = () => {
    setPrivateKey(null);
    setAccountNumber(null);
    setAddress(null);
    setIsLoggedIn(false);
  };

  const createWallet = (accountNum: string) => {
    const tronWeb = getTronWeb();
    const account = tronWeb.utils.accounts.generateAccount();
    const newPrivateKey = account.privateKey;
    const newAddress = account.address.base58;

    const encrypted = CryptoJS.AES.encrypt(newPrivateKey, accountNum).toString();
    
    localStorage.setItem("tron_wallet_encrypted_pk", encrypted);
    localStorage.setItem("tron_wallet_address", newAddress);
    
    setPrivateKey(newPrivateKey);
    setAccountNumber(accountNum);
    setAddress(newAddress);
    setIsLoggedIn(true);
    setHasWallet(true);
    
    return { address: newAddress, privateKey: newPrivateKey };
  };

  const importWallet = (importedPk: string, accountNum: string): boolean => {
    try {
      const tronWeb = getTronWeb(importedPk);
      const newAddress = tronWeb.defaultAddress.base58;
      
      if (!newAddress) return false;

      const encrypted = CryptoJS.AES.encrypt(importedPk, accountNum).toString();
      
      localStorage.setItem("tron_wallet_encrypted_pk", encrypted);
      localStorage.setItem("tron_wallet_address", newAddress);
      
      setPrivateKey(importedPk);
      setAccountNumber(accountNum);
      setAddress(newAddress);
      setIsLoggedIn(true);
      setHasWallet(true);
      
      return true;
    } catch (err) {
      console.error("Import error:", err);
      return false;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        isLoggedIn,
        address,
        accountNumber,
        privateKey,
        login,
        logout,
        createWallet,
        importWallet,
        hasWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
