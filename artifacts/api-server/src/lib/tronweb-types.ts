import { TronWeb, Types } from "tronweb";

export type TronWebClient = InstanceType<typeof TronWeb>;

export type Account = Types.Account;
export type AccountResourceMessage = Types.AccountResourceMessage;
export type ChainParameter = Types.ChainParameter;
export type TransactionInfo = Types.TransactionInfo;
export type Transaction<T extends Types.ContractParamter = Types.ContractParamter> =
  Types.Transaction<T>;
export type SignedTransaction<T extends Types.ContractParamter = Types.ContractParamter> =
  Types.SignedTransaction<T>;
export type BroadcastReturn<T extends SignedTransaction = SignedTransaction> =
  Types.BroadcastReturn<T>;

export type UnsignedTx = Transaction<Types.ContractParamter>;
export type AnySignedTx = SignedTransaction<Types.ContractParamter>;
export type AnyBroadcastReturn = BroadcastReturn<AnySignedTx>;

export async function getAccount(
  tw: TronWebClient,
  address: string,
): Promise<Account> {
  return tw.trx.getAccount(address);
}

export async function getAccountResources(
  tw: TronWebClient,
  address: string,
): Promise<AccountResourceMessage> {
  return tw.trx.getAccountResources(address);
}

export async function getChainParameters(
  tw: TronWebClient,
): Promise<ChainParameter[]> {
  return tw.trx.getChainParameters();
}

export async function getTransactionInfo(
  tw: TronWebClient,
  txid: string,
): Promise<TransactionInfo> {
  return tw.trx.getTransactionInfo(txid);
}

export async function buildSendTrxTx(
  tw: TronWebClient,
  to: string,
  amountSun: number,
  from: string,
): Promise<Transaction<Types.TransferContract>> {
  return tw.transactionBuilder.sendTrx(to, amountSun, from);
}

export async function buildFreezeBalanceV2Tx(
  tw: TronWebClient,
  amountSun: number,
  resource: Types.Resource,
): Promise<Transaction<Types.FreezeBalanceV2Contract>> {
  return tw.transactionBuilder.freezeBalanceV2(amountSun, resource);
}

export async function buildDelegateResourceTx(
  tw: TronWebClient,
  amountSun: number,
  receiverAddress: string,
  resource: Types.Resource,
  ownerAddress: string,
  lock: boolean,
): Promise<Transaction<Types.DelegateResourceContract>> {
  return tw.transactionBuilder.delegateResource(
    amountSun,
    receiverAddress,
    resource,
    ownerAddress,
    lock,
  );
}

export async function signTx<T extends Types.ContractParamter>(
  tw: TronWebClient,
  tx: Transaction<T>,
  privateKey: string,
): Promise<SignedTransaction<T>> {
  return tw.trx.sign(tx, privateKey) as Promise<SignedTransaction<T>>;
}

export async function broadcast<T extends Types.ContractParamter>(
  tw: TronWebClient,
  signedTx: SignedTransaction<T>,
): Promise<BroadcastReturn<SignedTransaction<T>>> {
  return tw.trx.sendRawTransaction(signedTx);
}

export function broadcastUnknown(
  tw: TronWebClient,
  signedTx: object,
): Promise<AnyBroadcastReturn> {
  return tw.trx.sendRawTransaction(signedTx as AnySignedTx) as Promise<AnyBroadcastReturn>;
}
