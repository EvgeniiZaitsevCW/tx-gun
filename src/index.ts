import { Context } from "./context";
import { waitSuitableMilliseconds } from "./utils";
import { BlockResult, Config, InputParams, TransactionStatistics, TX_KIND_COMMON } from "./types";
import { sendTransactions } from "./sender";
import { Logger } from "./logger";
import { awaitTransactionMinting, prepareBlockResults, prepareTxStatistics } from "./analyzer";
import { storage } from "./storage";

// Script input parameters
const rpcUrlForSending: string = process.env.SP_RPC_URL_FOR_SENDING ?? "http://localhost:8333";
const inputParams: InputParams = {
  rpcUrlForSending: rpcUrlForSending,
  rpcUrlForReading: process.env.SP_RPC_URL_FOR_READING ?? rpcUrlForSending,
  fromPrivateKey: process.env.SP_FROM_PRIVATE_KEY ?? "2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  txKind: process.env.SP_TX_KIND ?? "common", // allowed values: "common", "erc20-transfer", "pix-cash-in",
  contractAddress: process.env.SP_CONTRACT_ADDRESS ?? "0x541F23C66D131B7d35214401AEC745d7aBB07561",
  isToAddressStatic: (process.env.SP_IS_TO_ADDRESS_STATIC ?? "true") === "true",
  toStaticAddress: process.env.SP_TO_STATIC_ADDRESS ?? "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  sentEthValue: BigInt(process.env.SP_SENT_ETH_VALUE ?? "0"),
  sentAmount: BigInt(process.env.SP_SENT_AMOUNT ?? "1"),
  isDataFieldStatic: (process.env.SP_IS_DATA_FIELD_STATIC ?? "false") === "true",
  rndDataFieldSize: parseInt(process.env.SP_RND_DATA_FIELD_SIZE ?? "0"),
  staticDataFieldValue: process.env.SP_STATIC_DATA_FIELD_VALUE ?? "0xe3541348000000000000000000000000b2ca5b3d9b1b272f2b86462bbb449dde3b6841ca00000000000000000000000000000000000000000000000000000000068b6a40e000000002023030720070133621578800000000000000000000000000000000",
  isLegacyTx: (process.env.SP_IS_LEGACY_TX ?? "true") === "true",
  autoGasPrice: (process.env.SP_AUTO_GAS_PRICE ?? "true") === "true",
  autoGasPriceCoefInPpm: parseInt(process.env.SP_AUTO_GAS_PRICE_COEF_IN_PPM ?? "1000000"),
  gasPrice: BigInt(process.env.SP_GAS_PRICE ?? "1"),
  autoGasLimit: (process.env.SP_AUTO_GAS_LIMIT ?? "true") === "true",
  autoGasLimitCoefInPpm: parseInt(process.env.SP_AUTO_GAS_LIMIT_COEF_IN_PPM ?? "1000000"),
  gasLimit: BigInt(process.env.SP_GAS_LIMIT ?? "1"),
  txsPerSecondRate: parseInt(process.env.SP_TXS_PER_SECOND_RATE ?? "3"),
  sendingDurationInSeconds: parseInt(process.env.SP_SENDING_DURATION_IN_SECONDS ?? "5"),
  millisecondsOfStart: process.env.SP_MILLISECONDS_OF_START ?? "0000",
  rpcBatchMaxSize: parseInt(process.env.SP_RPC_BATCH_MAX_SIZE ?? "1000000"),
  pauseBeforeNextBatch: parseInt(process.env.SP_PAUSE_BEFORE_NEXT_BATCH ?? "0"),
  awaitTxsMinting: (process.env.SP_AWAIT_TXS_MINTING ?? "true") === "true",
  txsMintingTimeoutInSeconds: parseInt(process.env.SP_TXS_MINTING_TIMEOUT_IN_SECONDS ?? "60"),
  blockFetchingErrorCountLimit: parseInt(process.env.SP_BLOCK_FETCHING_ERROR_COUNT_LIMIT ?? "10"),
  outTxsFileName: process.env.SP_OUT_TXS_FILE_NAME ?? "out_txs",
  outBlocksFileName: process.env.SP_OUT_BlOCKS_FILE_NAME ?? "out_blocks",
  outTxStatFileName: process.env.SP_OUT_TX_STAT_FILE_NAME ?? "out_tx_stat",
  outFilesSuffix: process.env.SP_OUT_FILES_SUFFIX ?? "net-local",
};

const config: Config = {
  targetSendingIntervalInMilliseconds: 1000,
  allowedSendingIntervalInMilliseconds: 850,
  dataFieldSize: inputParams.isDataFieldStatic
    ? inputParams.staticDataFieldValue.length - 2
    : inputParams.rndDataFieldSize,
  ...inputParams,
};

const context: Context = new Context(config);
const logSingleLevelIndent = "  ";
const logger: Logger = new Logger(logSingleLevelIndent);

