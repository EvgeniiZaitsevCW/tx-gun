import { Config, TransactionBatch, TransactionSigned } from "./types";
import axios, { AxiosResponse } from "axios";
import { stringifyObjWithBigintToJson, wait } from "./utils";
import { Context } from "./context";
import { Logger } from "./logger";

const requestConfig = {
  headers: { "Content-Type": "application/json" }
};

const firstBlockNumberDataObject = {
  method: "eth_blockNumber",
  params: [],
  id: 1,
  jsonrpc: "2.0",
};

const lastBlockNumberDataObject = {
  method: "eth_blockNumber",
  params: [],
  id: 1000000000,
  jsonrpc: "2.0",
};

function checkResponse(resp: AxiosResponse, lastId: number) {
  if (resp.data.length != lastId) {
    throw new Error(
      `Sending transaction batch failed. Insufficient response data array length. ` +
      `Expected: ${lastId}. Actual: ${resp.data.length}`
    );
  }

  const errorItems: any[] = resp.data.filter((item: any) => !item.hasOwnProperty("result"));
  if (errorItems.length > 0) {
    throw new Error(`Sending transaction batch failed. ` +
      `An item in the response data array without the result was found. ` +
      `The first error message: '${errorItems[0].error?.message}'. ` +
      `The first error code: ${errorItems[0]?.error?.code}. ` +
      `The full first error object: ${JSON.stringify(errorItems[0]?.error)}.`
    );
  }
}

function collectResults(resp: AxiosResponse, lastId: number): {
  responseTxHashes: string[],
  beforeBatchBlockNumber: number,
  afterBatchBlockNumber: number
} {
  const responseTxHashes: string[] = new Array(lastId - 2);
  let beforeBatchBlockNumber: number = 0;
  let afterBatchBlockNumber: number = 0;
  for (let item of resp.data) {
    if (item.id === 1) {
      beforeBatchBlockNumber = parseInt(item.result);
      continue;
    }
    if (item.id >= lastId) {
      afterBatchBlockNumber = parseInt(item.result);
      continue;
    }
    const index: number = item.id - 2;
    responseTxHashes[index] = item.result;
  }
  return {
    responseTxHashes,
    beforeBatchBlockNumber,
    afterBatchBlockNumber
  };
}

function checkTxHashes(responseTxHashes: string[], txs: TransactionSigned[], begTxIndex: number) {
  for (let i = 0; i < responseTxHashes.length; ++i) {
    const tx: TransactionSigned = txs[begTxIndex + i];
    const responseHash: string = responseTxHashes[i];
    if (responseHash != tx.hash) {
      throw new Error(`Sending transaction batch failed. ` +
        `One of the response hash does not match the initial one. ` +
        `Expected hash: ${tx.hash}. ` +
        `Actual hash: ${responseHash}. ` +
        `The sent tx: ${stringifyObjWithBigintToJson(tx)}.`
      );
    }
  }
}

async function sendTransactionBatch(
  props: {
    rpcUrl: string,
    txs: TransactionSigned[],
    begTxIndex: number,
    endTxIndex: number
  }
): Promise<TransactionBatch> {
  const dataObjects: any[] = [];

  dataObjects.push(firstBlockNumberDataObject);
  let id: number = 2;
  for (let i = props.begTxIndex; i < props.endTxIndex; ++i, ++id) {
    const signedTx = props.txs[i];
    const dataObject = {
      method: "eth_sendRawTransaction",
      params: [signedTx.raw],
      id,
      jsonrpc: "2.0"
    };
    dataObjects.push(dataObject);
  }
  dataObjects.push(lastBlockNumberDataObject);

  const beforeBatchTimestamp = Date.now();
  const resp: AxiosResponse = await axios.post(props.rpcUrl, dataObjects, requestConfig);
  const afterBatchTimestamp = Date.now();

  checkResponse(resp, id);
  const { responseTxHashes, beforeBatchBlockNumber, afterBatchBlockNumber } = collectResults(resp, id);
  checkTxHashes(responseTxHashes, props.txs, props.begTxIndex);

  return {
    beforeBatchBlockNumber,
    afterBatchBlockNumber,
    beforeBatchTimestamp,
    afterBatchTimestamp,
    begTxIndex: props.begTxIndex,
    endTxIndex: props.endTxIndex,
  };
}

async function sendTransactionsForInterval(context: Context): Promise<number> {
  const startTime = Date.now();
  const begIndex = context.sentTxCount;
  const endIndex = Math.min(begIndex + context.config.txsPerSecondRate, context.txs.length);

  let index = begIndex;
  while (index < endIndex) {
    if ((Date.now() - startTime) >= context.config.targetSendingIntervalInMilliseconds) {
      break;
    }
    const batchSize = Math.min(context.config.rpcBatchMaxSize, endIndex - index);
    const txBatch: TransactionBatch = await sendTransactionBatch({
      rpcUrl: context.config.rpcUrlForSending,
      txs: context.txs,
      begTxIndex: index,
      endTxIndex: index + batchSize
    });
    if (context.txBatches.length === 0) {
      context.firstSendingBlockNumber = txBatch.beforeBatchBlockNumber;
    }
    context.txBatches.push(txBatch);
    index += batchSize;
    if (index < endIndex && context.config.pauseBeforeNextBatch > 0) {
      await wait(context.config.pauseBeforeNextBatch);
    }
  }
  return index;
}

function getRemainingIntervalTime(
  config: Config,
  intervalIndex: number,
  startTimestamp: number
) {
  return config.targetSendingIntervalInMilliseconds * (intervalIndex + 1) - (Date.now() - startTimestamp);
}

export async function sendTransactions(context: Context, logger: Logger) {
  let start: number = Date.now();
  for (let intervalIndex = 0; intervalIndex < context.config.sendingDurationInSeconds; ++intervalIndex) {
    logger.log(`👉 The current second interval index: ${intervalIndex}`);
    logger.increaseLogIndent();

    const leftIntervalTimeInMilliseconds1: number = getRemainingIntervalTime(context.config, intervalIndex, start);
    if (leftIntervalTimeInMilliseconds1 <= context.config.allowedSendingIntervalInMilliseconds) {
      logger.log(
        `👉 No enough time for this interval (` +
        `allowed: ${context.config.allowedSendingIntervalInMilliseconds} ms, ` +
        `left: ${leftIntervalTimeInMilliseconds1}). ` +
        `It has been skipped.`
      );
    } else {
      logger.log(`🏁 Sending transactions for the current second interval ...`);
      const newSentTxCounter = await sendTransactionsForInterval(context);
      const numberOfSentTxs = newSentTxCounter - context.sentTxCount;
      context.sentTxCount = newSentTxCounter;
      logger.log(`✅ The sending has been done. Number of txs: ${numberOfSentTxs}. Total txs: ${newSentTxCounter}`);
    }
    const leftIntervalTimeInMilliseconds2: number = getRemainingIntervalTime(context.config, intervalIndex, start);
    if (
      leftIntervalTimeInMilliseconds2 > 0 &&
      context.sentTxCount < context.txTotal &&
      intervalIndex != context.config.sendingDurationInSeconds - 1
    ) {
      logger.log("🏁 Waiting for the next second interval ...");
      await wait(leftIntervalTimeInMilliseconds2);
      logger.log("✅ The next interval has been started");
    }
    logger.decreaseLogIndent();
  }
}