import path from "path";
import fs from "fs";
import { waitSync } from "./utils";
import { stringify } from "csv-stringify/sync";
import { Context } from "./context";
import { BlockResult, TransactionResult, TransactionSigned, TransactionStatistics } from "./types";

//The path to the running JavaScript instance
const scriptPath = process.argv[1];

class Storage {
  readonly resultsPath: string = path.resolve(scriptPath + "/../../results");
  readonly stringifyOptions = {
    delimiter: "\t",
    quoted: false,
  };

  makeResultsDir() {
    fs.mkdirSync(
      this.resultsPath,
      { recursive: true }
    );
  }

  storeTxs(context: Context): string {
    if (!context.config.outTxsFileName || context.config.outTxsFileName.length === 0) {
      return "";
    }
    if (!fs.existsSync(this.resultsPath)) {
      this.makeResultsDir();
    }
    let content = this.#makeTxsFileHeader();
    for (let i = 0; i < context.sentTxCount; ++i) {
      const hash = context.txs[i].hash ?? "<undefinded_hash>";
      const txResult = context.txResults.get(hash);
      content += this.#makeTxsFileRow(i, txResult);
    }
    const filePath = this.#createFilePath(context.config.outTxsFileName, context);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  storeTxStatistics(txStat: TransactionStatistics, context: Context): string {
    if (!context.config.outTxStatFileName || context.config.outTxStatFileName.length === 0) {
      return "";
    }
    if (!fs.existsSync(this.resultsPath)) {
      this.makeResultsDir();
    }
    let contentArray: any[] = [
      [
        "quantity",              // 01
        "main or average value", // 02
        "min value",             // 03
        "max value",             // 04
        "std value",             // 05
      ],
      ["First sending block number", txStat.firstSendingBlockNumber],
      ["Expected rate, tx/s", txStat.expectedRate],
      ["Actual average rate, tx/s", txStat.actualAverageRate],
      ["Sending duration, s", txStat.sendingDurationInSeconds],
      ["Pause before next batch, ms", txStat.pauseBeforeNextBatchInMilliseconds],
      ["Sent tx count", txStat.sentTxCount],
      ["Minted tx count", txStat.mintedTxCount],
      [
        "RPC batch size",
        txStat.rpcBatchSizeStat.avr,
        txStat.rpcBatchSizeStat.min,
        txStat.rpcBatchSizeStat.max,
        txStat.rpcBatchSizeStat.std
      ],
      [
        "Sent tx count by blocks",
        txStat.sentTxCountStatByBlocks.avr,
        txStat.sentTxCountStatByBlocks.min,
        txStat.sentTxCountStatByBlocks.max,
        txStat.sentTxCountStatByBlocks.std,
      ],
      [
        "Submission delay in blocks:",
        txStat.submissionDelayStatInBlocks.avr,
        txStat.submissionDelayStatInBlocks.min,
        txStat.submissionDelayStatInBlocks.max,
        txStat.submissionDelayStatInBlocks.std,
      ],
      [
        "Minting delay in blocks:",
        txStat.mintingDelayStatInBlocks.avr,
        txStat.mintingDelayStatInBlocks.min,
        txStat.mintingDelayStatInBlocks.max,
        txStat.mintingDelayStatInBlocks.std,
      ],
      [
        "Minting delay in milliseconds:",
        txStat.mintingDelayStatInMilliseconds.avr,
        txStat.mintingDelayStatInMilliseconds.min,
        txStat.mintingDelayStatInMilliseconds.max,
        txStat.mintingDelayStatInMilliseconds.std,
      ],
    ];
    for (let i = 0; i < txStat.mintedTxCountPerBlockRelativeToTheSendingBlock.length; ++i) {
      contentArray.push([
        "Minted tx count in relative block " + i, txStat.mintedTxCountPerBlockRelativeToTheSendingBlock[i]
      ]);
    }
    const content: string = stringify(contentArray, this.stringifyOptions);
    const filePath = this.#createFilePath(context.config.outTxStatFileName, context);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  storeBlocks(blockResults: BlockResult[], context: Context): string {
    if (!context.config.outBlocksFileName || context.config.outBlocksFileName.length === 0) {
      return "";
    }
    if (!fs.existsSync(this.resultsPath)) {
      this.makeResultsDir();
    }
    let content = this.#makeBlocksFileHeader();
    for (let i = 0; i < blockResults.length; ++i) {
      content += this.#makeBlocksFileRow(i, blockResults[i]);
    }
    const filePath = this.#createFilePath(context.config.outBlocksFileName, context);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  #createFilePath(fileName: string, context: Context) {
    const dateString = this.#formatDate(new Date());
    let filePath: string = path.normalize(
      this.resultsPath + "/" + fileName + "_" + context.config.outFilesSuffix + "_" + dateString + ".csv"
    );
    while (fs.existsSync(filePath)) {
      waitSync(1);
      const dateString = this.#formatDate(new Date());
      filePath = path.normalize(this.resultsPath + "/" + fileName + `_${dateString}.csv`);
    }
    return filePath;
  }