function logConfig() {
  logger.log("👉 The RPC URL for sending:", config.rpcUrlForSending);
  logger.log("👉 The RPC URL for reading:", config.rpcUrlForReading);
  logger.log("👉 The address 'from':", context.wallet.address);
  logger.log("👉 The tx kind:", config.txKind);
  if (config.txKind !== TX_KIND_COMMON) {
    logger.log("👉 The contract address:", config.contractAddress);
  }
  logger.log("👉 Is to address static:", config.isToAddressStatic);
  if (config.isToAddressStatic) {
    logger.log("👉 The static address 'to':", config.toStaticAddress);
  }
  if (config.txKind !== TX_KIND_COMMON) {
    logger.log("👉 The sent amount for the contract call:", config.sentAmount);
  } else {
    logger.log("👉 The sent ETH value:", config.sentEthValue);
    logger.log("👉 Is data field static:", config.isDataFieldStatic);
    logger.log("👉 The data field size in bytes:", config.dataFieldSize);
  }
  logger.log("👉 Is legacy transactions:", config.isLegacyTx);
  logger.log("👉 Define gas price automatically:", config.autoGasPrice);
  if (!config.autoGasPrice) {
    logger.log("👉 The static gas price:", config.gasPrice);
  }
  logger.log("👉 Define gas limit automatically:", config.autoGasLimit);
  if (!config.autoGasLimit) {
    logger.log("👉 The static gas limit:", config.gasLimit);
  }
  logger.log("👉 The milliseconds of start:", config.millisecondsOfStart);
  logger.log("👉 The RPC batch max size:", config.rpcBatchMaxSize);
  logger.log("👉 The pause before next RPC batch in milliseconds:", config.pauseBeforeNextBatch);
  logger.log("👉 Await transactions minting:", config.awaitTxsMinting);
  logger.log("👉 The transactions minting timeout in seconds:", config.txsMintingTimeoutInSeconds);
  logger.log("👉 The txs per second rate:", config.txsPerSecondRate);
  logger.log("👉 The sending duration in second:", config.sendingDurationInSeconds);
  logger.log("👉 The total tx number:", context.txTotal);
}

async function main() {
  logger.log(`🏁 Send ETH ...`);

  context.checkConfig();
  context.initProvider();
  context.initWallet();
  context.initTxTotal();
  logger.increaseLogIndent();

  logConfig();
  logger.logEmptyLine();

  logger.log("🏁 Getting the transaction count (next nonce) of the 'from' address ...");
  const nonce = await context.provider.getTransactionCount(context.wallet.address);
  logger.log("✅ The transaction count has been gotten successfully");
  logger.log("👉 The transaction count (next nonce):", nonce);
  logger.logEmptyLine();

  logger.log("🏁 Preparing signed transactions ...");
  await context.initTxs(nonce, context.txTotal);
  logger.log(`✅ Transactions have been prepared successfully. Number: ${context.txs.length}`);
  logger.logEmptyLine();

  logger.log("🏁 Sending signed transactions ...");
  logger.increaseLogIndent();

  await context.initStartUpBlockNumber();
  logger.log("👉 The current block is:", context.startUpBlockNumber);

  logger.log(`🏁 Waiting for appropriate milliseconds to start ...`);
  await waitSuitableMilliseconds(context.config.millisecondsOfStart);
  logger.log("✅ The appropriate milliseconds has been reached");

  await sendTransactions(context, logger);

  logger.decreaseLogIndent();
  logger.log(
    `✅ The sending has been finished successfully. ` +
    `The first block of sending: ${context.firstSendingBlockNumber}. ` +
    `Total tx number: ${context.sentTxCount}`
  );
  logger.logEmptyLine();

  context.initTxResults();

  if (config.awaitTxsMinting) {
    logger.log(`🏁 Awaiting for the transaction minting by block data requesting ...`);
    logger.increaseLogIndent();
    const remainingHashes: Set<string> = await awaitTransactionMinting(context, logger);
    logger.decreaseLogIndent();
    if (remainingHashes.size > 0) {
      logger.log(
        `❌ The transaction minting timeout has expired. The number of remaining transactions:`,
        remainingHashes.size
      );
    } else {
      logger.log(`✅ All the transactions has been minted successfully.`);
    }
    logger.decreaseLogIndent();
  }
  logger.logEmptyLine();

  const transactionStatistics: TransactionStatistics = prepareTxStatistics(context);

  if (context.config.outTxsFileName.length > 0) {
    logger.log(`🏁 Storing the transactions data to file ...`);
    const filePath = storage.storeTxs(context);
    logger.log(`✅ The transactions has been stored successfully. File path: `, filePath);
    logger.logEmptyLine();
  }

  if (context.config.outTxStatFileName.length > 0) {
    logger.log(`🏁 Storing the statistics about the transactions to file ...`);
    const filePath = storage.storeTxStatistics(transactionStatistics, context);
    logger.log(`✅ The statistics has been stored successfully. File path: `, filePath);
    logger.logEmptyLine();
  }

  if (context.config.awaitTxsMinting && context.config.outBlocksFileName.length > 0) {
    logger.log(`🏁 Collecting and storing the blocks data to file ...`);
    const blockResults: BlockResult[] = prepareBlockResults(context);
    const filePath = storage.storeBlocks(blockResults, context);
    logger.log(`✅ The statistics has been stored successfully. File path: `, filePath);
    logger.logEmptyLine();
  }

  logger.log("🎉 Everything is done. Transaction statistics:", transactionStatistics);
}

main().then().catch(err => {
  throw err;
});