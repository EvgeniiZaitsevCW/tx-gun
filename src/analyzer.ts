import {
  BlockReceipt,
  BlockReceiptCollection,
  BlockResult,
  TransactionBatch,
  TransactionResult,
  TransactionResultPerHash,
  TransactionSigned,
  TransactionStatistics
} from "./types";
import { Logger } from "./logger";
import axios, { AxiosResponse } from "axios";
import { Context } from "./context";
import { collectStatistics, wait } from "./utils";

const requestConfig = {
  headers: { "Content-Type": "application/json" }
};

export function defineTransactionResults(
  txs: TransactionSigned[],
  txBatches: TransactionBatch[]
): TransactionResultPerHash {
  const resultMap: TransactionResultPerHash = new Map();
  txBatches.forEach((txBatch: TransactionBatch) => {
    for (let i = txBatch.begTxIndex; i < txBatch.endTxIndex; ++i) {
      const tx: TransactionSigned = txs[i];
      const txResult: TransactionResult = {
        txRequest: tx,
        generalIndex: i,
        timestampBeforeSending: txBatch.beforeBatchTimestamp,
        timestampAfterSending: txBatch.afterBatchTimestamp,
        blockNumberSending: txBatch.beforeBatchBlockNumber,
      };
      resultMap.set(tx.hash ?? "<undefined_hash>", txResult);
    }
  });
  return resultMap;
}

export function createEmptyBlockReceiptCollection(): BlockReceiptCollection {
  return {
    minBlockNumber: 0,
    maxBlockNumber: 0,
    blockReceipts: new Map(),
  };
}

function prepareRequestDataObjects(
  blockNumbers: Set<number>,
  lastBlockNumber: number,
): any[] {
  const dataObjects: any[] = [];
  for (const blockNumber of blockNumbers) {
    dataObjects.push({
      method: "eth_getBlockByNumber",
      params: [
        "0x" + blockNumber.toString(16),
        false,
      ],
      id: blockNumber,
      jsonrpc: "2.0",
    });
  }
  dataObjects.push({
    method: "eth_blockNumber",
    params: [],
    id: lastBlockNumber + 1,
    jsonrpc: "2.0",
  });
  return dataObjects;
}

function parseResponse(
  resp: AxiosResponse,
  lastBlockNumber: number,
  responseTimestamp: number,
): {
  newLastBlockNumber: number,
  blockReceipts: BlockReceipt[]
} {
  let newLastBlockNumber: number = lastBlockNumber;
  const blockReceipts: BlockReceipt[] = [];
  resp.data.forEach((item: any) => {
    if (item.id == lastBlockNumber + 1 && !!item.result) {
      newLastBlockNumber = parseInt(item.result);
    } else {
      if (!!item.result && !!item.id) {
        const blockReceipt: BlockReceipt = {
          number: parseInt(item.result.number),
          timestamp: parseInt(item.result.timestamp) * 1000,
          receiptTimestamp: responseTimestamp,
          gasLimit: BigInt(item.result.gasLimit),
          gasUsed: BigInt(item.result.gasUsed),
          size: parseInt(item.result.size),
          hash: item.result.hash,
          miner: item.result.miner,
          transactions: item.result.transactions,
        };
        if (blockReceipt.number == item.id) {
          blockReceipts.push(blockReceipt);
        } else {
          throw new Error(
            `The block number in the RPC response does not match the request id. ` +
            `The block number: ${blockReceipt.number}. ` +
            `The id value: ${item.id}.`
          );
        }
      }
    }
  });
  return {
    newLastBlockNumber,
    blockReceipts: blockReceipts,
  };
}

function updateBlockNumbers(
  blockNumbers: Set<number>,
  lastBlockNumber: number,
  newLastBlockNumber: number,
  blockBatchSize: number
): number {
  if (newLastBlockNumber > lastBlockNumber) {
    let blockNumber = lastBlockNumber;
    for (; blockNumber <= newLastBlockNumber; ++blockNumber) {
      blockNumbers.add(blockNumber);
      if (blockNumbers.size >= blockBatchSize) {
        break;
      }
    }
    return blockNumber;
  } else {
    return lastBlockNumber;
  }
}

