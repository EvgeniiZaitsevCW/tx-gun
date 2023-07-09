import { TransactionLike } from "ethers";

export const TX_KIND_COMMON = "common";
export const TX_KIND_ERC20_TRANSFER = "erc20-transfer";
export const TX_KIND_PIX_CASH_IN = "pix-cash-in";

export interface InputParams {
  rpcUrlForSending: string;
  rpcUrlForReading: string;
  fromPrivateKey: string;
  txKind: string,
  contractAddress: string,
  isToAddressStatic: boolean;
  toStaticAddress: string;
  sentEthValue: bigint;
  sentAmount: bigint;
  isDataFieldStatic: boolean;
  rndDataFieldSize: number;
  staticDataFieldValue: string;
  isLegacyTx: boolean;
  autoGasPrice: boolean;
  autoGasPriceCoefInPpm: number;
  gasPrice: bigint;
  autoGasLimit: boolean,
  autoGasLimitCoefInPpm: number,
  gasLimit: bigint,
  txsPerSecondRate: number;
  sendingDurationInSeconds: number;
  millisecondsOfStart: string;
  rpcBatchMaxSize: number;
  pauseBeforeNextBatch: number
  awaitTxsMinting: boolean;
  txsMintingTimeoutInSeconds: number;
  outTxsFileName: string;
  outBlocksFileName: string;
  outTxStatFileName: string;
  outFilesSuffix: string;
}

export interface Config extends InputParams {
  targetSendingIntervalInMilliseconds: number;
  allowedSendingIntervalInMilliseconds: number;
  dataFieldSize: number;
}

export interface TransactionSigned extends TransactionLike {
  raw: string;
}

export interface TransactionBatch {
  beforeBatchTimestamp: number,
  beforeBatchBlockNumber: number,
  begTxIndex: number,
  endTxIndex: number,
  afterBatchBlockNumber: number,
  afterBatchTimestamp: number,
}

export interface TransactionResult {
  txRequest: TransactionSigned;
  generalIndex: number;
  timestampBeforeSending: number;
  timestampAfterSending: number;
  timestampMinting?: number;
  blockNumberSending: number;
  blockNumberMining?: number;
}

export interface BlockReceipt {
  number: number,
  timestamp: number,
  receiptTimestamp: number,
  gasLimit: bigint,
  gasUsed: bigint,
  size: number,
  hash: string,
  miner: string,
  transactions: string[],
}

export type TransactionResultPerHash = Map<string, TransactionResult>;

export type BlockReceiptsPerBlockNumber = Map<number, BlockReceipt>;

export interface BlockReceiptCollection {
  minBlockNumber: number,
  maxBlockNumber: number,
  blockReceipts: BlockReceiptsPerBlockNumber,
}

export interface Statistics {
  min: number;
  max: number;
  avr: number;
  std: number;
}

export interface TransactionStatistics {
  firstSendingBlockNumber: number;
  expectedRate: number;
  actualAverageRate: number;
  sendingDurationInSeconds: number;
  pauseBeforeNextBatchInMilliseconds: number;
  sentTxCount: number;
  mintedTxCount: number;
  rpcBatchSizeStat: Statistics;
  sentTxCountStatByBlocks: Statistics;
  submissionDelayStatInBlocks: Statistics;
  mintingDelayStatInMilliseconds: Statistics;
  mintingDelayStatInBlocks: Statistics;
  mintedTxCountPerBlockRelativeToTheSendingBlock: number[];
}

export interface BlockResult {
  number: number,
  timestamp: number,
  gasLimit: bigint,
  gasUsed: bigint,
  size: number,
  hash: string,
  miner: string,
  countOfAllTxs: number,
  countOfTargetTxs: number,
}