  #formatDate(date: Date) {
    return date.getFullYear() +
      "-" + ("0" + (date.getMonth() + 1)).slice(-2) +
      "-" + ("0" + date.getDate()).slice(-2) +
      "_" + ("0" + date.getHours()).slice(-2) +
      "-" + ("0" + date.getMinutes()).slice(-2) +
      "-" + ("0" + date.getSeconds()).slice(-2) +
      "_" + ("00" + date.getMilliseconds()).slice(-3);
  }

  #makeTxsFileHeader(): string {
    return stringify(
      [[
        "index",                   // 01
        "hash",                    // 02
        "sending block number",    // 03
        "sending timestamp",       // 04
        "minting delay in blocks", // 05
        "minting delay in ms",     // 06
        "from",                    // 07
        "to",                      // 08
        "nonce",                   // 09
        "type",                    // 10
        "gas price or max fee",    // 11
        "gas limit",               // 12
        "value",                   // 13
        "data"                     // 14
      ]],
      this.stringifyOptions,
    );
  }

  #makeTxsFileRow(index: number, txResult: TransactionResult | undefined | null): string {
    if (!txResult) {
      return stringify([index], this.stringifyOptions);
    }
    const tx: TransactionSigned = txResult.txRequest;
    return stringify([[
      index,                                                                                              // 01
      tx.hash,                                                                                            // 02
      txResult.blockNumberSending,                                                                        // 03
      txResult.timestampAfterSending,                                                                     // 04
      !txResult.blockNumberMining ? "???" : (txResult.blockNumberMining - txResult.blockNumberSending),   // 05
      !txResult.timestampMinting ? "??? " : (txResult.timestampMinting - txResult.timestampAfterSending), // 06
      tx.from,                                                                                            // 07
      tx.to,                                                                                              // 08
      tx.nonce,                                                                                           // 09
      tx.type,                                                                                            // 10
      ((!tx.type || tx.type < 2) ? tx.gasPrice : tx.maxFeePerGas),                                        // 11
      tx.gasLimit,                                                                                        // 12
      tx.value,                                                                                           // 13
      tx.data                                                                                             // 14
    ]], this.stringifyOptions);
  }

  #makeBlocksFileHeader(): string {
    return stringify(
      [[
        "relative index",      // 01
        "number",              // 02
        "timestamp in ms",     // 03
        "count of all txs",    // 04
        "count of target txs", // 05
        "gas limit",           // 06
        "gas used",            // 07
        "size",                // 08
        "hash",                // 09
        "miner",               // 10
      ]],
      this.stringifyOptions,
    );
  }

  #makeBlocksFileRow(index: number, blockResult: BlockResult): string {
    return stringify([[
      index,                          // 01
      blockResult.number,             // 02
      blockResult.timestamp,          // 03
      blockResult.countOfAllTxs,      // 04
      blockResult.countOfTargetTxs,   // 05
      blockResult.gasLimit,           // 06
      blockResult.gasUsed,            // 07
      blockResult.size,               // 08
      blockResult.hash,               // 09
      blockResult.miner,              // 10
    ]], this.stringifyOptions);
  }
}

export const storage: Storage = new Storage();