function updateBlockReceiptCollection(blockReceiptCollection: BlockReceiptCollection, blockReceipt: BlockReceipt) {
  if (blockReceipt.number > blockReceiptCollection.maxBlockNumber || blockReceiptCollection.maxBlockNumber === 0) {
    blockReceiptCollection.maxBlockNumber = blockReceipt.number;
    blockReceiptCollection.blockReceipts.set(blockReceipt.number, blockReceipt);
  } else if (blockReceipt.number < blockReceiptCollection.minBlockNumber || blockReceiptCollection.minBlockNumber === 0) {
    blockReceiptCollection.minBlockNumber = blockReceipt.number;
    blockReceiptCollection.blockReceipts.set(blockReceipt.number, blockReceipt);
  } else if (!blockReceiptCollection.blockReceipts.has(blockReceipt.number)) {
    blockReceiptCollection.blockReceipts.set(blockReceipt.number, blockReceipt);
  }
}

function updateTxResult(blockReceipt: BlockReceipt, txResult: TransactionResult | undefined) {
  if (txResult) {
    txResult.timestampMinting = blockReceipt.receiptTimestamp;
    txResult.blockNumberMining = blockReceipt.number;
  }
}

async function logExceptionAndWait(errorCounter: number, logger: Logger, e: any) {
  const waitDuration = 2000;
  const continueMessage: string = (errorCounter > 0)
    ? `Execution will be continued after ${waitDuration} ms wait. `
    : `Execution stopped due to a large number of errors. `;
  logger.log(
    `❌ An exception has occurred during block data fetching. ` +
    `The number of remaining attempts: ${errorCounter}. ` + continueMessage +
    `The error message: ` + e.message
  );
  if (errorCounter > 0) {
    await wait(waitDuration);
  }
}

export async function awaitTransactionMinting(context: Context, logger: Logger): Promise<Set<string>> {
  let timeoutActivated = false;
  let endTime = Number.MAX_SAFE_INTEGER;
  let errorCounter = context.config.blockFetchingErrorCountLimit;
  const hashes: Set<string> = new Set();
  let lastSendingBlock = 0;
  context.txResults.forEach(txResult => {
    if (!txResult.blockNumberMining && !!txResult.txRequest.hash) {
      hashes.add(txResult.txRequest.hash);
      lastSendingBlock = Math.max(txResult.blockNumberSending, lastSendingBlock);
    }
  });
  const blockBatchSize: number = 10;
  let lastBlockNumber: number = context.firstSendingBlockNumber + blockBatchSize - 1;
  const blockNumbers: Set<number> = new Set();
  for (let i = 0; i < blockBatchSize; ++i) {
    blockNumbers.add(i + context.firstSendingBlockNumber);
  }

  while (hashes.size > 0 && Date.now() < endTime && errorCounter != 0) {
    const dataObjects: any[] = prepareRequestDataObjects(blockNumbers, lastBlockNumber);
    try {
      const resp: AxiosResponse = await axios.post(context.config.rpcUrlForReading, dataObjects, requestConfig);
      const responseTimestamp = Date.now();
      const { newLastBlockNumber, blockReceipts } = parseResponse(resp, lastBlockNumber, responseTimestamp);
      blockReceipts.forEach((blockReceipt: BlockReceipt) => {
        blockNumbers.delete(blockReceipt.number);
        blockReceipt.transactions.forEach((txHash: string) => {
          hashes.delete(txHash);
          updateTxResult(blockReceipt, context.txResults.get(txHash));
        });
        updateBlockReceiptCollection(context.blockReceiptCollection, blockReceipt);
        if (blockReceipt.number == lastSendingBlock && !timeoutActivated) {
          timeoutActivated = true;
          logger.log(
            `👉 The last sending block (${lastSendingBlock}) has been processed. ` +
            `The transaction minting timeout (${context.config.txsMintingTimeoutInSeconds} s) has been activated`
          );
          endTime = Date.now() + context.config.txsMintingTimeoutInSeconds * 1000;
        }
      });
      lastBlockNumber = updateBlockNumbers(blockNumbers, lastBlockNumber, newLastBlockNumber, blockBatchSize);
      if (blockReceipts.length > 0) {
        const minBlockNumber = Math.min.apply(null, blockReceipts.map(receipt => receipt.number));
        logger.log(
          `✅ Some new block data has been gotten and processed. ` +
          `The min block number: ${minBlockNumber}. ` +
          `The number of processed blocks: ${blockReceipts.length}. ` +
          `The number of remaining txs to confirm minting: ${hashes.size}`
        );
      }
      errorCounter = context.config.blockFetchingErrorCountLimit;
    } catch (e: any) {
      --errorCounter;
      await logExceptionAndWait(errorCounter, logger, e);
    }
  }

  return hashes;
}

