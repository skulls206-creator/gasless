import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getTronWeb } from "@/lib/tron";
import { sha256Hex, encryptPrivateKey, decryptPrivateKey } from "@/lib/crypto";

async function syncWalletToServer(accountNum: string, encryptedPk: string, address: string) {
  try {
    const accountHash = await sha256Hex(accountNum);
    await fetch("/api/wallet/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountHash, encryptedPk, address }),
    });
  } catch (err) {
    console.warn("[wallet] Cloud sync failed (non-fatal):", err);
  }
}

interface WalletContextType {
  isLoggedIn: boolean;
  address: string | null;
  accountNumber: string | null;
  privateKey: string | null; // in-memory only when logged in
  login: (accountNum: string) => Promise<boolean>;
  logout: () => void;
  createWallet: (accountNum: string) => Promise<{ address: string; privateKey: string }>;
  importWallet: (privateKey: string, accountNum: string) => Promise<boolean>;
  hasWallet: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn]       = useState(false);
  const [address, setAddress]             = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [privateKey, setPrivateKey]       = useState<string | null>(null);
  const [hasWallet, setHasWallet]         = useState(false);

  // Restore session from sessionStorage on mount so that in-tab navigations
  // (including ?to= query-param links) don't force re-login.
  useEffect(() => {
    const encryptedPk = localStorage.getItem("tron_wallet_encrypted_pk");
    const storedAddr  = localStorage.getItem("tron_wallet_address");
    if (encryptedPk && storedAddr) {
      setHasWallet(true);
      const sessionAccNum = sessionStorage.getItem("tron_wallet_session_acct");
      if (sessionAccNum) {
        // Silently re-derive the private key to restore the session
        decryptPrivateKey(encryptedPk, sessionAccNum).then((pk) => {
          if (pk && pk.length === 64) {
            setPrivateKey(pk);
            setAccountNumber(sessionAccNum);
            setAddress(storedAddr);
            setIsLoggedIn(true);
          } else {
            sessionStorage.removeItem("tron_wallet_session_acct");
          }
        });
      }
    }
  }, []);

  const login = async (accountNum: string): Promise<boolean> => {
    const stored  = localStorage.getItem("tron_wallet_encrypted_pk");
    const storedA = localStorage.getItem("tron_wallet_address");
    if (!stored || !storedA) return false;

    const decryptedPk = await decryptPrivateKey(stored, accountNum);
    if (!decryptedPk || decryptedPk.length !== 64) return false;

    sessionStorage.setItem("tron_wallet_session_acct", accountNum);
    setPrivateKey(decryptedPk);
    setAccountNumber(accountNum);
    setAddress(storedA);
    setIsLoggedIn(true);
    return true;
  };

  const logout = () => {
    sessionStorage.removeItem("tron_wallet_session_acct");
    setPrivateKey(null);
    setAccountNumber(null);
    setAddress(null);
    setIsLoggedIn(false);
  };

  const createWallet = async (accountNum: string) => {
    const tronWeb    = getTronWeb();
    const account    = tronWeb.utils.accounts.generateAccount();
    const newPk      = account.privateKey;
    const newAddress = account.address.base58;

    const encrypted = await encryptPrivateKey(newPk, accountNum);
    localStorage.setItem("tron_wallet_encrypted_pk", encrypted);
    localStorage.setItem("tron_wallet_address", newAddress);
    sessionStorage.setItem("tron_wallet_session_acct", accountNum);

    setPrivateKey(newPk);
    setAccountNumber(accountNum);
    setAddress(newAddress);
    setIsLoggedIn(true);
    setHasWallet(true);

    syncWalletToServer(accountNum, encrypted, newAddress); // fire-and-forget

    return { address: newAddress, privateKey: newPk };
  };

  const importWallet = async (importedPk: string, accountNum: string): Promise<boolean> => {
    try {
      const tronWeb    = getTronWeb(importedPk);
      const newAddress = tronWeb.defaultAddress.base58;
      if (!newAddress) return false;

      const encrypted = await encryptPrivateKey(importedPk, accountNum);
      localStorage.setItem("tron_wallet_encrypted_pk", encrypted);
      localStorage.setItem("tron_wallet_address", newAddress);
      sessionStorage.setItem("tron_wallet_session_acct", accountNum);

      setPrivateKey(importedPk);
      setAccountNumber(accountNum);
      setAddress(newAddress);
      setIsLoggedIn(true);
      setHasWallet(true);

      syncWalletToServer(accountNum, encrypted, newAddress);
      return true;
    } catch (err) {
      console.error("Import error:", err);
      return false;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        isLoggedIn, address, accountNumber, privateKey,
        login, logout, createWallet, importWallet, hasWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}