function mintDelayInMillisecondsConverter(txResult: TransactionResult): number {
  if (!txResult.timestampMinting) {
    return 0;
  } else {
    return txResult.timestampMinting - txResult.timestampAfterSending;
  }
}

function mintDelayInBlocksConverter(txResult: TransactionResult): number {
  if (!txResult.blockNumberMining) {
    return 0;
  } else {
    return txResult.blockNumberMining - txResult.blockNumberSending;
  }
}

function submissionDelayInBlocksConverter(txBatch: TransactionBatch): number {
  return txBatch.afterBatchBlockNumber - txBatch.beforeBatchBlockNumber;
}

function batchSizeConverter(txBatch: TransactionBatch): number {
  return txBatch.endTxIndex - txBatch.begTxIndex;
}

export function prepareTxStatistics(context: Context): TransactionStatistics {
  const sentTxCountPerRelativeBlock: number[] = [];
  const mintedTxCountPerBlock: number[] = [];

  context.txBatches.forEach(txBatch => {
    const relativeBlock = txBatch.beforeBatchBlockNumber - context.firstSendingBlockNumber;
    while (sentTxCountPerRelativeBlock.length < relativeBlock + 1) {
      sentTxCountPerRelativeBlock.push(0);
    }
    sentTxCountPerRelativeBlock[relativeBlock] += txBatch.endTxIndex - txBatch.begTxIndex;
  });

  let mintedTxCount = 0;
  for (let txResult of context.txResults.values()) {
    if (!txResult.blockNumberMining) {
      continue;
    }
    ++mintedTxCount;
    const relativeBlock = txResult.blockNumberMining - txResult.blockNumberSending;
    while (mintedTxCountPerBlock.length < relativeBlock + 1) {
      mintedTxCountPerBlock.push(0);
    }
    mintedTxCountPerBlock[relativeBlock] += 1;
  }

  return {
    firstSendingBlockNumber: context.firstSendingBlockNumber,
    expectedRate: context.config.txsPerSecondRate,
    actualAverageRate: context.sentTxCount / context.config.sendingDurationInSeconds,
    sendingDurationInSeconds: context.config.sendingDurationInSeconds,
    pauseBeforeNextBatchInMilliseconds: context.config.pauseBeforeNextBatch,
    sentTxCount: context.sentTxCount,
    mintedTxCount,
    rpcBatchSizeStat: collectStatistics(context.txBatches.values(), batchSizeConverter),
    sentTxCountStatByBlocks: collectStatistics(sentTxCountPerRelativeBlock.values()),
    submissionDelayStatInBlocks: collectStatistics(context.txBatches.values(), submissionDelayInBlocksConverter),
    mintingDelayStatInMilliseconds: collectStatistics(context.txResults.values(), mintDelayInMillisecondsConverter),
    mintingDelayStatInBlocks: collectStatistics(context.txResults.values(), mintDelayInBlocksConverter),
    mintedTxCountPerBlockRelativeToTheSendingBlock: mintedTxCountPerBlock,
  };
}

export function prepareBlockResults(context: Context): BlockResult[] {
  const blockResults: BlockResult[] = [];

  const blockNumbers: number[] = Array.from(context.blockReceiptCollection.blockReceipts.keys()).sort((a, b) => a - b);

  blockNumbers.forEach(blockNumber => {
    const blockReceipt = context.blockReceiptCollection.blockReceipts.get(blockNumber);
    if (!blockReceipt) {
      return;
    }

    let countOfTargetTxs: number = 0;
    blockReceipt.transactions.forEach(hash => {
      const txResult = context.txResults.get(hash);
      if (!txResult) {
        return;
      }
      ++countOfTargetTxs;
    });

    const blockResult: BlockResult = {
      number: blockReceipt.number,
      timestamp: blockReceipt.timestamp,
      gasLimit: blockReceipt.gasLimit,
      gasUsed: blockReceipt.gasUsed,
      size: blockReceipt.size,
      hash: blockReceipt.hash,
      miner: blockReceipt.miner,
      countOfAllTxs: blockReceipt.transactions.length,
      countOfTargetTxs,
    };

    blockResults.push(blockResult);
  });

  return blockResults;
}